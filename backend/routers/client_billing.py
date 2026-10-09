"""
Client ledger (/client-billing): each client's month in one row.

Billed hours, rate, expected and received income, client % and costs, and the
split worked out from them (services.client_billing). Edits apply to one
client or to many at once.
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
from models.payroll import PayrollPeriod
from services import client_billing, month_overview
from services.audit_service import record_audit
from .deps import get_admin_user

router = APIRouter()


class MonthEdit(BaseModel):
    """Only the fields sent are changed; send null to clear a figure."""
    actual: Optional[Decimal] = Field(default=None, ge=0)
    received_on: Optional[date] = None
    billed_hours_manual: Optional[Decimal] = Field(default=None, ge=0)
    client_costs: Optional[Decimal] = Field(default=None, ge=0)
    notes: Optional[str] = None
    hours_from_desktops: Optional[bool] = None
    client_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    rate: Optional[Decimal] = Field(default=None, ge=0)


class BulkEdit(MonthEdit):
    client_ids: list[UUID] = Field(min_length=1)


def _period(db: Session, period_id: UUID) -> PayrollPeriod:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work month not found")
    return period


def _sheet(db: Session, period: PayrollPeriod) -> dict:
    months = client_billing.build(db, period)
    return {
        "period_id": str(period.id),
        "period_label": period.label,
        "status": period.status.value if hasattr(period.status, "value") else str(period.status),
        "currency": client_billing.BILLING_CURRENCY,
        "rows": [m.to_dict() for m in months],
        "totals": client_billing.totals(months),
    }


@router.get("/periods/{period_id}")
def get_client_ledger(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return _sheet(db, _period(db, period_id))


@router.get("/periods/{period_id}/overview")
def get_month_overview(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """The month-end checklist, money KPIs and per-client figures for one month."""
    return month_overview.build(db, _period(db, period_id))


class RowEdit(MonthEdit):
    client_id: UUID


class RowsEdit(BaseModel):
    rows: list[RowEdit] = Field(min_length=1)


def _fields(body: MonthEdit) -> dict:
    return {k: getattr(body, k) for k in body.model_fields_set if k in MonthEdit.model_fields}


def _apply(db: Session, period: PayrollPeriod, edits: dict[UUID, dict], actor_id) -> None:
    edits = {cid: f for cid, f in edits.items() if f}
    if not edits:
        raise HTTPException(status_code=400, detail="Nothing to change.")
    client_ids = list(edits)
    clients = {c.id: c for c in db.exec(select(Client).where(Client.id.in_(client_ids))).all()}
    missing = [str(cid) for cid in client_ids if cid not in clients]
    if missing:
        raise HTTPException(status_code=404, detail=f"Client not found: {', '.join(missing)}")
    before = {m.client_id: m for m in client_billing.build(db, period, client_ids)}
    try:
        for cid, fields in edits.items():
            client_billing.update_month(db, period, clients[cid], **fields)
    except client_billing.BillingError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400, detail=f"{clients[cid].name}: {exc}" if len(edits) > 1 else str(exc),
        ) from exc
    after = client_billing.build(db, period, client_ids)
    client_billing.snapshot(db, period, after)
    for m in after:
        old = before.get(m.client_id)
        record_audit(
            db, actor_id=actor_id, action="client_billing.updated", target_type="client", target_id=m.client_id,
            previous_value={"period": period.label, "basis": str(old.basis), "client_share": str(old.client_share)}
            if old else None,
            new_value={"period": period.label, **{k: str(v) for k, v in edits[m.client_id].items()},
                       "basis": str(m.basis), "client_share": str(m.client_share)},
        )
    db.commit()


@router.patch("/periods/{period_id}/clients/{client_id}")
def update_client_month(
    period_id: UUID,
    client_id: UUID,
    body: MonthEdit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period(db, period_id)
    admin = get_admin_user(db, current_user)
    _apply(db, period, {client_id: _fields(body)}, admin.id)
    return _sheet(db, period)


@router.put("/periods/{period_id}/rows")
def save_rows(
    period_id: UUID,
    body: RowsEdit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Save the sheet: each row carries only the fields that changed."""
    period = _period(db, period_id)
    admin = get_admin_user(db, current_user)
    _apply(db, period, {row.client_id: _fields(row) for row in body.rows}, admin.id)
    return _sheet(db, period)


@router.post("/periods/{period_id}/bulk")
def bulk_update(
    period_id: UUID,
    body: BulkEdit,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Apply the same change to many clients (e.g. client %, costs, the desktop-hours switch)."""
    period = _period(db, period_id)
    admin = get_admin_user(db, current_user)
    fields = _fields(body)
    _apply(db, period, {cid: dict(fields) for cid in dict.fromkeys(body.client_ids)}, admin.id)
    return _sheet(db, period)
