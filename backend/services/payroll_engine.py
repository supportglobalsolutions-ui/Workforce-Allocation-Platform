"""
Payroll calculation engine.

Monthly cycle: open period → calculate (this module) → admin cost evaluation →
approve (FX snapshot on pay day) → push nets to wallets → payslip emails.

Calculation rules (confirmed by client):
- GS workers: approved session hours × hourly rate → base pay.
- Partner workers: the worker's-hours portion of platform earnings, split by the
  partner arrangement (worker % / GS % / partner %); worker share is their pay.
- Bonus, transfer cost and external cost are set per worker.
- Client revenue splits (GS vs account owner) apply only AFTER worker costs.
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional
from uuid import UUID

from sqlalchemy import update as sa_update
from sqlmodel import Session, delete, select

from models.client import Client, ClientPeriodEarning, ClientRevenueAgreement
from models.email_job import EmailJob, EmailJobItem
from models.email_log import EmailLog
from models.enums import (
    PayrollPeriodStatusEnum,
    PayrollSessionEnum,
    SessionTypeEnum,
    WalletTxTypeEnum,
    WorkerTypeEnum,
)
from models.notification import Notification
from models.partner import PartnerArrangement
from models.payroll import PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.quality import QualityCompositeScore, QualityIndicatorRating
from models.rate_table import RateTableEntry
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.wallet import Wallet, WalletTransaction
from models.worker import Worker
from services.client_owners import client_owner_name, owner_rollup_key
from services.fx import currency_for_country, ensure_rate
from services import hours_log
from services.session_evidence import effective_duration_minutes

logger = logging.getLogger(__name__)

TWO_DP = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def _fx_to_local(db: Session, period: PayrollPeriod, local_currency: str) -> Optional[Decimal]:
    """Base→local conversion rate; 1 when the worker is paid in the base currency."""
    if local_currency == period.currency:
        return Decimal("1")
    return ensure_rate(db, period.currency, local_currency)


def _rate_entry_between(
    db: Session, worker: Worker, start: date, end: date,
) -> Optional[RateTableEntry]:
    """Latest rate entry live in [start, end]: worker-specific first, then pay-tier."""
    entry = db.exec(
        select(RateTableEntry)
        .where(
            RateTableEntry.worker_id == worker.id,
            RateTableEntry.effective_from <= end,
        )
        .order_by(RateTableEntry.effective_from.desc())
    ).first()
    if not entry:
        entry = db.exec(
            select(RateTableEntry)
            .where(
                RateTableEntry.worker_id.is_(None),
                RateTableEntry.pay_tier == worker.pay_tier,
                RateTableEntry.effective_from <= end,
            )
            .order_by(RateTableEntry.effective_from.desc())
        ).first()
    if not entry:
        return None
    if entry.effective_to and entry.effective_to < start:
        return None
    return entry


def _rate_entry_for(db: Session, worker: Worker, period: PayrollPeriod) -> Optional[RateTableEntry]:
    return _rate_entry_between(db, worker, period.start_date, period.end_date)


@dataclass(frozen=True)
class PayTerms:
    """How one worker is paid in one period.

    A rate is entered in its own currency (the tier's currency). That currency
    is the payout currency, and the rate is used exactly as entered — it is
    never treated as base currency and converted again.
    """

    currency: str
    rate_local: Optional[Decimal]
    rate_base: Optional[Decimal]
    # 1 period-base = fx payout currency; None when no FX rate is available.
    fx: Optional[Decimal]


def pay_terms(db: Session, worker: Worker, period: PayrollPeriod) -> PayTerms:
    entry = _rate_entry_for(db, worker, period)
    entry_currency = (entry.currency or "").strip().upper() if entry else ""
    currency = (
        entry_currency
        or currency_for_country(db, worker.country)
        or period.currency
    ).upper()
    fx = _fx_to_local(db, period, currency)
    if fx is not None and fx <= 0:
        fx = None
    rate_local = Decimal(entry.amount) if entry else None
    rate_base = (rate_local / fx) if (rate_local is not None and fx) else None
    return PayTerms(currency=currency, rate_local=rate_local, rate_base=rate_base, fx=fx)


def payout_currency_for_worker(db: Session, worker: Worker) -> str:
    """Currency a worker is paid in today: their rate's currency, else their country's."""
    today = date.today()
    entry = _rate_entry_between(db, worker, today, today)
    if entry and (entry.currency or "").strip():
        return entry.currency.strip().upper()
    return currency_for_country(db, worker.country) or "USD"


def _hourly_rate_for(db: Session, worker: Worker, period: PayrollPeriod) -> Optional[Decimal]:
    """Hourly rate converted to the period's base currency (for base-currency reports)."""
    return pay_terms(db, worker, period).rate_base


def _active_arrangement(db: Session, partner_entity_id: UUID, period: PayrollPeriod) -> Optional[PartnerArrangement]:
    return db.exec(
        select(PartnerArrangement)
        .where(
            PartnerArrangement.partner_entity_id == partner_entity_id,
            PartnerArrangement.effective_from <= period.end_date,
        )
        .order_by(PartnerArrangement.effective_from.desc())
    ).first()


def _session_earnings(session: WorkSession) -> Decimal:
    fields = session.type_specific_fields or {}
    try:
        return Decimal(str(fields.get("earnings_amount", 0) or 0))
    except Exception:
        return Decimal("0")


def _sessions_for_period(db: Session, period: PayrollPeriod) -> list[WorkSession]:
    """
    Closed sessions whose start falls in this work period.

    Pending sessions are included and stamped with payroll_period_id so finance
    stays linked to the session rows. Flagged / excluded stay out. Sessions
    already billed to a different period are not stolen.
    """
    start = datetime.combine(period.start_date, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, datetime.max.time(), tzinfo=timezone.utc)
    rows = db.exec(
        select(WorkSession).where(
            WorkSession.end_time.is_not(None),
            WorkSession.start_time >= start,
            WorkSession.start_time <= end,
            WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
            WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
        )
    ).all()
    included: list[WorkSession] = []
    for s in rows:
        if s.payroll_period_id is not None and s.payroll_period_id != period.id:
            continue
        minutes = effective_duration_minutes(s)
        s.duration_minutes = minutes
        s.payroll_period_id = period.id
        if s.payroll_approval_state == PayrollSessionEnum.pending:
            s.payroll_approval_state = PayrollSessionEnum.approved
        db.add(s)
        included.append(s)
    return included


def find_period_for_session(db: Session, session: WorkSession) -> Optional[PayrollPeriod]:
    """Open/calculated/approved period whose dates cover this session's start."""
    if session.payroll_period_id:
        period = db.get(PayrollPeriod, session.payroll_period_id)
        if period and period.status != PayrollPeriodStatusEnum.paid:
            return period
    when = session.start_time
    if when is None:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    day = when.date()
    return db.exec(
        select(PayrollPeriod)
        .where(
            PayrollPeriod.start_date <= day,
            PayrollPeriod.end_date >= day,
            PayrollPeriod.status != PayrollPeriodStatusEnum.paid,
        )
        .order_by(PayrollPeriod.start_date.desc())
    ).first()


def sync_hours_from_sessions(
    db: Session,
    worker_id: UUID,
    period: PayrollPeriod,
) -> Optional[PayrollWorkerSummary]:
    """Refresh the worker's Hours Log rows, set hours_logged to their total and recompute."""
    hours = hours_log.worker_total(db, period, worker_id)
    summary = db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id == period.id,
            PayrollWorkerSummary.worker_id == worker_id,
        )
    ).first()
    if not summary:
        return None
    summary.hours_logged = hours
    return recompute_summary(db, summary)


def on_session_hours_changed(db: Session, session: WorkSession) -> None:
    """
    After a worker (or admin) updates session times/images: link the session to
    the covering work period and refresh that worker's payslip hours.
    """
    if session.payroll_approval_state in (
        PayrollSessionEnum.excluded,
        PayrollSessionEnum.flagged,
    ):
        return
    period = find_period_for_session(db, session)
    if not period:
        return
    session.payroll_period_id = period.id
    if session.payroll_approval_state == PayrollSessionEnum.pending:
        session.payroll_approval_state = PayrollSessionEnum.approved
    db.add(session)
    db.flush()
    if period.status in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
        return
    sync_hours_from_sessions(db, session.worker_id, period)


def calculate_period(db: Session, period_id: UUID) -> dict:
    """(Re)calculate line items + per-worker payslip summaries for a period."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")
    if period.status in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
        raise ValueError("Period is already approved — reopen it before recalculating")

    sessions = _sessions_for_period(db, period)
    hours_log.refresh(db, period, sessions=sessions)
    log_totals = hours_log.totals(db, period_id)
    log_deltas = hours_log.manual_deltas(db, period_id)

    # Wipe previous calculation results (manual bonuses on summaries survive).
    db.exec(delete(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period_id))

    existing_summaries = {
        s.worker_id: s
        for s in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    }

    workers = {w.id: w for w in db.exec(select(Worker)).all()}
    by_worker: dict[UUID, list[WorkSession]] = {}
    for s in sessions:
        by_worker.setdefault(s.worker_id, []).append(s)
    # Workers with only typed Hours Log rows are paid too.
    for worker_id, total in log_totals.items():
        if total > 0:
            by_worker.setdefault(worker_id, [])

    # First pass: hours + base pay per worker, and line items per session.
    calc: dict[UUID, dict] = {}
    for worker_id, worker_sessions in by_worker.items():
        worker = workers.get(worker_id)
        if not worker:
            continue

        session_hours = _q(Decimal(sum(effective_duration_minutes(s) for s in worker_sessions)) / Decimal(60))
        hours = log_totals.get(worker_id, session_hours)
        terms = pay_terms(db, worker, period)
        flags: list[str] = []
        # Partner earnings arrive in the period's base currency.
        partner_base = Decimal("0")

        # GS RDP hours × rate, in the rate's own (payout) currency.
        gs_minutes = sum(
            effective_duration_minutes(s) for s in worker_sessions
            if s.session_type == SessionTypeEnum.gs_rdp
        )
        # Hours typed into the Hours Log beyond what sessions show are paid at the rate.
        gs_hours = max(Decimal("0"), _q(Decimal(gs_minutes) / Decimal(60)) + log_deltas.get(worker_id, Decimal("0")))
        gs_local = Decimal("0")
        if gs_hours > 0:
            if terms.rate_local is None:
                flags.append("no_rate")
            else:
                gs_local = _q(gs_hours * terms.rate_local)
                if terms.fx is None:
                    flags.append("no_fx_rate")

        # Partner / third-party earnings with splits
        for s in worker_sessions:
            if s.session_type == SessionTypeEnum.gs_rdp:
                minutes = effective_duration_minutes(s)
                if terms.rate_local is not None and minutes:
                    gross_local = Decimal(minutes) / Decimal(60) * terms.rate_local
                    # Line items feed base-currency client reports.
                    gross = _q(gross_local / terms.fx) if terms.fx else _q(gross_local)
                    db.add(PayrollLineItem(
                        payroll_period_id=period_id,
                        session_id=s.id,
                        worker_id=worker_id,
                        session_type=s.session_type,
                        gross_amount=gross,
                        worker_pct=Decimal("100.00"),
                        gs_pct=Decimal("0.00"),
                        partner_pct=Decimal("0.00"),
                        worker_net=gross,
                        gs_net=Decimal("0.00"),
                        partner_net=Decimal("0.00"),
                    ))
                continue

            earnings = _session_earnings(s)
            if earnings <= 0:
                flags.append("session_missing_earnings")
                continue

            worker_pct, gs_pct, partner_pct = Decimal("100.00"), Decimal("0.00"), Decimal("0.00")
            if (
                s.session_type == SessionTypeEnum.partner_multilog
                and worker.worker_type == WorkerTypeEnum.partner_worker
                and worker.partner_entity_id
            ):
                arrangement = _active_arrangement(db, worker.partner_entity_id, period)
                if arrangement:
                    worker_pct, gs_pct, partner_pct = (
                        arrangement.worker_pct, arrangement.gs_pct, arrangement.partner_pct
                    )
                else:
                    flags.append("no_partner_arrangement")

            worker_net = _q(earnings * worker_pct / 100)
            gs_net = _q(earnings * gs_pct / 100)
            partner_net = _q(earnings - worker_net - gs_net)
            db.add(PayrollLineItem(
                payroll_period_id=period_id,
                session_id=s.id,
                worker_id=worker_id,
                session_type=s.session_type,
                gross_amount=_q(earnings),
                worker_pct=worker_pct,
                gs_pct=gs_pct,
                partner_pct=partner_pct,
                worker_net=worker_net,
                gs_net=gs_net,
                partner_net=partner_net,
            ))
            partner_base += worker_net

        if hours == 0:
            flags.append("no_hours")

        calc[worker_id] = {
            "worker": worker,
            "hours": hours,
            "terms": terms,
            "gs_local": gs_local,
            "partner_base": _q(partner_base),
            "flags": flags,
        }

    # Second pass: convert earnings and update per-worker summaries.
    for worker_id, data in calc.items():
        worker: Worker = data["worker"]
        flags = list(data["flags"])
        summary = existing_summaries.get(worker_id)
        transfer_cost = summary.transfer_cost if summary else Decimal("0")
        external_cost = summary.external_cost if summary else Decimal("0")

        # Summaries are in the payout currency (the rate's currency). The rate is
        # already in it; only base-currency partner earnings need converting.
        terms: PayTerms = data["terms"]
        local_currency = terms.currency
        fx = terms.fx
        partner_local = data["partner_base"]
        if data["partner_base"] > 0:
            if fx:
                partner_local = _q(data["partner_base"] * fx)
            elif local_currency != period.currency:
                flags.append("no_fx_rate")

        rate_local = _q(terms.rate_local) if terms.rate_local is not None else Decimal("0")
        base_pay_local = _q(data["gs_local"] + partner_local)

        bonus = summary.bonus if summary else Decimal("0")
        # Locked rows keep admin rate/bonus/costs, but hours always follow the Hours Log.
        if summary and getattr(summary, "admin_locked", False):
            summary.hours_logged = data["hours"]
            summary.base_pay = (
                _q(summary.hours_logged * summary.rate_per_hour)
                if summary.rate_per_hour is not None else summary.base_pay
            )
            summary.gross_earned = _q(summary.base_pay + bonus)
            summary.total_deductions = _q(summary.transfer_cost + summary.external_cost)
            summary.final_net = _q(summary.gross_earned - summary.total_deductions)
            if summary.fx_rate and summary.fx_rate > 0:
                summary.base_equivalent = _q(summary.final_net / summary.fx_rate)
            summary.exception_flags = list({*(summary.exception_flags or []), *flags})
            summary.updated_at = datetime.now(timezone.utc)
            db.add(summary)
            continue

        gross = _q(base_pay_local + bonus)
        deductions = _q(transfer_cost + external_cost)
        final_net = _q(gross - deductions)
        if final_net < 0:
            flags.append("negative_net")

        base_equiv = _q(final_net / fx) if fx else None

        if summary is None:
            summary = PayrollWorkerSummary(payroll_period_id=period_id, worker_id=worker_id)
        summary.hours_logged = data["hours"]
        summary.rate_per_hour = rate_local
        summary.base_pay = base_pay_local
        summary.bonus = bonus
        summary.gross_earned = gross
        summary.transfer_cost = transfer_cost
        summary.external_cost = external_cost
        summary.total_deductions = deductions
        summary.final_net = final_net
        summary.local_currency = local_currency
        summary.fx_rate = fx
        summary.base_currency = period.currency
        summary.base_equivalent = base_equiv
        summary.exception_flags = flags
        summary.updated_at = datetime.now(timezone.utc)
        db.add(summary)

    # Remove stale summaries for workers with no sessions this run (keep rows
    # carrying a manual bonus or cost, e.g. a shared-cost ledger share).
    for worker_id, summary in existing_summaries.items():
        if worker_id not in calc and summary.bonus == 0 and summary.transfer_cost == 0 and summary.external_cost == 0:
            db.delete(summary)

    period.status = PayrollPeriodStatusEnum.calculated
    db.add(period)
    db.commit()

    return {"workers": len(calc), "sessions": len(sessions), "status": period.status}


def recompute_summary(
    db: Session, summary: PayrollWorkerSummary, *, commit: bool = True,
) -> PayrollWorkerSummary:
    """Recompute derived fields after an admin cost-evaluation edit."""
    period = db.get(PayrollPeriod, summary.payroll_period_id)
    summary.base_pay = _q(summary.hours_logged * summary.rate_per_hour) if summary.rate_per_hour is not None else summary.base_pay
    summary.gross_earned = _q(summary.base_pay + summary.bonus)
    summary.total_deductions = _q(summary.transfer_cost + summary.external_cost)
    summary.final_net = _q(summary.gross_earned - summary.total_deductions)
    if period:
        if summary.admin_locked and summary.fx_rate and summary.fx_rate > 0:
            fx = summary.fx_rate
        else:
            fx = _fx_to_local(db, period, summary.local_currency)
            summary.fx_rate = fx
        summary.base_currency = period.currency
        summary.base_equivalent = _q(summary.final_net / fx) if fx and fx > 0 else None
    flags = [f for f in (summary.exception_flags or []) if f != "negative_net"]
    if summary.final_net < 0:
        flags.append("negative_net")
    summary.exception_flags = flags
    summary.updated_at = datetime.now(timezone.utc)
    db.add(summary)
    if commit:
        db.commit()
        db.refresh(summary)
    return summary


def refresh_open_summaries_for_workers(db: Session, worker_ids: Iterable[UUID]) -> int:
    """
    Re-apply each worker's current rate + currency to their payslip rows in
    open/calculated periods (after a tier is edited or assigned). Rows an admin
    locked keep their custom rate unless they are in a different currency.
    Caller commits.
    """
    ids = list({wid for wid in worker_ids if wid})
    if not ids:
        return 0
    rows = db.exec(
        select(PayrollWorkerSummary, PayrollPeriod)
        .join(PayrollPeriod, PayrollPeriod.id == PayrollWorkerSummary.payroll_period_id)
        .where(
            PayrollWorkerSummary.worker_id.in_(ids),
            PayrollPeriod.status.in_([
                PayrollPeriodStatusEnum.open,
                PayrollPeriodStatusEnum.calculated,
            ]),
        )
    ).all()
    workers = {w.id: w for w in db.exec(select(Worker).where(Worker.id.in_(ids))).all()}
    changed = 0
    for summary, period in rows:
        worker = workers.get(summary.worker_id)
        if not worker:
            continue
        terms = pay_terms(db, worker, period)
        same_currency = (summary.local_currency or "").upper() == terms.currency
        if summary.admin_locked and same_currency:
            continue
        if not same_currency and summary.local_currency and terms.currency:
            # Carry admin-entered local amounts into the new currency.
            old_fx = _fx_to_local(db, period, summary.local_currency.upper())
            if old_fx and old_fx > 0 and terms.fx:
                factor = terms.fx / old_fx
                summary.bonus = _q(summary.bonus * factor)
                summary.transfer_cost = _q(summary.transfer_cost * factor)
                summary.external_cost = _q(summary.external_cost * factor)
        summary.local_currency = terms.currency
        if terms.rate_local is not None:
            summary.rate_per_hour = _q(terms.rate_local)
        summary.fx_rate = terms.fx
        summary.base_pay = _q(summary.hours_logged * summary.rate_per_hour)
        summary.gross_earned = _q(summary.base_pay + summary.bonus)
        summary.total_deductions = _q(summary.transfer_cost + summary.external_cost)
        summary.final_net = _q(summary.gross_earned - summary.total_deductions)
        summary.base_currency = period.currency
        summary.base_equivalent = _q(summary.final_net / terms.fx) if terms.fx else None
        summary.updated_at = datetime.now(timezone.utc)
        db.add(summary)
        changed += 1
    return changed


def approve_period(db: Session, period_id: UUID, admin_user_id: UUID) -> PayrollPeriod:
    """Approve a calculated period, freezing FX rates as of pay day."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")
    if period.status != PayrollPeriodStatusEnum.calculated:
        raise ValueError("Period must be calculated before it can be approved")

    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    for summary in summaries:
        if summary.admin_locked and summary.fx_rate and summary.fx_rate > 0:
            fx = summary.fx_rate
        else:
            fx = _fx_to_local(db, period, summary.local_currency)
            summary.fx_rate = fx
        summary.base_currency = period.currency
        summary.base_equivalent = _q(summary.final_net / fx) if fx and fx > 0 else None
        db.add(summary)

    period.status = PayrollPeriodStatusEnum.approved
    period.approved_by = admin_user_id
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


def _work_dates(period: PayrollPeriod) -> str:
    start, end = period.start_date, period.end_date
    if start.year == end.year:
        return f"{start:%d %b} – {end:%d %b %Y}"
    return f"{start:%d %b %Y} – {end:%d %b %Y}"


def push_period_to_wallets(
    db: Session,
    period_id: UUID,
    admin_user_id: UUID,
    worker_ids: Optional[Iterable[UUID]] = None,
) -> dict:
    """
    Idempotently credit wallets with each worker's final net for the period.
    `worker_ids` limits the push to those workers; None means everyone.
    """
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")
    if period.status not in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
        raise ValueError("Period must be approved before pushing to wallets")

    stmt = select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    if worker_ids is not None:
        ids = list(worker_ids)
        if not ids:
            return {"credited": 0, "skipped": 0}
        stmt = stmt.where(PayrollWorkerSummary.worker_id.in_(ids))
    summaries = db.exec(stmt).all()
    work_dates = _work_dates(period)

    credited = skipped = 0
    no_fx: list[str] = []
    for summary in summaries:
        if summary.final_net <= 0:
            skipped += 1
            continue

        existing = db.exec(
            select(WalletTransaction).where(
                WalletTransaction.worker_id == summary.worker_id,
                WalletTransaction.payroll_period_id == period_id,
                WalletTransaction.tx_type == WalletTxTypeEnum.payroll_credit,
            )
        ).first()
        if existing:
            skipped += 1
            continue

        wallet = db.exec(
            select(Wallet).where(Wallet.worker_id == summary.worker_id)
        ).first()
        if not wallet:
            wallet = Wallet(worker_id=summary.worker_id, currency=summary.local_currency)
            db.add(wallet)
            db.flush()
        elif not _move_wallet_to_currency(db, wallet, summary.local_currency, admin_user_id):
            skipped += 1
            no_fx.append(str(summary.worker_id))
            continue

        db.add(WalletTransaction(
            wallet_id=wallet.id,
            worker_id=summary.worker_id,
            tx_type=WalletTxTypeEnum.payroll_credit,
            amount=summary.final_net,
            currency=summary.local_currency,
            payroll_period_id=period_id,
            note=f"Pay for work {work_dates} · {summary.hours_logged} h",
            created_by=admin_user_id,
        ))
        wallet.balance = _q(wallet.balance + summary.final_net)
        wallet.currency = summary.local_currency
        wallet.updated_at = datetime.now(timezone.utc)
        db.add(wallet)
        db.add(Notification(
            sender_admin_id=admin_user_id,
            title=f"Payment received — {period.label}",
            message=(
                f"{summary.final_net:,} {summary.local_currency} was added to your wallet "
                f"for your work {work_dates} ({summary.hours_logged} h)."
            ),
            category="payment",
            target_type="specific",
            target_worker_id=summary.worker_id,
        ))
        credited += 1

    period.wallet_pushed_at = datetime.now(timezone.utc)
    db.add(period)
    db.commit()
    result: dict = {"credited": credited, "skipped": skipped}
    if no_fx:
        result["skipped_no_fx"] = no_fx
    return result


def _move_wallet_to_currency(
    db: Session, wallet: Wallet, currency: str, admin_user_id: UUID,
) -> bool:
    """
    Switch a wallet to `currency` before crediting it. A non-zero balance is
    converted and both legs are written to the ledger. False when no FX rate.
    """
    target = (currency or "").upper()
    current = (wallet.currency or "").upper()
    if not target or current == target:
        return True
    old_balance = Decimal(wallet.balance)
    if old_balance == 0:
        wallet.currency = target
        db.add(wallet)
        return True
    rate = ensure_rate(db, current, target)
    if not rate or rate <= 0:
        return False
    new_balance = _q(old_balance * rate)
    db.add(WalletTransaction(
        wallet_id=wallet.id,
        worker_id=wallet.worker_id,
        tx_type=WalletTxTypeEnum.adjustment,
        amount=-old_balance,
        currency=current,
        note=f"Balance converted to {target} @ {rate}",
        created_by=admin_user_id,
    ))
    db.add(WalletTransaction(
        wallet_id=wallet.id,
        worker_id=wallet.worker_id,
        tx_type=WalletTxTypeEnum.adjustment,
        amount=new_balance,
        currency=target,
        note=f"Balance converted from {old_balance} {current} @ {rate}",
        created_by=admin_user_id,
    ))
    wallet.balance = new_balance
    wallet.currency = target
    db.add(wallet)
    return True


# ── Reports ────────────────────────────────────────────────────────────────────

def _revenue_split(db: Session, client: Client | None, period: PayrollPeriod) -> tuple[Decimal, Decimal]:
    gs_pct = Decimal("100.00")
    owner_pct = Decimal("0.00")
    if client:
        agreement = db.exec(
            select(ClientRevenueAgreement)
            .where(
                ClientRevenueAgreement.client_id == client.id,
                ClientRevenueAgreement.effective_from <= period.end_date,
            )
            .order_by(ClientRevenueAgreement.effective_from.desc())
        ).first()
        if agreement:
            gs_pct, owner_pct = agreement.gs_pct, agreement.owner_pct
    return gs_pct, owner_pct


def _rdp_session_minutes(session: WorkSession) -> int:
    """Payroll screenshot minutes first; otherwise connected start→finish."""
    minutes = effective_duration_minutes(session)
    if minutes > 0:
        return minutes
    if session.start_time and session.end_time:
        start = session.start_time
        end = session.end_time
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return max(0, int((end - start).total_seconds() // 60))
    return 0


def client_revenue_report(db: Session, period_id: UUID) -> list[dict]:
    """
    Per-client income and split for a period, in the period's currency.

    The split is taken from gross (see services.client_billing): income is
    what was received, else hours × rate; the client gets their % of it less
    any costs charged to them, GS keeps the rest. Worker cost is shown for
    information. ``distributable`` is the gross being split and ``owner_share``
    is the client's share, kept under their old names for existing reports.
    """
    from services import client_billing

    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    months = [m for m in client_billing.build(db, period) if m.basis or m.client_costs or m.worker_cost]
    usd_to_period = Decimal("1")
    if period.currency.upper() != client_billing.BILLING_CURRENCY:
        usd_to_period = ensure_rate(db, client_billing.BILLING_CURRENCY, period.currency) or Decimal("1")

    def conv(value: Optional[Decimal]) -> str:
        return str(_q((value or Decimal("0")) * usd_to_period))

    rows: list[dict] = []
    for m in months:
        rows.append({
            "client_id": str(m.client_id),
            "client_name": m.client_name,
            "platform": m.platform,
            "earnings": conv(m.basis),
            "expected": conv(m.expected),
            "actual": conv(m.actual) if m.actual is not None else None,
            "worker_cost": conv(m.worker_cost),
            "shared_cost": conv(m.client_costs),
            "distributable": conv(m.basis),
            "gs_pct": str(m.gs_pct),
            "owner_pct": str(m.client_pct),
            "gs_share": conv(m.gs_share),
            "owner_share": conv(m.client_share),
            "gs_margin": conv(m.gs_margin),
            "earnings_source": "entered" if m.basis_source == "actual" else "calculated",
        })
    rows.sort(key=lambda r: Decimal(r["earnings"]), reverse=True)
    return rows


def rdp_earnings_report(db: Session, period_id: UUID) -> dict:
    """
    What each RDP produced in a payment month: session hours × worker rate,
    rolled up per machine and per owner. Owner/GS shares use the client's
    current revenue agreement.
    """
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    sessions = [s for s in _sessions_for_period(db, period) if s.rdp_resource_id]
    workers = {w.id: w for w in db.exec(select(Worker)).all()}
    machines = {r.id: r for r in db.exec(select(RDPResource)).all()}
    clients = {c.id: c for c in db.exec(select(Client)).all()}
    line_by_session = {
        li.session_id: li
        for li in db.exec(
            select(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period_id)
        ).all()
    }

    buckets: dict[UUID, dict] = {}
    for session in sessions:
        rdp_id = session.rdp_resource_id
        if not rdp_id:
            continue
        worker = workers.get(session.worker_id)
        minutes = _rdp_session_minutes(session)
        hours = _q(Decimal(minutes) / Decimal(60))
        line = line_by_session.get(session.id)
        rate = Decimal("0")
        if line is not None:
            produced = _q(line.gross_amount)
            if hours > 0:
                rate = _q(produced / hours)
        else:
            if worker:
                found = _hourly_rate_for(db, worker, period)
                rate = found if found is not None else Decimal("0")
            produced = _q(hours * rate)

        bucket = buckets.setdefault(rdp_id, {
            "hours": Decimal("0"),
            "produced": Decimal("0"),
            "sessions": 0,
            "workers": {},
        })
        bucket["hours"] += hours
        bucket["produced"] += produced
        bucket["sessions"] += 1
        worker_row = bucket["workers"].setdefault(session.worker_id, {
            "worker_id": str(session.worker_id),
            "worker_name": worker.display_name if worker else "Unknown",
            "hours": Decimal("0"),
            "produced": Decimal("0"),
            "sessions": 0,
            "rate": rate,
        })
        worker_row["hours"] += hours
        worker_row["produced"] += produced
        worker_row["sessions"] += 1
        worker_row["rate"] = rate

    rdp_rows: list[dict] = []
    owner_buckets: dict[str, dict] = {}

    rdp_ids = set(buckets) | {
        r.id for r in machines.values() if r.client_id
    }
    for rdp_id in sorted(rdp_ids, key=lambda i: (machines[i].nickname if i in machines else str(i))):
        machine = machines.get(rdp_id)
        bucket = buckets.get(rdp_id, {
            "hours": Decimal("0"), "produced": Decimal("0"), "sessions": 0, "workers": {},
        })
        client = clients.get(machine.client_id) if machine and machine.client_id else None
        gs_pct, owner_pct = _revenue_split(db, client, period)
        hours = _q(bucket["hours"])
        produced = _q(bucket["produced"])
        gs_share = _q(produced * gs_pct / 100)
        owner_share = _q(produced - gs_share)
        owner_name = client_owner_name(db, client) if client else None
        owner_type = client.owner_type.value if client else None
        key = owner_rollup_key(client)

        worker_list = []
        for w in bucket["workers"].values():
            worker_list.append({
                **w,
                "hours": str(_q(w["hours"])),
                "produced": str(_q(w["produced"])),
                "rate": str(_q(w["rate"])),
            })
        worker_list.sort(key=lambda w: Decimal(w["produced"]), reverse=True)

        row = {
            "rdp_id": str(rdp_id),
            "nickname": machine.nickname if machine else "Unknown RDP",
            "country": machine.country if machine else "—",
            "client_id": str(client.id) if client else None,
            "client_name": client.name if client else "Unlinked",
            "owner_key": key,
            "owner_name": owner_name or ("Unlinked" if not client else "—"),
            "owner_type": owner_type or "unlinked",
            "hours": str(hours),
            "produced": str(produced),
            "session_count": bucket["sessions"],
            "worker_count": len(worker_list),
            "workers": worker_list,
            "gs_pct": str(gs_pct),
            "owner_pct": str(owner_pct),
            "gs_share": str(gs_share),
            "owner_share": str(owner_share),
        }
        rdp_rows.append(row)

        owner = owner_buckets.setdefault(key, {
            "owner_key": key,
            "owner_name": row["owner_name"],
            "owner_type": row["owner_type"],
            "client_ids": set(),
            "rdp_count": 0,
            "hours": Decimal("0"),
            "produced": Decimal("0"),
            "gs_share": Decimal("0"),
            "owner_share": Decimal("0"),
            "gs_pct": gs_pct,
            "owner_pct": owner_pct,
        })
        if client:
            owner["client_ids"].add(str(client.id))
        owner["rdp_count"] += 1
        owner["hours"] += hours
        owner["produced"] += produced
        owner["gs_share"] += gs_share
        owner["owner_share"] += owner_share

    rdp_rows.sort(key=lambda r: Decimal(r["produced"]), reverse=True)
    owners = []
    for owner in owner_buckets.values():
        owners.append({
            "owner_key": owner["owner_key"],
            "owner_name": owner["owner_name"],
            "owner_type": owner["owner_type"],
            "client_ids": sorted(owner["client_ids"]),
            "rdp_count": owner["rdp_count"],
            "hours": str(_q(owner["hours"])),
            "produced": str(_q(owner["produced"])),
            "gs_share": str(_q(owner["gs_share"])),
            "owner_share": str(_q(owner["owner_share"])),
            "gs_pct": str(owner["gs_pct"]),
            "owner_pct": str(owner["owner_pct"]),
        })
    owners.sort(key=lambda r: Decimal(r["owner_share"]), reverse=True)
    return {
        "currency": period.currency,
        "rdps": rdp_rows,
        "owners": owners,
    }


def purge_payroll_period(db: Session, period: PayrollPeriod) -> dict:
    """
    Permanently remove a work period and the finance/quality rows that belong
    to it. Sessions, wallet credits and email history are unlinked, not erased
    — those are worker records, not period records.
    """
    period_id = period.id
    snapshot = {
        "id": str(period.id),
        "label": period.label,
        "status": period.status.value if period.status else None,
        "start_date": period.start_date.isoformat() if period.start_date else None,
        "end_date": period.end_date.isoformat() if period.end_date else None,
    }

    db.exec(delete(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period_id))
    db.exec(
        delete(QualityCompositeScore).where(QualityCompositeScore.payroll_period_id == period_id)
    )
    db.exec(
        delete(QualityIndicatorRating).where(QualityIndicatorRating.payroll_period_id == period_id)
    )

    summary_ids = list(
        db.exec(
            select(PayrollWorkerSummary.id).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    )
    if summary_ids:
        db.exec(
            sa_update(EmailJobItem)
            .where(EmailJobItem.payroll_worker_summary_id.in_(summary_ids))
            .values(payroll_worker_summary_id=None)
        )
    db.exec(delete(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id))

    db.exec(
        sa_update(WorkSession)
        .where(WorkSession.payroll_period_id == period_id)
        .values(payroll_period_id=None)
    )
    db.exec(
        sa_update(WalletTransaction)
        .where(WalletTransaction.payroll_period_id == period_id)
        .values(payroll_period_id=None)
    )
    db.exec(
        sa_update(EmailJob)
        .where(EmailJob.payroll_period_id == period_id)
        .values(payroll_period_id=None)
    )
    db.exec(
        sa_update(EmailLog)
        .where(EmailLog.payroll_period_id == period_id)
        .values(payroll_period_id=None)
    )

    db.delete(period)
    db.commit()
    return snapshot

