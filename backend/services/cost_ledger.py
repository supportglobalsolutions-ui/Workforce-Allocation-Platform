"""
Shared-cost ledger: split one amount across workers and clients, and the
monthly member approval that gates RDP / shift access.

Rules (agreed with the client, 2026-10-07 and 2026-10-14):
- A cost is recorded first (category, description, amount in the work month's
  reporting currency) and distributed later; until then it touches no payslip.
- On distributing, worker_pool_pct goes to the selected workers, gs_pool_pct to
  Global Solutions and the rest to the selected clients. Inside the worker and
  client pools the split is equal per head or a custom % each.
- A worker's share is added to the payslip field its category maps to
  (transfer cost, else external cost), converted to the payslip currency at the
  month's FX rate, so it comes off the worker's final net.
- A client's share is deducted from that client's earnings before the
  GS / account-owner revenue split (see payroll_engine.client_revenue_report).
- The Global Solutions share is a GS expense on the month overview.
- Members of a month with member_approval_required start unapproved; only
  approved members may claim / see RDPs and see shifts.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN
from typing import Iterable, Optional
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client, ClientPeriodEarning
from models.cost_ledger import (
    COST_TARGET_FIELDS,
    SPLIT_MODES,
    CostLedgerAllocation,
    CostLedgerEntry,
    PeriodMemberApproval,
)
from models.enums import PayrollPeriodStatusEnum
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from services.period_current import resolve_current_period

CENT = Decimal("0.01")
EDITABLE_STATUSES = (PayrollPeriodStatusEnum.open, PayrollPeriodStatusEnum.calculated)


class CostLedgerError(ValueError):
    """Bad split input; the message is safe to show the admin."""


# ── Splitting ──────────────────────────────────────────────────────────────────

def split_by_weights(total: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """
    Split total into cents proportional to weights, summing exactly to total.
    Leftover cents go to the largest remainders (ties: earlier recipients).
    """
    if not weights:
        return []
    weight_sum = sum(weights)
    if weight_sum <= 0:
        raise CostLedgerError("Split percentages must add up to more than zero.")
    raw = [total * w / weight_sum for w in weights]
    floored = [r.quantize(CENT, rounding=ROUND_DOWN) for r in raw]
    leftover = int(((total - sum(floored)) / CENT).to_integral_value())
    order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - floored[i]), i))
    for i in order[:leftover]:
        floored[i] += CENT
    return floored


@dataclass
class Share:
    kind: str  # "worker" | "client" | "gs"
    recipient_id: Optional[UUID]  # None for the Global Solutions share
    pool_pct: Decimal
    amount_base: Decimal


def _pool_shares(
    kind: str,
    pool_total: Decimal,
    ids: list[UUID],
    mode: str,
    pcts: Optional[dict[UUID, Decimal]],
) -> list[Share]:
    if pool_total <= 0:
        return []
    label = "worker" if kind == "worker" else "client"
    if not ids:
        raise CostLedgerError(f"Select at least one {label} to receive this share.")
    if len(set(ids)) != len(ids):
        raise CostLedgerError(f"A {label} is selected twice.")
    if mode not in SPLIT_MODES:
        raise CostLedgerError("Split mode must be 'equal' or 'percent'.")
    if mode == "equal":
        weights = [Decimal(1)] * len(ids)
    else:
        pcts = pcts or {}
        weights = []
        for rid in ids:
            pct = pcts.get(rid)
            if pct is None or pct < 0:
                raise CostLedgerError(f"Every selected {label} needs a percentage of 0 or more.")
            weights.append(Decimal(pct))
        if abs(sum(weights) - Decimal(100)) > CENT:
            raise CostLedgerError(f"The {label} percentages add up to {sum(weights)}%, not 100%.")
    amounts = split_by_weights(pool_total, weights)
    weight_sum = sum(weights)
    return [
        Share(kind, rid, (w * 100 / weight_sum).quantize(Decimal("0.0001")), amt)
        for rid, w, amt in zip(ids, weights, amounts)
    ]


def compute_shares(
    *,
    total: Decimal,
    worker_pool_pct: Decimal,
    worker_ids: list[UUID],
    worker_mode: str = "equal",
    worker_pcts: Optional[dict[UUID, Decimal]] = None,
    client_ids: list[UUID],
    client_mode: str = "equal",
    client_pcts: Optional[dict[UUID, Decimal]] = None,
    gs_pool_pct: Decimal = Decimal(0),
) -> list[Share]:
    total = Decimal(total).quantize(CENT)
    if total <= 0:
        raise CostLedgerError("The amount must be greater than zero.")
    worker_pool_pct, gs_pool_pct = Decimal(worker_pool_pct), Decimal(gs_pool_pct)
    if not (Decimal(0) <= worker_pool_pct <= Decimal(100)):
        raise CostLedgerError("The worker share must be between 0% and 100%.")
    if not (Decimal(0) <= gs_pool_pct <= Decimal(100)):
        raise CostLedgerError("The Global Solutions share must be between 0% and 100%.")
    if worker_pool_pct + gs_pool_pct > Decimal(100):
        raise CostLedgerError("The workers' and Global Solutions' shares add up to more than 100%.")
    client_pool_pct = Decimal(100) - worker_pool_pct - gs_pool_pct
    worker_total, client_total, gs_total = split_by_weights(
        total, [worker_pool_pct, client_pool_pct, gs_pool_pct],
    )
    shares = [
        *_pool_shares("worker", worker_total, worker_ids, worker_mode, worker_pcts),
        *_pool_shares("client", client_total, client_ids, client_mode, client_pcts),
    ]
    if gs_total > 0:
        shares.append(Share("gs", None, Decimal(100), gs_total))
    return shares


# ── Applying to payslips ───────────────────────────────────────────────────────

def _require_editable(period: PayrollPeriod) -> None:
    if period.status not in EDITABLE_STATUSES:
        raise CostLedgerError(
            f"{period.label} is {period.status.value} — reopen it before changing its ledger."
        )


def _summary_fx(db: Session, summary: PayrollWorkerSummary, period: PayrollPeriod) -> Optional[Decimal]:
    from services.payroll_engine import _fx_to_local

    return _fx_to_local(db, period, (summary.local_currency or period.currency).upper())


def _get_or_create_summary(db: Session, period: PayrollPeriod, worker: Worker) -> PayrollWorkerSummary:
    from services.payroll_engine import _q, pay_terms

    summary = db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id == period.id,
            PayrollWorkerSummary.worker_id == worker.id,
        )
    ).first()
    if summary:
        return summary
    terms = pay_terms(db, worker, period)
    summary = PayrollWorkerSummary(
        payroll_period_id=period.id,
        worker_id=worker.id,
        rate_per_hour=_q(terms.rate_local) if terms.rate_local is not None else Decimal("0"),
        local_currency=terms.currency,
        fx_rate=terms.fx,
        base_currency=period.currency,
    )
    db.add(summary)
    db.flush()
    return summary


CATEGORY_FIELDS = {"transfer cost": "transfer_cost", "bonus": "bonus"}


def target_field_for(category: str) -> str:
    """The payslip field a category's worker shares land on: transfer cost, else external cost."""
    return CATEGORY_FIELDS.get((category or "").strip().lower(), "external_cost")


def record_cost(
    db: Session,
    *,
    period: PayrollPeriod,
    category: str,
    description: str,
    notes: Optional[str],
    total: Decimal,
    admin_user_id: Optional[UUID],
    currency: Optional[str] = None,
) -> CostLedgerEntry:
    """Record a cost for the month without distributing it. Caller commits."""
    _require_editable(period)
    category = " ".join((category or "").split())
    if not category:
        raise CostLedgerError("Pick a category, or type one.")
    if len(category) > 64:
        raise CostLedgerError("Keep the category under 64 characters.")
    description = (description or "").strip()
    if not description:
        raise CostLedgerError("Describe the cost (e.g. 'Mobile money fees – October').")
    source = (currency or period.currency).strip().upper()
    if len(source) != 3 or not source.isalpha():
        raise CostLedgerError("Currency must be a 3-letter code.")
    original = Decimal(total)
    if source != period.currency.upper():
        from services.fx import convert_amount
        converted, rate, _ = convert_amount(db, original, source, period.currency)
        if converted is None or rate is None or rate <= 0:
            raise CostLedgerError(f"No exchange rate from {source} to {period.currency}. Add a rate in Currencies first.")
        total = converted
        conversion_note = f"Entered: {original} {source}; rate: 1 {source} = {rate} {period.currency}."
        notes = f"{notes.strip()}\n{conversion_note}" if notes and notes.strip() else conversion_note
    total = Decimal(total).quantize(CENT)
    if total <= 0:
        raise CostLedgerError("The amount must be greater than zero.")
    entry = CostLedgerEntry(
        payroll_period_id=period.id,
        category=category,
        title=description,
        notes=(notes or "").strip() or None,
        total_amount=total,
        currency=period.currency,
        target_field=target_field_for(category),
        worker_pool_pct=Decimal(0),
        created_by=admin_user_id,
    )
    db.add(entry)
    db.flush()
    return entry


def distribute(
    db: Session,
    entry: CostLedgerEntry,
    *,
    worker_pool_pct: Decimal,
    gs_pool_pct: Decimal,
    worker_ids: list[UUID],
    worker_mode: str,
    worker_pcts: Optional[dict[UUID, Decimal]],
    client_ids: list[UUID],
    client_mode: str,
    client_pcts: Optional[dict[UUID, Decimal]],
) -> list[Share]:
    """Split a recorded cost and write worker shares to payslips. Caller commits."""
    from datetime import datetime, timezone

    from services.payroll_engine import _q, recompute_summary

    period = db.get(PayrollPeriod, entry.payroll_period_id)
    if period is None:
        raise CostLedgerError("This cost's work month no longer exists.")
    _require_editable(period)
    if entry.distributed_at is not None:
        raise CostLedgerError(f"“{entry.title}” is already distributed — undo it first to change the split.")

    shares = compute_shares(
        total=entry.total_amount,
        worker_pool_pct=worker_pool_pct,
        worker_ids=worker_ids,
        worker_mode=worker_mode,
        worker_pcts=worker_pcts,
        client_ids=client_ids,
        client_mode=client_mode,
        client_pcts=client_pcts,
        gs_pool_pct=gs_pool_pct,
    )

    workers = {w.id: w for w in db.exec(select(Worker).where(Worker.id.in_(worker_ids or []))).all()}
    if any(wid not in workers for wid in worker_ids):
        raise CostLedgerError("One of the selected workers no longer exists — reload and try again.")
    known_clients = set(db.exec(select(Client.id).where(Client.id.in_(client_ids or []))).all())
    if any(cid not in known_clients for cid in client_ids):
        raise CostLedgerError("One of the selected clients no longer exists — reload and try again.")

    entry.worker_pool_pct = Decimal(worker_pool_pct)
    entry.gs_pool_pct = Decimal(gs_pool_pct)
    entry.worker_mode = worker_mode
    entry.client_mode = client_mode
    entry.gs_amount = Decimal(0)
    for share in shares:
        if share.kind == "gs":
            entry.gs_amount = share.amount_base
            continue
        alloc = CostLedgerAllocation(entry_id=entry.id, pool_pct=share.pool_pct, amount_base=share.amount_base)
        if share.kind == "client":
            alloc.client_id = share.recipient_id
        else:
            worker = workers[share.recipient_id]
            alloc.worker_id = worker.id
            summary = _get_or_create_summary(db, period, worker)
            fx = _summary_fx(db, summary, period)
            if fx is None or fx <= 0:
                raise CostLedgerError(
                    f"No exchange rate from {period.currency} to {summary.local_currency} "
                    f"for {worker.display_name} — add the rate and try again."
                )
            amount_local = _q(share.amount_base * fx)
            alloc.amount_local = amount_local
            alloc.local_currency = summary.local_currency
            field = entry.target_field
            setattr(summary, field, _q(getattr(summary, field) + amount_local))
            recompute_summary(db, summary, commit=False)
        db.add(alloc)
    entry.distributed_at = datetime.now(timezone.utc)
    db.add(entry)
    return shares


def undistribute(db: Session, entry: CostLedgerEntry) -> None:
    """Take every worker share back off the payslips and drop the split; the cost stays recorded. Caller commits."""
    from services.payroll_engine import _q, recompute_summary

    period = db.get(PayrollPeriod, entry.payroll_period_id)
    if period:
        _require_editable(period)
    allocations = db.exec(
        select(CostLedgerAllocation).where(CostLedgerAllocation.entry_id == entry.id)
    ).all()
    for alloc in allocations:
        if alloc.worker_id and period:
            summary = db.exec(
                select(PayrollWorkerSummary).where(
                    PayrollWorkerSummary.payroll_period_id == period.id,
                    PayrollWorkerSummary.worker_id == alloc.worker_id,
                )
            ).first()
            if summary:
                if (summary.local_currency or "").upper() == (alloc.local_currency or "").upper():
                    delta = alloc.amount_local or Decimal("0")
                else:
                    # The worker's payout currency changed since; reverse at today's rate.
                    fx = _summary_fx(db, summary, period) or Decimal("0")
                    delta = _q(alloc.amount_base * fx)
                setattr(summary, entry.target_field, _q(getattr(summary, entry.target_field) - delta))
                if (
                    summary.hours_logged == 0
                    and summary.bonus == 0
                    and summary.transfer_cost == 0
                    and summary.external_cost == 0
                ):
                    # Only existed to carry ledger shares; nothing left on it.
                    db.delete(summary)
                else:
                    recompute_summary(db, summary, commit=False)
        db.delete(alloc)
    entry.distributed_at = None
    entry.gs_amount = Decimal(0)
    entry.gs_pool_pct = Decimal(0)
    entry.worker_pool_pct = Decimal(0)
    db.add(entry)


def delete_entry(db: Session, entry: CostLedgerEntry) -> None:
    """Undo the split if there is one, then drop the cost. Caller commits."""
    undistribute(db, entry)
    db.flush()
    db.delete(entry)


def gs_shared_costs(db: Session, period_id: UUID) -> Decimal:
    """What Global Solutions bears of the month's distributed costs, in the reporting currency."""
    rows = db.exec(
        select(CostLedgerEntry.gs_amount).where(
            CostLedgerEntry.payroll_period_id == period_id,
            CostLedgerEntry.distributed_at.is_not(None),
        )
    ).all()
    return sum((Decimal(r or 0) for r in rows), Decimal("0"))


def client_shared_costs(db: Session, period_id: UUID) -> dict[UUID, Decimal]:
    """Base-currency ledger costs per client for a period."""
    rows = db.exec(
        select(CostLedgerAllocation.client_id, CostLedgerAllocation.amount_base)
        .join(CostLedgerEntry, CostLedgerEntry.id == CostLedgerAllocation.entry_id)
        .where(
            CostLedgerEntry.payroll_period_id == period_id,
            CostLedgerAllocation.client_id.is_not(None),
        )
    ).all()
    totals: dict[UUID, Decimal] = {}
    for client_id, amount in rows:
        totals[client_id] = totals.get(client_id, Decimal("0")) + amount
    return totals


# ── Client earnings (the client ledger) ───────────────────────────────────────

def set_client_earnings(
    db: Session,
    *,
    period: PayrollPeriod,
    amounts: dict[UUID, Decimal],
) -> int:
    """
    Set what each client paid this month, in USD. It is saved as the client's
    Income tab entry (client account payout), which is the client's revenue on
    the ledger. Caller commits.
    """
    from datetime import datetime, timezone

    from services import income

    known = set(db.exec(select(Client.id).where(Client.id.in_(list(amounts)))).all())
    if any(cid not in known for cid in amounts):
        raise CostLedgerError("One of the selected clients no longer exists — reload and try again.")
    existing = {
        row.client_id: row
        for row in db.exec(
            select(ClientPeriodEarning).where(
                ClientPeriodEarning.payroll_period_id == period.id,
                ClientPeriodEarning.client_id.in_(list(amounts)),
            )
        ).all()
    }
    for client_id, amount in amounts.items():
        amount = Decimal(amount).quantize(CENT)
        if amount < 0:
            raise CostLedgerError("Client earnings cannot be negative.")
        row = existing.get(client_id)
        if row is None:
            row = ClientPeriodEarning(client_id=client_id, payroll_period_id=period.id, amount=amount)
        else:
            row.amount = amount
            row.updated_at = datetime.now(timezone.utc)
        db.add(row)
        try:
            income.set_client_received(db, period, client_id, amount=amount)
        except income.IncomeError as exc:
            raise CostLedgerError(str(exc)) from exc
    return len(amounts)


# ── Monthly member approval ────────────────────────────────────────────────────

def approval_period(db: Session) -> Optional[PayrollPeriod]:
    """The current work month, if it requires member approval."""
    period = resolve_current_period(db)
    if period is None or not period.member_approval_required:
        return None
    return period


def approved_worker_ids(db: Session, period_id: UUID) -> set[UUID]:
    return set(
        db.exec(
            select(PeriodMemberApproval.worker_id).where(
                PeriodMemberApproval.payroll_period_id == period_id
            )
        ).all()
    )


def is_worker_approved(db: Session, worker_id: UUID) -> bool:
    period = approval_period(db)
    if period is None:
        return True
    return db.exec(
        select(PeriodMemberApproval.id).where(
            PeriodMemberApproval.payroll_period_id == period.id,
            PeriodMemberApproval.worker_id == worker_id,
        ).limit(1)
    ).first() is not None


def set_approvals(
    db: Session,
    *,
    period: PayrollPeriod,
    worker_ids: Iterable[UUID],
    approved: bool,
    admin_user_id: Optional[UUID],
) -> int:
    """Approve or unapprove members for a month. Caller commits."""
    ids = list({wid for wid in worker_ids})
    if not ids:
        return 0
    current = approved_worker_ids(db, period.id)
    changed = 0
    if approved:
        known = set(db.exec(select(Worker.id).where(Worker.id.in_(ids))).all())
        for wid in ids:
            if wid in known and wid not in current:
                db.add(PeriodMemberApproval(
                    payroll_period_id=period.id, worker_id=wid, approved_by=admin_user_id,
                ))
                changed += 1
    else:
        for row in db.exec(
            select(PeriodMemberApproval).where(
                PeriodMemberApproval.payroll_period_id == period.id,
                PeriodMemberApproval.worker_id.in_(ids),
            )
        ).all():
            db.delete(row)
            changed += 1
    return changed
