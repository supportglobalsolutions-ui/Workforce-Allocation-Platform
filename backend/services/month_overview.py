"""
One working month at a glance: the six month-end steps and where the money went.

    collected = client shares + costs charged to clients + worker pay + GS margin

All money is in USD. Worker pay is what payslips pay out (final net), converted
from each payslip's currency.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlmodel import Session, select

from models.client_payout import ClientPayout
from models.enums import PayrollPeriodStatusEnum, WalletTxTypeEnum
from models.hours_log import HoursLogEntry
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.rdp_machine import RDPResource
from models.wallet import WalletTransaction
from services import client_billing
from services.client_billing import ZERO, _q, _to_usd

DONE_AFTER_CALCULATE = (
    PayrollPeriodStatusEnum.calculated, PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid,
)
DONE_AFTER_APPROVE = (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid)


def _step(key: str, title: str, done: bool, detail: str, href: str, issues: Optional[list[str]] = None) -> dict:
    return {"key": key, "title": title, "done": done, "detail": detail, "href": href, "issues": issues or []}


def _worker_pay_usd(db: Session, period: PayrollPeriod, summaries: list[PayrollWorkerSummary]) -> Decimal:
    base_total = ZERO
    for s in summaries:
        if s.base_equivalent is not None:
            base_total += Decimal(s.base_equivalent)
        elif s.fx_rate and s.fx_rate > 0:
            base_total += Decimal(s.final_net) / Decimal(s.fx_rate)
    usd = _to_usd(db, base_total, period.currency)
    return _q(usd if usd is not None else base_total)


def build(db: Session, period: PayrollPeriod) -> dict:
    pid = period.id
    q = f"?period={pid}"

    # 1 Hours
    log = db.exec(select(HoursLogEntry).where(HoursLogEntry.payroll_period_id == pid)).all()
    desks = {d.id: d for d in db.exec(select(RDPResource)).all()}
    total_hours = sum((Decimal(r.hours) for r in log), ZERO)
    workers_with_hours = {r.worker_id for r in log if r.hours > 0}
    manual_rows = sum(1 for r in log if r.is_manual)
    no_desktop_hours = sum((Decimal(r.hours) for r in log if r.rdp_resource_id is None), ZERO)
    clientless = {
        r.rdp_resource_id for r in log
        if r.hours > 0 and r.rdp_resource_id and desks.get(r.rdp_resource_id) and not desks[r.rdp_resource_id].client_id
    }
    hour_issues = []
    if no_desktop_hours:
        hour_issues.append(f"{_q(no_desktop_hours)} h logged with no desktop.")
    if clientless:
        names = ", ".join(sorted(desks[d].nickname or "Unnamed" for d in clientless)[:5])
        hour_issues.append(f"{len(clientless)} desktop(s) with hours but no client: {names}.")

    # 2 Client earnings
    months = client_billing.build(db, period)
    billed = [m for m in months if m.billed_hours or m.actual is not None or m.expected is not None]
    missing_actual = [m for m in billed if m.actual is None and (m.expected or ZERO) > 0]
    client_warnings = sum(len(m.warnings) for m in months)
    sums = client_billing.totals(months)

    # 3 Worker pay, 5 Pay workers
    summaries = db.exec(select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == pid)).all()
    payable = [s for s in summaries if s.final_net and s.final_net > 0]
    credited = db.exec(
        select(func.count(func.distinct(WalletTransaction.worker_id))).where(
            WalletTransaction.payroll_period_id == pid,
            WalletTransaction.tx_type == WalletTxTypeEnum.payroll_credit,
        )
    ).one()
    credited = int(credited or 0)

    # 6 Pay clients
    payouts = db.exec(select(ClientPayout).where(ClientPayout.payroll_period_id == pid)).all()
    paid_payouts = [p for p in payouts if p.status == "paid"]
    owed_clients = [m for m in months if m.client_share > 0]

    status = period.status
    steps = [
        _step(
            "hours", "Hours", total_hours > 0,
            f"{_q(total_hours)} h for {len(workers_with_hours)} worker(s) · {manual_rows} typed by hand",
            f"/admin/payroll/hours{q}", hour_issues,
        ),
        _step(
            "clients", "Client earnings", bool(billed) and not missing_actual,
            f"{len(billed)} client(s) billed · {len(missing_actual)} still waiting for received income",
            f"/admin/clients/ledger{q}",
            [f"{client_warnings} client warning(s) on the ledger."] if client_warnings else [],
        ),
        _step(
            "worker_pay", "Worker pay", status in DONE_AFTER_CALCULATE,
            f"{len(summaries)} payslip(s)" + ("" if status in DONE_AFTER_CALCULATE else " · not calculated yet"),
            "/admin/payroll/calculate",
        ),
        _step(
            "approve", "Approve", status in DONE_AFTER_APPROVE,
            "Approved: rates are frozen" if status in DONE_AFTER_APPROVE else "Approving freezes worker and client exchange rates",
            "/admin/payroll",
        ),
        _step(
            "pay_workers", "Pay workers",
            credited >= len(payable) and (bool(payable) or status in DONE_AFTER_APPROVE),
            f"{credited} of {len(payable)} wallet(s) credited",
            "/admin/wallets",
        ),
        _step(
            "pay_clients", "Pay clients",
            len(paid_payouts) >= len(owed_clients) and (bool(owed_clients) or status in DONE_AFTER_APPROVE),
            f"{len(paid_payouts)} of {len(owed_clients)} client(s) paid",
            f"/admin/payroll/client-payouts{q}",
        ),
    ]

    collected = Decimal(sums["basis"])
    client_shares = Decimal(sums["client_share"])
    costs = Decimal(sums["client_costs"])
    worker_pay = _worker_pay_usd(db, period, list(summaries))
    margin = _q(collected - client_shares - costs - worker_pay)

    clients = [
        {
            "client_id": str(m.client_id),
            "client_name": m.client_name,
            "billed_hours": str(m.billed_hours) if m.billed_hours is not None else None,
            "expected": str(m.expected) if m.expected is not None else None,
            "actual": str(m.actual) if m.actual is not None else None,
            "basis": str(m.basis),
            "client_pct": str(m.client_pct),
            "client_costs": str(m.client_costs),
            "client_share": str(m.client_share),
            "gs_share": str(m.gs_share),
            "worker_cost": str(m.worker_cost),
            "gs_margin": str(m.gs_margin),
            "payout_status": m.payout_status,
            "warnings": m.warnings,
        }
        for m in months if m.basis or m.client_costs or m.billed_hours
    ]

    return {
        "period_id": str(pid),
        "period_label": period.label,
        "status": status.value if hasattr(status, "value") else str(status),
        "currency": client_billing.BILLING_CURRENCY,
        "steps": steps,
        "kpis": {
            "collected": str(_q(collected)),
            "expected": sums["expected"],
            "client_shares": str(_q(client_shares)),
            "costs": str(_q(costs)),
            "worker_pay": str(worker_pay),
            "gs_margin": str(margin),
            "hours": str(_q(total_hours)),
        },
        "clients": clients,
    }
