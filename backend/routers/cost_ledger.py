"""
Shared-cost ledger (/cost-ledger) and monthly member approvals (/member-approvals).
"""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import STAFF_ROLES, require_admin, require_user
from models.client import Client, ClientPeriodEarning
from models.cost_ledger import CostLedgerAllocation, CostLedgerEntry
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from services import cost_ledger
from services.audit_service import record_audit
from services.payroll_engine import payout_currency_for_worker
from services.period_current import resolve_current_period
from .deps import get_admin_user, get_worker_for_user

router = APIRouter()
approvals_router = APIRouter()

TargetField = Literal["bonus", "transfer_cost", "external_cost"]
SplitMode = Literal["equal", "percent"]


def _period_or_404(db: Session, period_id: UUID) -> PayrollPeriod:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work month not found")
    return period


def _bad_request(exc: cost_ledger.CostLedgerError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# ── Ledger entries ─────────────────────────────────────────────────────────────

class SplitBody(BaseModel):
    total_amount: Decimal = Field(gt=0)
    worker_pool_pct: Decimal = Field(ge=0, le=100)
    worker_ids: list[UUID] = []
    worker_mode: SplitMode = "equal"
    worker_pcts: Optional[dict[UUID, Decimal]] = None
    client_ids: list[UUID] = []
    client_mode: SplitMode = "equal"
    client_pcts: Optional[dict[UUID, Decimal]] = None


class EntryCreate(SplitBody):
    title: str = Field(min_length=1, max_length=255)
    notes: Optional[str] = None
    target_field: TargetField = "external_cost"


class ShareOut(BaseModel):
    kind: str
    recipient_id: UUID
    name: str
    pool_pct: Decimal
    amount_base: Decimal
    amount_local: Optional[Decimal] = None
    local_currency: Optional[str] = None


class EntryOut(BaseModel):
    id: UUID
    title: str
    notes: Optional[str]
    total_amount: Decimal
    currency: str
    target_field: str
    worker_pool_pct: Decimal
    worker_mode: str
    client_mode: str
    created_at: Optional[datetime]
    shares: list[ShareOut]


def _names(db: Session, worker_ids: set[UUID], client_ids: set[UUID]) -> dict[UUID, str]:
    names: dict[UUID, str] = {}
    if worker_ids:
        for w in db.exec(select(Worker).where(Worker.id.in_(list(worker_ids)))).all():
            names[w.id] = w.display_name
    if client_ids:
        for c in db.exec(select(Client).where(Client.id.in_(list(client_ids)))).all():
            names[c.id] = c.name
    return names


def _entry_out(entry: CostLedgerEntry, allocations: list[CostLedgerAllocation], names: dict[UUID, str]) -> EntryOut:
    shares = []
    for a in allocations:
        rid = a.worker_id or a.client_id
        shares.append(ShareOut(
            kind="worker" if a.worker_id else "client",
            recipient_id=rid,
            name=names.get(rid, "Removed"),
            pool_pct=a.pool_pct,
            amount_base=a.amount_base,
            amount_local=a.amount_local,
            local_currency=a.local_currency,
        ))
    shares.sort(key=lambda s: (s.kind != "worker", s.name.lower()))
    return EntryOut(
        id=entry.id,
        title=entry.title,
        notes=entry.notes,
        total_amount=entry.total_amount,
        currency=entry.currency,
        target_field=entry.target_field,
        worker_pool_pct=entry.worker_pool_pct,
        worker_mode=entry.worker_mode,
        client_mode=entry.client_mode,
        created_at=entry.created_at,
        shares=shares,
    )


@router.get("/periods/{period_id}/entries", response_model=list[EntryOut])
def list_entries(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    _period_or_404(db, period_id)
    entries = db.exec(
        select(CostLedgerEntry)
        .where(CostLedgerEntry.payroll_period_id == period_id)
        .order_by(CostLedgerEntry.created_at.desc())
    ).all()
    if not entries:
        return []
    allocations = db.exec(
        select(CostLedgerAllocation).where(
            CostLedgerAllocation.entry_id.in_([e.id for e in entries])
        )
    ).all()
    by_entry: dict[UUID, list[CostLedgerAllocation]] = {}
    for a in allocations:
        by_entry.setdefault(a.entry_id, []).append(a)
    names = _names(
        db,
        {a.worker_id for a in allocations if a.worker_id},
        {a.client_id for a in allocations if a.client_id},
    )
    return [_entry_out(e, by_entry.get(e.id, []), names) for e in entries]


@router.post("/periods/{period_id}/preview", response_model=list[ShareOut])
def preview_split(
    period_id: UUID,
    body: SplitBody,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Who pays what, without saving anything (amounts in the month's currency)."""
    _period_or_404(db, period_id)
    try:
        shares = cost_ledger.compute_shares(
            total=body.total_amount,
            worker_pool_pct=body.worker_pool_pct,
            worker_ids=body.worker_ids,
            worker_mode=body.worker_mode,
            worker_pcts=body.worker_pcts,
            client_ids=body.client_ids,
            client_mode=body.client_mode,
            client_pcts=body.client_pcts,
        )
    except cost_ledger.CostLedgerError as exc:
        raise _bad_request(exc)
    names = _names(db, set(body.worker_ids), set(body.client_ids))
    return [
        ShareOut(
            kind=s.kind, recipient_id=s.recipient_id, name=names.get(s.recipient_id, "Unknown"),
            pool_pct=s.pool_pct, amount_base=s.amount_base,
        )
        for s in shares
    ]


@router.post("/periods/{period_id}/entries", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    period_id: UUID,
    body: EntryCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period_or_404(db, period_id)
    admin = get_admin_user(db, current_user)
    try:
        entry = cost_ledger.create_entry(
            db,
            period=period,
            title=body.title,
            notes=body.notes,
            total=body.total_amount,
            target_field=body.target_field,
            worker_pool_pct=body.worker_pool_pct,
            worker_ids=body.worker_ids,
            worker_mode=body.worker_mode,
            worker_pcts=body.worker_pcts,
            client_ids=body.client_ids,
            client_mode=body.client_mode,
            client_pcts=body.client_pcts,
            admin_user_id=admin.id,
        )
    except cost_ledger.CostLedgerError as exc:
        db.rollback()
        raise _bad_request(exc)
    record_audit(
        db,
        actor_id=admin.id,
        action="cost_ledger.entry_created",
        target_type="cost_ledger_entry",
        target_id=entry.id,
        new_value={
            "period": period.label,
            "title": entry.title,
            "total": str(entry.total_amount),
            "currency": entry.currency,
            "target_field": entry.target_field,
            "worker_pool_pct": str(entry.worker_pool_pct),
            "workers": len(body.worker_ids),
            "clients": len(body.client_ids),
        },
    )
    db.commit()
    db.refresh(entry)
    allocations = db.exec(
        select(CostLedgerAllocation).where(CostLedgerAllocation.entry_id == entry.id)
    ).all()
    return _entry_out(entry, list(allocations), _names(db, set(body.worker_ids), set(body.client_ids)))


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    entry = db.get(CostLedgerEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ledger entry not found")
    admin = get_admin_user(db, current_user)
    snapshot = {
        "title": entry.title,
        "total": str(entry.total_amount),
        "currency": entry.currency,
        "target_field": entry.target_field,
    }
    try:
        cost_ledger.delete_entry(db, entry)
    except cost_ledger.CostLedgerError as exc:
        db.rollback()
        raise _bad_request(exc)
    record_audit(
        db,
        actor_id=admin.id,
        action="cost_ledger.entry_deleted",
        target_type="cost_ledger_entry",
        target_id=entry_id,
        previous_value=snapshot,
    )
    db.commit()
    return {"deleted": True, "id": str(entry_id)}


# ── Client earnings ledger ─────────────────────────────────────────────────────

class ClientEarningRow(BaseModel):
    client_id: UUID
    name: str
    platform: str
    contract_status: str
    amount: Optional[Decimal]
    shared_cost: Decimal


@router.get("/periods/{period_id}/clients", response_model=list[ClientEarningRow])
def list_client_earnings(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    _period_or_404(db, period_id)
    earnings = {
        row.client_id: row.amount
        for row in db.exec(
            select(ClientPeriodEarning).where(ClientPeriodEarning.payroll_period_id == period_id)
        ).all()
    }
    shared = cost_ledger.client_shared_costs(db, period_id)
    clients = db.exec(select(Client).order_by(Client.name)).all()
    return [
        ClientEarningRow(
            client_id=c.id,
            name=c.name,
            platform=c.platform,
            contract_status=c.contract_status.value,
            amount=earnings.get(c.id),
            shared_cost=shared.get(c.id, Decimal("0.00")),
        )
        for c in clients
    ]


class ClientEarningsSet(BaseModel):
    """Either per-client amounts, or a total split equally / by % across clients."""
    amounts: Optional[dict[UUID, Decimal]] = None
    total_amount: Optional[Decimal] = Field(default=None, gt=0)
    client_ids: list[UUID] = []
    mode: SplitMode = "equal"
    pcts: Optional[dict[UUID, Decimal]] = None


@router.put("/periods/{period_id}/clients")
def set_client_earnings(
    period_id: UUID,
    body: ClientEarningsSet,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period_or_404(db, period_id)
    try:
        if body.total_amount is not None:
            shares = cost_ledger.compute_shares(
                total=body.total_amount,
                worker_pool_pct=Decimal(0),
                worker_ids=[],
                client_ids=body.client_ids,
                client_mode=body.mode,
                client_pcts=body.pcts,
            )
            amounts = {s.recipient_id: s.amount_base for s in shares}
        elif body.amounts:
            amounts = body.amounts
        else:
            raise cost_ledger.CostLedgerError("Enter client amounts or a total to split.")
        updated = cost_ledger.set_client_earnings(db, period=period, amounts=amounts)
    except cost_ledger.CostLedgerError as exc:
        db.rollback()
        raise _bad_request(exc)
    admin = get_admin_user(db, current_user)
    record_audit(
        db,
        actor_id=admin.id,
        action="client_earnings.bulk_set",
        target_type="payroll_period",
        target_id=period.id,
        new_value={
            "period": period.label,
            "clients": updated,
            "total": str(body.total_amount) if body.total_amount is not None else None,
            "mode": body.mode if body.total_amount is not None else "per_client",
        },
    )
    db.commit()
    return {"updated": updated}


# ── Monthly member approvals ───────────────────────────────────────────────────

class MemberRow(BaseModel):
    worker_id: UUID
    display_name: str
    public_code: Optional[str]
    status: str
    worker_type: str
    currency: str
    approved: bool
    approved_at: Optional[datetime]


class ApprovalsOut(BaseModel):
    period_id: UUID
    period_label: str
    currency: str
    is_current: bool
    member_approval_required: bool
    members: list[MemberRow]


@approvals_router.get("/periods/{period_id}", response_model=ApprovalsOut)
def list_members(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    from models.cost_ledger import PeriodMemberApproval

    period = _period_or_404(db, period_id)
    approvals = {
        row.worker_id: row
        for row in db.exec(
            select(PeriodMemberApproval).where(PeriodMemberApproval.payroll_period_id == period_id)
        ).all()
    }
    summary_currency = {
        row.worker_id: row.local_currency
        for row in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    }
    workers = db.exec(select(Worker).order_by(Worker.display_name)).all()
    members = [
        MemberRow(
            worker_id=w.id,
            display_name=w.display_name,
            public_code=w.public_code,
            status=w.status.value,
            worker_type=w.worker_type.value,
            currency=summary_currency.get(w.id) or payout_currency_for_worker(db, w),
            approved=w.id in approvals,
            approved_at=approvals[w.id].approved_at if w.id in approvals else None,
        )
        for w in workers
    ]
    return ApprovalsOut(
        period_id=period.id,
        period_label=period.label,
        currency=period.currency,
        is_current=period.is_current,
        member_approval_required=period.member_approval_required,
        members=members,
    )


class ApprovalsSet(BaseModel):
    worker_ids: list[UUID] = []
    approved: bool = True
    # True = apply to every member (the "Approve all" button); worker_ids is ignored.
    all_members: bool = False


@approvals_router.post("/periods/{period_id}")
def set_member_approvals(
    period_id: UUID,
    body: ApprovalsSet,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period_or_404(db, period_id)
    admin = get_admin_user(db, current_user)
    ids = list(db.exec(select(Worker.id)).all()) if body.all_members else body.worker_ids
    changed = cost_ledger.set_approvals(
        db, period=period, worker_ids=ids, approved=body.approved, admin_user_id=admin.id,
    )
    record_audit(
        db,
        actor_id=admin.id,
        action="member_approvals.approved" if body.approved else "member_approvals.unapproved",
        target_type="payroll_period",
        target_id=period.id,
        new_value={"period": period.label, "members": changed, "all": body.all_members},
    )
    db.commit()
    return {"changed": changed}


class ApprovalSettings(BaseModel):
    member_approval_required: bool


@approvals_router.patch("/periods/{period_id}/settings")
def update_approval_settings(
    period_id: UUID,
    body: ApprovalSettings,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period_or_404(db, period_id)
    admin = get_admin_user(db, current_user)
    previous = period.member_approval_required
    period.member_approval_required = body.member_approval_required
    db.add(period)
    record_audit(
        db,
        actor_id=admin.id,
        action="member_approvals.setting_changed",
        target_type="payroll_period",
        target_id=period.id,
        previous_value={"member_approval_required": previous},
        new_value={"member_approval_required": body.member_approval_required},
    )
    db.commit()
    return {"member_approval_required": period.member_approval_required}


class MyApproval(BaseModel):
    approved: bool
    required: bool
    period_label: Optional[str]


@approvals_router.get("/me", response_model=MyApproval)
def my_approval(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Drives the worker portal's 'Not approved for this month' banner."""
    period = resolve_current_period(db)
    if current_user.get("role") in STAFF_ROLES:
        return MyApproval(approved=True, required=False, period_label=period.label if period else None)
    worker = get_worker_for_user(db, current_user)
    required = bool(period and period.member_approval_required)
    return MyApproval(
        approved=cost_ledger.is_worker_approved(db, worker.id),
        required=required,
        period_label=period.label if period else None,
    )
