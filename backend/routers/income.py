"""
Income (/income): money received in a working month, by category.

Client-account payouts linked to a client are that client's revenue on the
ledger. The month's total is the income pool shown on the month summary.
"""
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client
from models.enums import PayrollPeriodStatusEnum
from models.income import IncomeEntry
from models.payroll import PayrollPeriod
from services import income
from services.audit_service import record_audit
from .deps import get_admin_user

router = APIRouter()


class EntryBody(BaseModel):
    category: Optional[str] = None
    amount: Optional[Decimal] = Field(default=None, ge=0)
    currency: Optional[str] = Field(default=None, max_length=3)
    fx_rate: Optional[Decimal] = Field(default=None, gt=0)
    description: Optional[str] = None
    client_id: Optional[UUID] = None
    received_on: Optional[date] = None


def _period(db: Session, period_id: UUID) -> PayrollPeriod:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work month not found")
    return period


def _entry(db: Session, entry_id: UUID) -> tuple[IncomeEntry, PayrollPeriod]:
    entry = db.get(IncomeEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Income entry not found")
    return entry, _period(db, entry.payroll_period_id)


def _sheet(db: Session, period: PayrollPeriod) -> dict:
    entries = income.entries_for(db, period.id)
    names = {c.id: c.name for c in db.exec(select(Client)).all()}
    return {
        "period_id": str(period.id),
        "period_label": period.label,
        "status": period.status.value if hasattr(period.status, "value") else str(period.status),
        "locked": period.status == PayrollPeriodStatusEnum.paid,
        "categories": income.CATEGORY_LABELS,
        "entries": [income.to_dict(e, names) for e in entries],
        "totals": income.totals(entries),
    }


@router.get("/periods/{period_id}")
def get_income(period_id: UUID, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    return _sheet(db, _period(db, period_id))


@router.post("/periods/{period_id}", status_code=status.HTTP_201_CREATED)
def add_income(
    period_id: UUID, body: EntryBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin),
):
    period = _period(db, period_id)
    admin = get_admin_user(db, current_user)
    if body.amount is None:
        raise HTTPException(status_code=400, detail="Enter the amount received.")
    if body.client_id is not None and db.get(Client, body.client_id) is None:
        raise HTTPException(status_code=404, detail="Client not found")
    try:
        entry = income.create(
            db, period, category=body.category or "", amount=body.amount, currency=body.currency or "USD",
            description=body.description, client_id=body.client_id, received_on=body.received_on,
            fx_rate=body.fx_rate, actor_id=admin.id,
        )
    except income.IncomeError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(db, actor_id=admin.id, action="income.created", target_type="income_entry", target_id=entry.id,
                 new_value={"period": period.label, **income.to_dict(entry)})
    db.commit()
    return _sheet(db, period)


@router.patch("/entries/{entry_id}")
def edit_income(
    entry_id: UUID, body: EntryBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin),
):
    entry, period = _entry(db, entry_id)
    admin = get_admin_user(db, current_user)
    before = income.to_dict(entry)
    fields = {k: getattr(body, k) for k in body.model_fields_set}
    if "amount" in fields and fields["amount"] is None:
        raise HTTPException(status_code=400, detail="Enter the amount received.")
    try:
        income.update(db, period, entry, fields)
    except income.IncomeError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(db, actor_id=admin.id, action="income.updated", target_type="income_entry", target_id=entry.id,
                 previous_value=before, new_value={"period": period.label, **income.to_dict(entry)})
    db.commit()
    return _sheet(db, period)


@router.delete("/entries/{entry_id}")
def delete_income(entry_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    entry, period = _entry(db, entry_id)
    admin = get_admin_user(db, current_user)
    before = income.to_dict(entry)
    try:
        income.delete(db, period, entry)
    except income.IncomeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(db, actor_id=admin.id, action="income.deleted", target_type="income_entry", target_id=entry_id,
                 previous_value={"period": period.label, **before})
    db.commit()
    return _sheet(db, period)
