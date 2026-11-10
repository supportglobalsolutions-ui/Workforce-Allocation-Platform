"""
Shared finance dashboard summary: checks and money totals for a payroll period.

    Global Solutions keeps = total income − payee payouts − worker pay − expenses

Total income is every Income tab entry (client account payouts, GS account,
other). Payee payouts are the recipients' amounts other than Global Solutions.
Worker pay is what payslips pay out (final net). Expenses are transfer costs,
the shared and one-off costs on the ledger, and Global Solutions' share of the
distributed costs on the Costs tab. All money is in USD.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlmodel import Session, select

from models.admin_users import AdminUser
from models.client_payout import PayeePayout
from models.enums import PayrollSessionEnum, WalletTxTypeEnum
from models.hours_log import HoursLogEntry
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.session import Session as WorkSession
from models.wallet import WalletTransaction
from services import client_billing, cost_ledger, income, month_checks
from services.client_billing import ZERO, _q, _to_usd
from services.session_evidence import work_minutes

def _base_to_usd(db: Session, period: PayrollPeriod, base: Decimal) -> Decimal:
    usd = _to_usd(db, base, period.currency)
    return _q(usd if usd is not None else base)


def _summary_base(s: PayrollWorkerSummary) -> Decimal:
    if s.base_equivalent is not None:
        return Decimal(s.base_equivalent)
    if s.fx_rate and s.fx_rate > 0:
        return Decimal(s.final_net) / Decimal(s.fx_rate)
    return ZERO


def _worker_pay_usd(db: Session, period: PayrollPeriod, summaries: list[PayrollWorkerSummary]) -> Decimal:
    return _base_to_usd(db, period, sum((_summary_base(s) for s in summaries), ZERO))


def _admin_session_pay_usd(
    db: Session, period: PayrollPeriod, summaries: dict, worker_ids: Optional[set] = None,
) -> tuple[Decimal, Decimal]:
    """(hours, USD pay) of admin-added sessions, at each session's rate or the payslip rate."""
    rows = db.exec(
        select(WorkSession).where(
            WorkSession.payroll_period_id == period.id,
            WorkSession.added_by_admin.is_(True),
            WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
            WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
        )
    ).all()
    hours_total = base_total = ZERO
    for s in rows:
        hours = Decimal(work_minutes(s)) / Decimal(60)
        hours_total += hours
        summary = summaries.get(s.worker_id)
        rate = s.rate_override if s.rate_override is not None else (summary.rate_per_hour if summary else None)
        if rate is None or summary is None or not summary.fx_rate or summary.fx_rate <= 0:
            continue
        base_total += hours * Decimal(rate) / Decimal(summary.fx_rate)
    return _q(hours_total), _base_to_usd(db, period, base_total)


def build(db: Session, period: PayrollPeriod) -> dict:
    pid = period.id

    # 1 Hours
    log = db.exec(select(HoursLogEntry).where(HoursLogEntry.payroll_period_id == pid)).all()
    total_hours = sum((Decimal(r.hours) for r in log), ZERO)
    workers_with_hours = {r.worker_id for r in log if r.hours > 0}

    # 2 Income and client splits
    months = client_billing.build(db, period)
    sums = client_billing.totals(months)
    entries = income.entries_for(db, pid)
    income_totals = income.totals(entries)
    active_clients = [m for m in months if m.billing or m.net_distributable or m.client_costs or m.billed_hours]
    checks = month_checks.issues(db, period, months)
    blocking = month_checks.blocking_issues(checks)
    blocked = bool(blocking) and not month_checks.is_bypassed(period, blocking)

    # 3 Worker pay, 5 Pay workers
    summaries = db.exec(select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == pid)).all()
    payable = [s for s in summaries if s.final_net and s.final_net > 0]
    credited_worker_ids = set(db.exec(
        select(WalletTransaction.worker_id).where(
            WalletTransaction.payroll_period_id == pid,
            WalletTransaction.tx_type == WalletTxTypeEnum.payroll_credit,
        )
    ).all())

    # 6 Pay payees
    payouts = db.exec(select(PayeePayout).where(PayeePayout.payroll_period_id == pid)).all()
    paid_payouts = [p for p in payouts if p.status == "paid"]
    status = period.status
    income_total = Decimal(income_totals["total_usd"])
    payee_payouts = Decimal(sums["payout_amount"])
    payee_paid = _q(sum((Decimal(p.amount_usd) for p in paid_payouts), ZERO))
    worker_pay = _worker_pay_usd(db, period, list(summaries))
    pending_worker_pay = _worker_pay_usd(
        db, period, [s for s in payable if s.worker_id not in credited_worker_ids],
    )
    by_worker = {s.worker_id: s for s in summaries}
    admin_hours, admin_pay = _admin_session_pay_usd(db, period, by_worker)
    admin_pay = min(admin_pay, worker_pay) if worker_pay > 0 else admin_pay
    transfer = _q(sum((Decimal(s.transfer_cost or 0) / Decimal(s.fx_rate) for s in summaries
                       if s.transfer_cost and s.fx_rate and s.fx_rate > 0), ZERO))
    transfer = _base_to_usd(db, period, transfer)
    shared = _q(sum((m.shared_costs for m in months), ZERO))
    one_off = _q(sum((m.one_off_costs for m in months), ZERO))
    # Global Solutions' own share of the month's distributed costs.
    gs_costs = _base_to_usd(db, period, _q(cost_ledger.gs_shared_costs(db, period.id)))
    expenses = _q(transfer + shared + one_off + gs_costs)
    gs_keeps = _q(income_total - payee_payouts - worker_pay - expenses)

    bypassed_by = db.get(AdminUser, period.bypassed_by) if period.bypassed_by else None
    clients = [
        {
            "client_id": str(m.client_id),
            "client_name": m.client_name,
            "billed_hours": str(m.billed_hours) if m.billed_hours is not None else None,
            "expected": str(m.expected) if m.expected is not None else None,
            "actual": str(m.actual) if m.actual is not None else None,
            "billing": str(m.billing),
            "client_costs": str(m.client_costs),
            "worker_cost": str(m.worker_cost),
            "transfer_cost": str(m.transfer_cost),
            "net_distributable": str(m.net_distributable),
            "payout_amount": str(m.payout_amount),
            "gs_amount": str(m.gs_amount),
            "split_check": m.split_check,
            "recipients": [
                {"name": r["name"], "pct": str(r["pct"]), "amount": str(r["amount"]), "is_gs": r["is_gs"]}
                for r in m.recipients
            ],
            "payout_status": m.payout_status,
            "warnings": m.warnings,
        }
        for m in active_clients
    ]

    return {
        "period_id": str(pid),
        "period_label": period.label,
        "status": status.value if hasattr(status, "value") else str(status),
        "currency": client_billing.BILLING_CURRENCY,
        "checks": {
            "issues": checks,
            "blocked": blocked,
            "bypass": {
                "reason": period.bypass_reason,
                "by": bypassed_by.display_name if bypassed_by else None,
                "at": period.bypassed_at.isoformat() if period.bypassed_at else None,
            } if period.bypassed_at else None,
        },
        "kpis": {
            "income_total": str(_q(income_total)),
            "income_by_category": income_totals["by_category"],
            "expected": sums["expected"],
            "revenue": sums["billing"],
            "payee_payouts": str(_q(payee_payouts)),
            "payee_paid": str(payee_paid),
            "payee_pending": str(_q(payee_payouts - payee_paid)),
            "worker_pay": str(worker_pay),
            "worker_pay_admin_sessions": str(admin_pay),
            "worker_pay_desktops": str(_q(worker_pay - admin_pay)),
            "admin_session_hours": str(admin_hours),
            "worker_pay_pending": str(pending_worker_pay),
            "transfer_costs": str(transfer),
            "shared_costs": str(shared),
            "one_off_costs": str(one_off),
            "gs_costs": str(gs_costs),
            "expenses": str(expenses),
            "gs_keeps": str(gs_keeps),
            "gs_split_amount": sums["gs_amount"],
            "net_distributable": sums["net_distributable"],
            "hours": str(_q(total_hours)),
            "workers": str(len(workers_with_hours)),
            "entries_logged": str(len(log)),
        },
        "clients": clients,
    }
