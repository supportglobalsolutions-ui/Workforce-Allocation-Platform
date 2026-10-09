"""
Shared-cost ledger: split one amount across workers and clients, and the
monthly member approval that gates RDP / shift access.

Rules (agreed with the client, 2026-10-07):
- The total is entered in the work month's reporting currency.
- worker_pool_pct of it goes to the selected workers, the rest to the selected
  clients. Inside each pool the split is equal per head or a custom % each.
- A worker's share is added to the chosen payslip field (bonus, transfer cost or
  external cost), converted to the payslip currency at the month's FX rate.
- A client's share is deducted from that client's earnings before the
  GS / account-owner revenue split (see payroll_engine.client_revenue_report).
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
    kind: str  # "worker" | "client"
    recipient_id: UUID
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
) -> list[Share]:
    total = Decimal(total).quantize(CENT)
    if total <= 0:
        raise CostLedgerError("The amount must be greater than zero.")
    if not (Decimal(0) <= worker_pool_pct <= Decimal(100)):
        raise CostLedgerError("The worker share must be between 0% and 100%.")
    worker_total, client_total = split_by_weights(
        total, [Decimal(worker_pool_pct), Decimal(100) - Decimal(worker_pool_pct)],
    )
    return [
        *_pool_shares("worker", worker_total, worker_ids, worker_mode, worker_pcts),
        *_pool_shares("client", client_total, client_ids, client_mode, client_pcts),
    ]


# ── Applying to payslips ───────────────────────────────────────────────────────

def _require_editable(period: PayrollPeriod) -> None:
    if period.status not in EDITABLE_STATUSES:
        raise CostLedgerError(
            f"{period.label} is {period.status.value} — reopen it before changing its ledger."
        )


def _summary_fx(db: Session, summary: PayrollWorkerSummary, period: PayrollPeriod) -> Optional[Decimal]:
    from services.payroll_engine import _fx_to_local

    if summary.admin_locked and summary.fx_rate and summary.fx_rate > 0:
        return summary.fx_rate
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


def create_entry(
    db: Session,
    *,
    period: PayrollPeriod,
    title: str,
    notes: Optional[str],
    total: Decimal,
    target_field: str,
    worker_pool_pct: Decimal,
    worker_ids: list[UUID],
    worker_mode: str,
    worker_pcts: Optional[dict[UUID, Decimal]],
    client_ids: list[UUID],
    client_mode: str,
    client_pcts: Optional[dict[UUID, Decimal]],
    admin_user_id: Optional[UUID],
) -> CostLedgerEntry:
    """Record the entry, its allocations, and write worker shares to payslips. Caller commits."""
    from services.payroll_engine import _q, recompute_summary

    _require_editable(period)
    title = (title or "").strip()
    if not title:
        raise CostLedgerError("Give the cost a name (e.g. 'Internet – October').")
    if target_field not in COST_TARGET_FIELDS:
        raise CostLedgerError("Choose bonus, transfer cost or external cost.")

    shares = compute_shares(
        total=total,
        worker_pool_pct=worker_pool_pct,
        worker_ids=worker_ids,
        worker_mode=worker_mode,
        worker_pcts=worker_pcts,
        client_ids=client_ids,
        client_mode=client_mode,
        client_pcts=client_pcts,
    )

    workers = {w.id: w for w in db.exec(select(Worker).where(Worker.id.in_(worker_ids or []))).all()}
    missing_workers = [wid for wid in worker_ids if wid not in workers]
    if missing_workers:
        raise CostLedgerError("One of the selected workers no longer exists — reload and try again.")
    known_clients = set(db.exec(select(Client.id).where(Client.id.in_(client_ids or []))).all())
    if any(cid not in known_clients for cid in client_ids):
        raise CostLedgerError("One of the selected clients no longer exists — reload and try again.")

    entry = CostLedgerEntry(
        payroll_period_id=period.id,
        title=title,
        notes=(notes or "").strip() or None,
        total_amount=Decimal(total).quantize(CENT),
        currency=period.currency,
        target_field=target_field,
        worker_pool_pct=Decimal(worker_pool_pct),
        worker_mode=worker_mode,
        client_mode=client_mode,
        created_by=admin_user_id,
    )
    db.add(entry)
    db.flush()

    for share in shares:
        alloc = CostLedgerAllocation(
            entry_id=entry.id,
            pool_pct=share.pool_pct,
            amount_base=share.amount_base,
        )
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
            setattr(summary, target_field, _q(getattr(summary, target_field) + amount_local))
            recompute_summary(db, summary, commit=False)
        db.add(alloc)
    return entry


def delete_entry(db: Session, entry: CostLedgerEntry) -> None:
    """Take every worker share back off the payslips, then drop the entry. Caller commits."""
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
    db.delete(entry)


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
    """Upsert one earnings amount per client for the period. Caller commits."""
    from datetime import datetime, timezone

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
