from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, or_, select

from core.database import get_db
from core.permissions import require_admin
from models.enums import RateTypeEnum, WorkerStatusEnum, WorkerTypeEnum
from models.payment_tier import PaymentTier, hourly_equivalent
from models.rate_table import RateTableEntry
from models.worker import Worker
from schemas.payment_tier import (
    PaymentTierAssignRequest,
    PaymentTierAssignResponse,
    PaymentTierCreate,
    PaymentTierResponse,
    PaymentTierUpdate,
)
from .deps import get_admin_user

router = APIRouter()


def _tier_response(tier: PaymentTier) -> PaymentTierResponse:
    resp = PaymentTierResponse.model_validate(tier)
    resp.hourly_equivalent = hourly_equivalent(tier.rate, tier.unit)
    return resp


def _sync_rate_table(db: Session, tier: PaymentTier, admin_id: UUID) -> None:
    """Upsert an open-ended tier-level rate_table_entries row for payroll calc."""
    amount = hourly_equivalent(tier.rate, tier.unit)
    today = date.today()
    open_rows = db.exec(
        select(RateTableEntry).where(
            RateTableEntry.worker_id.is_(None),
            RateTableEntry.pay_tier == tier.name,
            RateTableEntry.effective_to.is_(None),
        )
    ).all()
    for prev in open_rows:
        if prev.effective_from < today:
            prev.effective_to = today
            db.add(prev)
        elif prev.effective_from == today:
            prev.amount = amount
            prev.currency = tier.currency.upper()[:3]
            prev.rate_type = RateTypeEnum.hourly
            prev.change_reason = f"payment_tier sync: {tier.name}"
            prev.approved_by = admin_id
            db.add(prev)
            return

    db.add(
        RateTableEntry(
            worker_id=None,
            pay_tier=tier.name,
            rate_type=RateTypeEnum.hourly,
            amount=amount,
            currency=tier.currency.upper()[:3],
            effective_from=today,
            effective_to=None,
            change_reason=f"payment_tier sync: {tier.name}",
            approved_by=admin_id,
        )
    )


@router.get("", response_model=list[PaymentTierResponse])
def list_payment_tiers(
    active_only: bool = Query(False),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(PaymentTier).order_by(PaymentTier.name)
    if active_only:
        stmt = stmt.where(PaymentTier.is_active.is_(True))
    return [_tier_response(t) for t in db.exec(stmt).all()]


@router.post("", response_model=PaymentTierResponse, status_code=status.HTTP_201_CREATED)
def create_payment_tier(
    body: PaymentTierCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tier name is required.")
    if body.rate <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive.")
    existing = db.exec(select(PaymentTier).where(PaymentTier.name == name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="A payment tier with this name already exists.")

    admin = get_admin_user(db, current_user)
    tier = PaymentTier(
        name=name,
        currency=body.currency.upper()[:3],
        rate=body.rate,
        unit=body.unit,
        description=body.description,
        is_active=body.is_active,
    )
    db.add(tier)
    db.flush()
    _sync_rate_table(db, tier, admin.id)
    db.commit()
    db.refresh(tier)
    return _tier_response(tier)


@router.patch("/{tier_id}", response_model=PaymentTierResponse)
def update_payment_tier(
    tier_id: UUID,
    body: PaymentTierUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    tier = db.get(PaymentTier, tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Payment tier not found")

    old_name = tier.name
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        data["name"] = str(data["name"]).strip()
        clash = db.exec(
            select(PaymentTier).where(PaymentTier.name == data["name"], PaymentTier.id != tier_id)
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail="A payment tier with this name already exists.")
    if "currency" in data and data["currency"]:
        data["currency"] = str(data["currency"]).upper()[:3]
    if "rate" in data and data["rate"] is not None and data["rate"] <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive.")

    for key, value in data.items():
        setattr(tier, key, value)
    tier.updated_at = datetime.now(timezone.utc)
    db.add(tier)

    if tier.name != old_name:
        for w in db.exec(select(Worker).where(Worker.pay_tier == old_name)).all():
            w.pay_tier = tier.name
            db.add(w)

    admin = get_admin_user(db, current_user)
    if tier.is_active:
        _sync_rate_table(db, tier, admin.id)
    db.commit()
    db.refresh(tier)
    return _tier_response(tier)


@router.post("/{tier_id}/assign", response_model=PaymentTierAssignResponse)
def assign_payment_tier(
    tier_id: UUID,
    body: PaymentTierAssignRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    tier = db.get(PaymentTier, tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Payment tier not found")
    if not tier.is_active:
        raise HTTPException(status_code=400, detail="Cannot assign an inactive tier.")

    stmt = select(Worker).where(Worker.status == WorkerStatusEnum.active)
    if body.worker_ids:
        stmt = stmt.where(Worker.id.in_(body.worker_ids))
    elif body.apply_all_active:
        pass
    elif body.worker_type or body.partner_entity_id or body.search:
        pass
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide worker_ids, a filter, or apply_all_active.",
        )

    if body.worker_type:
        stmt = stmt.where(Worker.worker_type == body.worker_type)
    if body.partner_entity_id:
        stmt = stmt.where(
            Worker.worker_type == WorkerTypeEnum.partner_worker,
            Worker.partner_entity_id == body.partner_entity_id,
        )
    if body.search:
        q = f"%{body.search.strip()}%"
        stmt = stmt.where(
            or_(
                Worker.display_name.ilike(q),
                Worker.country.ilike(q),
                Worker.pay_tier.ilike(q),
            )
        )

    workers = db.exec(stmt).all()
    for w in workers:
        w.pay_tier = tier.name
        db.add(w)
    db.commit()
    return PaymentTierAssignResponse(assigned=len(workers), tier_name=tier.name)
