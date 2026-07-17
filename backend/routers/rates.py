from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.enums import RateTypeEnum
from models.rate_table import RateTableEntry
from .deps import get_admin_user

router = APIRouter()


class RateEntryCreate(BaseModel):
    worker_id: Optional[UUID] = None
    pay_tier: Optional[str] = None
    rate_type: RateTypeEnum = RateTypeEnum.hourly
    amount: Decimal
    currency: str
    effective_from: date
    effective_to: Optional[date] = None
    change_reason: str


class RateEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    worker_id: Optional[UUID] = None
    pay_tier: Optional[str] = None
    rate_type: RateTypeEnum
    amount: Decimal
    currency: str
    effective_from: date
    effective_to: Optional[date] = None
    change_reason: str
    created_at: datetime


@router.get("", response_model=list[RateEntryResponse])
def list_rates(
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(RateTableEntry)
    if worker_id:
        stmt = stmt.where(RateTableEntry.worker_id == worker_id)
    return db.exec(stmt.order_by(RateTableEntry.effective_from.desc()).limit(500)).all()


@router.post("", response_model=RateEntryResponse, status_code=status.HTTP_201_CREATED)
def create_rate(
    body: RateEntryCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if not body.worker_id and not body.pay_tier:
        raise HTTPException(status_code=400, detail="Set a worker or a pay tier for this rate.")
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive.")
    if not body.change_reason.strip():
        raise HTTPException(status_code=400, detail="A change reason is required.")

    admin = get_admin_user(db, current_user)

    # Close out the previous open-ended rate for the same worker/tier.
    stmt = select(RateTableEntry).where(RateTableEntry.effective_to.is_(None))
    if body.worker_id:
        stmt = stmt.where(RateTableEntry.worker_id == body.worker_id)
    else:
        stmt = stmt.where(
            RateTableEntry.worker_id.is_(None),
            RateTableEntry.pay_tier == body.pay_tier,
        )
    for prev in db.exec(stmt).all():
        if prev.effective_from < body.effective_from:
            prev.effective_to = body.effective_from
            db.add(prev)

    entry = RateTableEntry(
        worker_id=body.worker_id,
        pay_tier=body.pay_tier,
        rate_type=body.rate_type,
        amount=body.amount,
        currency=body.currency.upper()[:3],
        effective_from=body.effective_from,
        effective_to=body.effective_to,
        change_reason=body.change_reason.strip(),
        approved_by=admin.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
