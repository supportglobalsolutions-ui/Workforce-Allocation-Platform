"""
Payroll calculation engine.

Monthly cycle: open period → calculate (this module) → admin cost evaluation →
approve (FX snapshot on pay day) → push nets to wallets → payslip emails.

Calculation rules (confirmed by client):
- GS workers: approved session hours × hourly rate → base pay.
- Partner workers: the worker's-hours portion of platform earnings, split by the
  partner arrangement (worker % / GS % / partner %); worker share is their pay.
- Bonus is manual only. Transfer cost is set per worker and/or via country pools
  (pool allocated across the country's workers proportional to hours).
- Client revenue splits (GS vs account owner) apply only AFTER worker costs.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlmodel import Session, delete, select

from models.client import Client, ClientRevenueAgreement
from models.enums import (
    PayrollPeriodStatusEnum,
    PayrollSessionEnum,
    SessionTypeEnum,
    WalletTxTypeEnum,
    WorkerTypeEnum,
)
from models.notification import Notification
from models.partner import PartnerArrangement
from models.payroll import CountryCostPool, PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.rate_table import RateTableEntry
from models.session import Session as WorkSession
from models.wallet import Wallet, WalletTransaction
from models.worker import Worker
from services.fx import currency_for_country, get_rate

logger = logging.getLogger(__name__)

TWO_DP = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def _fx_to_local(db: Session, period: PayrollPeriod, local_currency: str) -> Optional[Decimal]:
    """Base→local conversion rate; 1 when the worker is paid in the base currency."""
    if local_currency == period.currency:
        return Decimal("1")
    return get_rate(db, period.currency, local_currency)


def _rate_entry_for(db: Session, worker: Worker, period: PayrollPeriod) -> Optional[RateTableEntry]:
    """Latest applicable rate entry: worker-specific first, then pay-tier."""
    stmt = (
        select(RateTableEntry)
        .where(
            RateTableEntry.worker_id == worker.id,
            RateTableEntry.effective_from <= period.end_date,
        )
        .order_by(RateTableEntry.effective_from.desc())
    )
    entry = db.exec(stmt).first()
    if not entry:
        entry = db.exec(
            select(RateTableEntry)
            .where(
                RateTableEntry.worker_id.is_(None),
                RateTableEntry.pay_tier == worker.pay_tier,
                RateTableEntry.effective_from <= period.end_date,
            )
            .order_by(RateTableEntry.effective_from.desc())
        ).first()
    if not entry:
        return None
    if entry.effective_to and entry.effective_to < period.start_date:
        return None
    return entry


def _hourly_rate_for(db: Session, worker: Worker, period: PayrollPeriod) -> Optional[Decimal]:
    """Latest applicable hourly rate: worker-specific first, then pay-tier."""
    entry = _rate_entry_for(db, worker, period)
    return entry.amount if entry else None


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


def calculate_period(db: Session, period_id: UUID) -> dict:
    """(Re)calculate line items + per-worker payslip summaries for a period."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")
    if period.status in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
        raise ValueError("Period is already approved — reopen it before recalculating")

    sessions = db.exec(
        select(WorkSession).where(
            WorkSession.payroll_approval_state == PayrollSessionEnum.approved,
            WorkSession.start_time >= datetime.combine(period.start_date, datetime.min.time(), tzinfo=timezone.utc),
            WorkSession.start_time <= datetime.combine(period.end_date, datetime.max.time(), tzinfo=timezone.utc),
        )
    ).all()

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

    pools = {
        p.country: p
        for p in db.exec(
            select(CountryCostPool).where(CountryCostPool.payroll_period_id == period_id)
        ).all()
    }

    # First pass: hours + base pay per worker, and line items per session.
    calc: dict[UUID, dict] = {}
    for worker_id, worker_sessions in by_worker.items():
        worker = workers.get(worker_id)
        if not worker:
            continue

        hours = Decimal(sum(s.duration_minutes or 0 for s in worker_sessions)) / Decimal(60)
        hours = _q(hours)
        rate = _hourly_rate_for(db, worker, period)
        flags: list[str] = []
        base_pay = Decimal("0")

        # GS RDP hours × rate
        gs_minutes = sum(
            s.duration_minutes or 0 for s in worker_sessions
            if s.session_type == SessionTypeEnum.gs_rdp
        )
        gs_hours = _q(Decimal(gs_minutes) / Decimal(60))
        if gs_hours > 0:
            if rate is None:
                flags.append("no_rate")
            else:
                base_pay += gs_hours * rate

        # Partner / third-party earnings with splits
        for s in worker_sessions:
            if s.session_type == SessionTypeEnum.gs_rdp:
                if rate is not None and s.duration_minutes:
                    gross = _q(Decimal(s.duration_minutes) / Decimal(60) * rate)
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
            base_pay += worker_net

        if hours == 0:
            flags.append("no_hours")

        calc[worker_id] = {
            "worker": worker,
            "hours": hours,
            "rate": rate or Decimal("0"),
            "base_pay": _q(base_pay),
            "flags": flags,
        }

    # Second pass: allocate country cost pools proportional to hours.
    country_hours: dict[str, Decimal] = {}
    for data in calc.values():
        country_hours[data["worker"].country] = (
            country_hours.get(data["worker"].country, Decimal("0")) + data["hours"]
        )

    for worker_id, data in calc.items():
        worker: Worker = data["worker"]
        pool = pools.get(worker.country)
        transfer_cost = external_cost = Decimal("0")
        if pool and country_hours.get(worker.country, Decimal("0")) > 0:
            share = data["hours"] / country_hours[worker.country]
            transfer_cost = _q(pool.transfer_cost_total * share)
            external_cost = _q(pool.external_cost_total * share)

        flags = list(data["flags"])

        # Sessions, rates and cost pools are all in the period's base currency
        # (USD/GBP). Summaries store LOCAL amounts, so convert base → local here;
        # bonus and manual cost overrides are entered in local currency already.
        local_currency = currency_for_country(db, worker.country) or period.currency
        fx = _fx_to_local(db, period, local_currency)
        if fx is None or fx <= 0:
            flags.append("no_fx_rate")
            local_currency = period.currency
            fx_used = Decimal("1")
            fx = None
        else:
            fx_used = fx

        rate_local = _q(data["rate"] * fx_used)
        base_pay_local = _q(data["base_pay"] * fx_used)
        transfer_cost = _q(transfer_cost * fx_used)
        external_cost = _q(external_cost * fx_used)

        summary = existing_summaries.get(worker_id)
        bonus = summary.bonus if summary else Decimal("0")
        # Manual per-worker cost overrides survive recalculation when no pool exists.
        if summary and not pool:
            transfer_cost = summary.transfer_cost
            external_cost = summary.external_cost

        gross = _q(base_pay_local + bonus)
        deductions = _q(transfer_cost + external_cost)
        final_net = _q(gross - deductions)
        if final_net < 0:
            flags.append("negative_net")

        base_equiv = _q(final_net / fx_used)

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

    # Remove stale summaries for workers with no sessions this run (keep manual bonus rows).
    for worker_id, summary in existing_summaries.items():
        if worker_id not in calc and summary.bonus == 0:
            db.delete(summary)

    period.status = PayrollPeriodStatusEnum.calculated
    db.add(period)
    db.commit()

    return {"workers": len(calc), "sessions": len(sessions), "status": period.status}


def recompute_summary(db: Session, summary: PayrollWorkerSummary) -> PayrollWorkerSummary:
    """Recompute derived fields after an admin cost-evaluation edit."""
    period = db.get(PayrollPeriod, summary.payroll_period_id)
    summary.base_pay = _q(summary.hours_logged * summary.rate_per_hour) if summary.rate_per_hour else summary.base_pay
    summary.gross_earned = _q(summary.base_pay + summary.bonus)
    summary.total_deductions = _q(summary.transfer_cost + summary.external_cost)
    summary.final_net = _q(summary.gross_earned - summary.total_deductions)
    if period:
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
    db.commit()
    db.refresh(summary)
    return summary


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


def push_period_to_wallets(db: Session, period_id: UUID, admin_user_id: UUID) -> dict:
    """Idempotently credit each worker's wallet with their final net for the period."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")
    if period.status not in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
        raise ValueError("Period must be approved before pushing to wallets")

    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()

    credited = skipped = 0
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

        db.add(WalletTransaction(
            wallet_id=wallet.id,
            worker_id=summary.worker_id,
            tx_type=WalletTxTypeEnum.payroll_credit,
            amount=summary.final_net,
            currency=summary.local_currency,
            payroll_period_id=period_id,
            note=f"Payroll {period.label}",
            created_by=admin_user_id,
        ))
        wallet.balance = _q(wallet.balance + summary.final_net)
        wallet.currency = summary.local_currency
        wallet.updated_at = datetime.now(timezone.utc)
        db.add(wallet)
        db.add(Notification(
            sender_admin_id=admin_user_id,
            title=f"Payroll credited — {period.label}",
            message=(
                f"Your wallet was credited {summary.final_net} {summary.local_currency} "
                f"for payroll period {period.label}."
            ),
            category="payment",
            target_type="specific",
            target_worker_id=summary.worker_id,
        ))
        credited += 1

    period.wallet_pushed_at = datetime.now(timezone.utc)
    db.add(period)
    db.commit()
    return {"credited": credited, "skipped": skipped}


# ── Reports ────────────────────────────────────────────────────────────────────

def client_revenue_report(db: Session, period_id: UUID) -> list[dict]:
    """
    Per-client earnings + revenue share for a period.
    Split order (confirmed): earnings − worker costs = distributable → GS/owner split.
    Worker costs per client = worker pay on the client's sessions plus a
    proportional share of that worker's period deductions.
    """
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    line_items = db.exec(
        select(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period_id)
    ).all()
    if not line_items:
        return []

    session_ids = [li.session_id for li in line_items]
    sessions = {
        s.id: s for s in db.exec(select(WorkSession).where(WorkSession.id.in_(session_ids))).all()
    }
    summaries = {
        s.worker_id: s
        for s in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    }

    # Worker's total gross this period → to prorate deductions per line item.
    worker_gross_totals: dict[UUID, Decimal] = {}
    for li in line_items:
        worker_gross_totals[li.worker_id] = worker_gross_totals.get(li.worker_id, Decimal("0")) + li.gross_amount

    per_client: dict[Optional[UUID], dict] = {}
    for li in line_items:
        session = sessions.get(li.session_id)
        client_id = session.client_id if session else None
        bucket = per_client.setdefault(client_id, {
            "earnings": Decimal("0"), "worker_cost": Decimal("0"),
        })
        bucket["earnings"] += li.gross_amount

        worker_cost = li.worker_net
        summary = summaries.get(li.worker_id)
        total_gross = worker_gross_totals.get(li.worker_id, Decimal("0"))
        if summary and total_gross > 0:
            # Summary deductions are stored in local currency — convert back to base.
            deductions_base = summary.total_deductions
            if summary.fx_rate and summary.fx_rate > 0:
                deductions_base = summary.total_deductions / summary.fx_rate
            worker_cost += deductions_base * (li.gross_amount / total_gross)
        bucket["worker_cost"] += worker_cost

    clients = {c.id: c for c in db.exec(select(Client)).all()}
    rows: list[dict] = []
    for client_id, bucket in per_client.items():
        client = clients.get(client_id) if client_id else None
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

        earnings = _q(bucket["earnings"])
        worker_cost = _q(bucket["worker_cost"])
        distributable = _q(earnings - worker_cost)
        gs_share = _q(distributable * gs_pct / 100)
        owner_share = _q(distributable - gs_share)
        rows.append({
            "client_id": str(client_id) if client_id else None,
            "client_name": client.name if client else "Unattributed",
            "platform": client.platform if client else "—",
            "earnings": str(earnings),
            "worker_cost": str(worker_cost),
            "distributable": str(distributable),
            "gs_pct": str(gs_pct),
            "owner_pct": str(owner_pct),
            "gs_share": str(gs_share),
            "owner_share": str(owner_share),
        })
    rows.sort(key=lambda r: Decimal(r["earnings"]), reverse=True)
    return rows
