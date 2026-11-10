"""
Payee payouts (/client-payouts): one row per payee per month, with a line per client.

Amounts come from the recipients on each client's split. Approving the month
prepares the payouts and freezes the exchange rate; from here combined
statements are emailed and payments are recorded with a reference. Months paid
in the earlier per-client format are listed read-only under `legacy`.
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
from models.client import Client, Payee
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
    payees = {p.id: p for p in db.exec(select(Payee)).all()}
    clients = {c.id: c.name for c in db.exec(select(Client)).all()}
    payouts = client_payouts.payouts_for(db, period.id)
    saved_lines = client_payouts.lines_for(db, [p.id for p in payouts.values()])
    planned = client_payouts.payee_amounts(months)

    rows = []
    for payee_id in dict.fromkeys([*payouts, *planned]):
        payee = payees.get(payee_id)
        if payee is None:
            continue
        p = payouts.get(payee_id)
        if p is not None:
            lines = [(l.client_id, Decimal(l.pct), Decimal(l.amount_usd)) for l in saved_lines.get(p.id, [])]
            fx, amount_usd, amount_local = p.fx_rate, Decimal(p.amount_usd), p.amount_local
        else:
            lines = planned.get(payee_id, [])
            amount_usd = client_payouts._q(sum((a for _, _, a in lines), Decimal("0")))
            if amount_usd <= 0:
                continue
            fx = client_payouts.payout_fx(db, client_payouts.payee_currency(payee), live=False)
            amount_local = client_payouts._q(amount_usd * fx) if fx else None
        warnings = []
        if not client_billing.payout_ready(payee):
            warnings.append("No payout currency or details: add them on the Recipients page.")
        if fx is None:
            warnings.append("No exchange rate: set one before paying.")
        rows.append({
            "payee_id": str(payee_id),
            "payee_name": payee.name,
            "payout_id": str(p.id) if p else None,
            "status": p.status if p else "not_prepared",
            "currency": p.currency if p else client_payouts.payee_currency(payee),
            "fx_rate": str(fx) if fx is not None else None,
            "fx_frozen": p is not None and p.fx_rate is not None,
            "amount_usd": str(amount_usd),
            "amount_local": str(amount_local) if amount_local is not None else None,
            "sent_at": p.sent_at.isoformat() if p and p.sent_at else None,
            "paid_at": p.paid_at.isoformat() if p and p.paid_at else None,
            "reference": p.reference if p else None,
            "payout_email": payee.payout_email,
            "payout_method": payee.payout_method,
            "payout_details": payee.payout_details,
            "payout_ready": client_billing.payout_ready(payee),
            "lines": [
                {"client_id": str(cid), "client_name": clients.get(cid, "—"), "pct": str(pct), "amount_usd": str(amt)}
                for cid, pct, amt in lines
            ],
            "warnings": warnings,
        })
    rows.sort(key=lambda r: r["payee_name"].lower())

    gs_lines = [
        {"client_id": str(m.client_id), "client_name": m.client_name, "pct": str(r["pct"]), "amount_usd": str(r["amount"])}
        for m in months for r in m.recipients if r["is_gs"] and r["amount"] != 0
    ]
    legacy = [
        {
            "client_id": str(p.client_id), "client_name": clients.get(p.client_id, "—"), "status": p.status,
            "currency": p.currency, "amount_usd": str(p.amount_usd),
            "amount_local": str(p.amount_local) if p.amount_local is not None else None,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None, "reference": p.reference,
        }
        for p in client_payouts.legacy_payouts(db, period.id)
    ]
    return {
        "period_id": str(period.id),
        "period_label": period.label,
        "status": _status(period),
        "ready": ready,
        "rows": rows,
        "gs": {
            "amount_usd": str(client_payouts._q(sum((Decimal(l["amount_usd"]) for l in gs_lines), Decimal("0")))),
            "lines": gs_lines,
        },
        "legacy": legacy,
        "totals": client_payouts.totals(payouts.values()),
    }


@router.get("/periods/{period_id}")
def get_payee_payouts(
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
        raise HTTPException(status_code=400, detail="Approve the month before preparing payouts.")
    admin = get_admin_user(db, current_user)
    result = client_payouts.prepare(db, period, refresh_fx=True)
    record_audit(
        db, actor_id=admin.id, action="payee_payout.prepared", target_type="payee_payout",
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
    payout, period, payee = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    old = payout.fx_rate
    try:
        client_payouts.set_rate(db, payout, period, body.fx_rate)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(
        db, actor_id=admin.id, action="payee_payout.rate_set", target_type="payee_payout", target_id=payout.id,
        previous_value={"payee": payee.name, "fx_rate": str(old) if old is not None else None},
        new_value={"payee": payee.name, "period": period.label, "fx_rate": str(body.fx_rate)},
    )
    db.commit()
    return _sheet(db, period)


@router.get("/payouts/{payout_id}/statement")
def download_statement(
    payout_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    payout, period, payee = _payout(db, payout_id)
    filename, pdf = client_payouts.render_statement(db, payout, period, payee)
    db.commit()
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class SendBody(BaseModel):
    to_email: Optional[str] = None


def _send_one(db: Session, payout_id: UUID, actor_id, to_email: Optional[str] = None) -> tuple[bool, Optional[str], str]:
    payout, period, payee = _payout(db, payout_id)
    try:
        ok, error = client_payouts.send_statement(db, payout, period, payee, to_email=to_email)
    except client_payouts.PayoutError as exc:
        return False, str(exc), payee.name
    if ok:
        record_audit(
            db, actor_id=actor_id, action="payee_payout.sent", target_type="payee_payout", target_id=payout.id,
            new_value={"payee": payee.name, "period": period.label, "to": to_email or payee.payout_email},
        )
        db.commit()
    return ok, error, payee.name


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
    _, period, _payee = _payout(db, payout_id)
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
            failed.append({"payee": name, "error": error})
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
    payout, period, payee = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    try:
        client_payouts.mark_paid(db, payout, period, reference=body.reference, actor_id=admin.id, paid_at=body.paid_at)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    client_payouts.render_statement(db, payout, period, payee)
    record_audit(
        db, actor_id=admin.id, action="payee_payout.paid", target_type="payee_payout", target_id=payout.id,
        new_value={
            "payee": payee.name, "period": period.label, "reference": payout.reference,
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
    payout, period, payee = _payout(db, payout_id)
    admin = get_admin_user(db, current_user)
    reference = payout.reference
    try:
        client_payouts.undo_paid(db, payout, period)
    except client_payouts.PayoutError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_audit(
        db, actor_id=admin.id, action="payee_payout.unpaid", target_type="payee_payout", target_id=payout.id,
        previous_value={"payee": payee.name, "period": period.label, "reference": reference},
    )
    db.commit()
    return _sheet(db, period)
