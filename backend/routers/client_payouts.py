"""
Client payouts (/client-payouts): one row per client per month.

Shares come from the client ledger. Approving the month prepares the payouts
and freezes the exchange rate; from here statements are emailed and payments
are recorded with a reference.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client
from models.enums import PayrollPeriodStatusEnum
from models.payroll import PayrollPeriod
from services import client_billing, client_payouts
from services.audit_service import record_audit
from .deps import get_admin_user

router = APIRouter()


def _period(db: Session, period_id: UUID) -> PayrollPeriod:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work month not found")
    return period


def _payout(db: Session, payout_id: UUID):
    try:
        return client_payouts.get_payout(db, payout_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


def _status(period: PayrollPeriod) -> str:
    return period.status.value if hasattr(period.status, "value") else str(period.status)


def _sheet(db: Session, period: PayrollPeriod) -> dict:
    ready = client_payouts.is_ready(period)
    if ready and period.status != PayrollPeriodStatusEnum.paid:
        client_payouts.prepare(db, period)
        db.commit()
    months = client_billing.build(db, period)
    payouts = client_payouts.payouts_for(db, period.id)
    clients = {c.id: c for c in db.exec(select(Client)).all()}

    rows = []
    for m in months:
        p = payouts.get(m.client_id)
        if p is None and m.client_share == 0:
            continue
        client = clients[m.client_id]
        if p is not None:
            fx, amount_usd, amount_local = p.fx_rate, p.amount_usd, p.amount_local
        else:
            fx = client_payouts.payout_fx(db, m.payout_currency, live=False)
            amount_usd = m.client_share
            amount_local = client_payouts._q(m.client_share * fx) if fx else None
        rows.append({
            "client_id": str(m.client_id),
            "client_name": m.client_name,
            "platform": m.platform,
            "payout_id": str(p.id) if p else None,
            "status": p.status if p else "not_prepared",
            "currency": p.currency if p else m.payout_currency,
            "fx_rate": str(fx) if fx is not None else None,
            "fx_frozen": p is not None and p.fx_rate is not None,
            "amount_usd": str(amount_usd),
            "amount_local": str(amount_local) if amount_local is not None else None,
            "sent_at": p.sent_at.isoformat() if p and p.sent_at else None,
            "paid_at": p.paid_at.isoformat() if p and p.paid_at else None,
            "reference": p.reference if p else None,
            "payout_email": client.payout_email,
            "payout_method": client.payout_method,
            "payout_details": client.payout_details,
            "billed_hours": str(m.billed_hours) if m.billed_hours is not None else None,
            "basis": str(m.basis),
            "client_pct": str(m.client_pct),
            "client_costs": str(m.client_costs),
            "client_share": str(m.client_share),
            "warnings": m.warnings,
        })
    return {
        "period_id": str(period.id),
        "period_label": period.label,
        "status": _status(period),
        "ready": ready,
        "rows": rows,
        "totals": client_payouts.totals(payouts.values()),
    }


@router.get("/periods/{period_id}")
def get_client_payouts(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return _sheet(db, _period(db, period_id))


@router.post("/periods/{period_id}/prepare")
def prepare_payouts(
    period_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Rebuild unpaid payouts from the ledger and refresh their exchange rates."""
    period = _period(db, period_id)
    if not client_payouts.is_ready(period):
        raise HTTPException(status_code=400, detail="Approve the month before preparing client payouts.")
    admin = get_admin_user(db, current_user)
    result = client_payouts.prepare(db, period, refresh_fx=True)
    record_audit(
        db, actor_id=admin.id, action="client_payout.prepared", target_type="client_payout",
        target_id=period.id, new_value={"period": period.label, **result},
    )
    db.commit()
    return {**_sheet(db, period), "result": result}


class RateBody(BaseModel):
    fx_rate: Decimal = Field(gt=0)


@router.put("/payouts/{payout_id}/rate")
def set_payout_rate(
    payout_id: UUID,
    body: RateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    payout, period, client = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    old = payout.fx_rate
    try:
        client_payouts.set_rate(db, payout, period, body.fx_rate)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(
        db, actor_id=admin.id, action="client_payout.rate_set", target_type="client_payout", target_id=payout.id,
        previous_value={"client": client.name, "fx_rate": str(old) if old is not None else None},
        new_value={"client": client.name, "period": period.label, "fx_rate": str(body.fx_rate)},
    )
    db.commit()
    return _sheet(db, period)


@router.get("/payouts/{payout_id}/statement")
def download_statement(
    payout_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    payout, period, client = _payout(db, payout_id)
    filename, pdf = client_payouts.render_statement(db, payout, period, client)
    db.commit()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class SendBody(BaseModel):
    to_email: Optional[str] = None


def _send_one(db: Session, payout_id: UUID, actor_id, to_email: Optional[str] = None) -> tuple[bool, Optional[str], str]:
    payout, period, client = _payout(db, payout_id)
    try:
        ok, error = client_payouts.send_statement(db, payout, period, client, to_email=to_email)
    except client_payouts.PayoutError as exc:
        return False, str(exc), client.name
    if ok:
        record_audit(
            db, actor_id=actor_id, action="client_payout.sent", target_type="client_payout", target_id=payout.id,
            new_value={"client": client.name, "period": period.label, "to": to_email or client.payout_email},
        )
        db.commit()
    return ok, error, client.name


@router.post("/payouts/{payout_id}/send")
def send_statement(
    payout_id: UUID,
    body: SendBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    ok, error, _name = _send_one(db, payout_id, admin.id, body.to_email)
    if not ok:
        raise HTTPException(status_code=400, detail=error or "The statement could not be sent.")
    _, period, _client = _payout(db, payout_id)
    return _sheet(db, period)


class SendManyBody(BaseModel):
    payout_ids: list[UUID] = Field(min_length=1)


@router.post("/periods/{period_id}/send")
def send_statements(
    period_id: UUID,
    body: SendManyBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period(db, period_id)
    admin = get_admin_user(db, current_user)
    sent, failed = 0, []
    for pid in dict.fromkeys(body.payout_ids):
        ok, error, name = _send_one(db, pid, admin.id)
        if ok:
            sent += 1
        else:
            failed.append({"client": name, "error": error})
    return {**_sheet(db, period), "sent": sent, "failed": failed}


class PaidBody(BaseModel):
    reference: Optional[str] = Field(default=None, max_length=255)
    paid_at: Optional[datetime] = None


@router.post("/payouts/{payout_id}/paid")
def mark_payout_paid(
    payout_id: UUID,
    body: PaidBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    payout, period, client = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    try:
        client_payouts.mark_paid(db, payout, period, reference=body.reference, actor_id=admin.id, paid_at=body.paid_at)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    client_payouts.render_statement(db, payout, period, client)
    record_audit(
        db, actor_id=admin.id, action="client_payout.paid", target_type="client_payout", target_id=payout.id,
        new_value={
            "client": client.name, "period": period.label, "reference": payout.reference,
            "amount": f"{payout.amount_local} {payout.currency}",
        },
    )
    db.commit()
    return _sheet(db, period)


@router.post("/payouts/{payout_id}/unpaid")
def undo_payout_paid(
    payout_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    payout, period, client = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    reference = payout.reference
    try:
        client_payouts.undo_paid(db, payout, period)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(
        db, actor_id=admin.id, action="client_payout.unpaid", target_type="client_payout", target_id=payout.id,
        previous_value={"client": client.name, "period": period.label, "reference": reference},
    )
    db.commit()
    return _sheet(db, period)
