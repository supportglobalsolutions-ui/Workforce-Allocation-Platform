"""
Payees (/payees): who client money is paid to.

Recipients on the client split pick a payee. The payee flagged as Global
Solutions keeps its share; every other payee is paid with one combined
statement per month.
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client, ClientSplitRecipient, Payee, PayeeClientLink
from services import client_billing
from services.audit_service import record_audit
from services.client_billing import payout_ready
from services.period_current import resolve_current_period
from .deps import get_admin_user

router = APIRouter()


class PayeeBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    is_gs: Optional[bool] = None
    payout_currency: Optional[str] = Field(default=None, max_length=3)
    payout_email: Optional[str] = Field(default=None, max_length=255)
    payout_method: Optional[str] = Field(default=None, max_length=64)
    payout_details: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class LinkBody(BaseModel):
    client_id: UUID
    pct: Decimal = Field(ge=0, le=100)


class LinksBody(BaseModel):
    links: list[LinkBody]


def _out(p: Payee, links: Optional[list[dict]] = None) -> dict:
    links = links or []
    return {
        "id": str(p.id),
        "name": p.name,
        "is_gs": p.is_gs,
        "payout_currency": p.payout_currency,
        "payout_email": p.payout_email,
        "payout_method": p.payout_method,
        "payout_details": p.payout_details,
        "notes": p.notes,
        "active": p.active,
        "payout_ready": p.is_gs or payout_ready(p),
        "clients": [link["client_name"] for link in links],
        "links": links,
    }


def _links_by_payee(db: Session, payee_id: Optional[UUID] = None) -> dict[UUID, list[dict]]:
    """{payee: [{client_id, client_name, pct}]}, clients A–Z."""
    query = select(PayeeClientLink, Client.name).join(Client, Client.id == PayeeClientLink.client_id)
    if payee_id is not None:
        query = query.where(PayeeClientLink.payee_id == payee_id)
    out: dict[UUID, list[dict]] = {}
    for link, name in db.exec(query).all():
        out.setdefault(link.payee_id, []).append(
            {"client_id": str(link.client_id), "client_name": name, "pct": str(link.pct)},
        )
    return {k: sorted(v, key=lambda x: x["client_name"].lower()) for k, v in out.items()}


def _get(db: Session, payee_id: UUID) -> Payee:
    payee = db.get(Payee, payee_id)
    if payee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")
    return payee


def _apply(db: Session, payee: Payee, body: PayeeBody) -> None:
    fields = body.model_fields_set
    if "name" in fields:
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name the recipient.")
        clash = db.exec(
            select(Payee).where(func.lower(Payee.name) == name.lower(), Payee.id != payee.id)
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail=f"There is already a recipient called {clash.name}.")
        payee.name = name
    if "payout_currency" in fields:
        payee.payout_currency = (body.payout_currency or "").strip().upper()[:3] or None
    for key in ("payout_email", "payout_method", "payout_details", "notes"):
        if key in fields:
            setattr(payee, key, (getattr(body, key) or "").strip() or None)
    if "active" in fields and body.active is not None:
        payee.active = body.active
    if "is_gs" in fields and body.is_gs is not None:
        if body.is_gs:
            for other in db.exec(select(Payee).where(Payee.is_gs.is_(True), Payee.id != payee.id)).all():
                other.is_gs = False
                db.add(other)
        payee.is_gs = body.is_gs
    payee.updated_at = datetime.now(timezone.utc)
    db.add(payee)


@router.get("")
def list_payees(db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    links = _links_by_payee(db)
    payees = db.exec(select(Payee).order_by(Payee.is_gs.desc(), func.lower(Payee.name))).all()
    return [_out(p, links.get(p.id)) for p in payees]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_payee(body: PayeeBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    admin = get_admin_user(db, current_user)
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Name the recipient.")
    payee = Payee(name=(body.name or "").strip())
    _apply(db, payee, body)
    db.flush()
    record_audit(db, actor_id=admin.id, action="payee.created", target_type="payee", target_id=payee.id,
                 new_value=_out(payee))
    db.commit()
    db.refresh(payee)
    return _out(payee)


@router.patch("/{payee_id}")
def update_payee(
    payee_id: UUID, body: PayeeBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    payee = _get(db, payee_id)
    before = _out(payee)
    _apply(db, payee, body)
    record_audit(db, actor_id=admin.id, action="payee.updated", target_type="payee", target_id=payee.id,
                 previous_value=before, new_value=_out(payee))
    db.commit()
    db.refresh(payee)
    return _out(payee, _links_by_payee(db, payee.id).get(payee.id))


def _sync_current_month(db: Session, payee: Payee, changed: dict[UUID, Optional[Decimal]]) -> list[str]:
    """Put changed links onto the current working month's split; returns clients that were skipped.

    {client: pct} adds the payee or sets its %; {client: None} takes it off.
    Paid months are left alone.
    """
    period = resolve_current_period(db)
    if period is None or not changed:
        return []
    clients = {c.id: c for c in db.exec(select(Client).where(Client.id.in_(list(changed)))).all()}
    months = {m.client_id: m for m in client_billing.build(db, period, list(clients))}
    skipped: list[str] = []
    touched: list[UUID] = []
    for client_id, pct in changed.items():
        client, month = clients.get(client_id), months.get(client_id)
        if client is None or month is None:
            continue
        lines = [
            {"payee_id": r["payee_id"], "name": None if r["payee_id"] else r["name"], "pct": r["pct"],
             "amount_override": r["amount_override"]}
            for r in month.recipients if r.get("name") or r.get("payee_id")
        ]
        mine = next((line for line in lines if line["payee_id"] == payee.id), None)
        if pct is None:
            if mine is None:
                continue
            lines.remove(mine)
        elif mine is None:
            lines.append({"payee_id": payee.id, "name": None, "pct": pct, "amount_override": None})
        elif Decimal(mine["pct"]) == pct:
            continue
        else:
            mine["pct"] = pct
        try:
            with db.begin_nested():
                client_billing.update_month(db, period, client, recipients=lines)
            touched.append(client_id)
        except client_billing.BillingError:
            skipped.append(client.name)
    if touched:
        client_billing.snapshot(db, period, client_billing.build(db, period, touched))
    return sorted(skipped, key=str.lower)


@router.put("/{payee_id}/clients")
def set_payee_clients(
    payee_id: UUID, body: LinksBody, db: Session = Depends(get_db), current_user: dict = Depends(require_admin),
):
    """Replace the clients this payee is linked to, with its % of each.

    The current working month's split follows: new clients get the payee, changed
    % are updated and unlinked clients drop it (paid months are not touched).
    """
    admin = get_admin_user(db, current_user)
    payee = _get(db, payee_id)
    wanted: dict[UUID, Decimal] = {}
    for link in body.links:
        if link.client_id in wanted:
            raise HTTPException(status_code=400, detail="A client is listed twice.")
        wanted[link.client_id] = link.pct.quantize(Decimal("0.01"))
    found = set(db.exec(select(Client.id).where(Client.id.in_(list(wanted)))).all()) if wanted else set()
    if len(found) != len(wanted):
        raise HTTPException(status_code=404, detail="Client not found.")

    before_out = _out(payee, _links_by_payee(db, payee.id).get(payee.id))
    existing = {
        link.client_id: link
        for link in db.exec(select(PayeeClientLink).where(PayeeClientLink.payee_id == payee.id)).all()
    }
    changed: dict[UUID, Optional[Decimal]] = {}
    now = datetime.now(timezone.utc)
    for client_id, link in existing.items():
        if client_id not in wanted:
            db.delete(link)
            changed[client_id] = None
    for client_id, pct in wanted.items():
        link = existing.get(client_id)
        if link is None:
            db.add(PayeeClientLink(payee_id=payee.id, client_id=client_id, pct=pct, updated_at=now))
            changed[client_id] = pct
        elif Decimal(link.pct) != pct:
            link.pct = pct
            link.updated_at = now
            db.add(link)
            changed[client_id] = pct
    db.flush()
    skipped = _sync_current_month(db, payee, changed)
    after_out = _out(payee, _links_by_payee(db, payee.id).get(payee.id))
    record_audit(db, actor_id=admin.id, action="payee.clients_updated", target_type="payee", target_id=payee.id,
                 previous_value={"links": before_out["links"]}, new_value={"links": after_out["links"]})
    db.commit()
    return {**after_out, "skipped_clients": skipped}


@router.delete("/{payee_id}")
def delete_payee(payee_id: UUID, db: Session = Depends(get_db), current_user: dict = Depends(require_admin)):
    """Delete an unused payee; one already on a split or a payout is archived instead."""
    admin = get_admin_user(db, current_user)
    payee = _get(db, payee_id)
    if payee.is_gs:
        raise HTTPException(status_code=400, detail="Global Solutions can't be removed. Flag another recipient first.")
    used = db.exec(select(ClientSplitRecipient.id).where(ClientSplitRecipient.payee_id == payee.id)).first()
    if used is None:
        from models.client_payout import PayeePayout

        used = db.exec(select(PayeePayout.id).where(PayeePayout.payee_id == payee.id)).first()
    before = _out(payee)
    if used is not None:
        payee.active = False
        payee.updated_at = datetime.now(timezone.utc)
        db.add(payee)
        action, result = "payee.archived", {"archived": True}
    else:
        db.delete(payee)
        action, result = "payee.deleted", {"deleted": True}
    record_audit(db, actor_id=admin.id, action=action, target_type="payee", target_id=payee_id,
                 previous_value=before)
    db.commit()
    return result
