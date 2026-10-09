"""Test mode only: put one month's finance back to zero.

Clears the month's payslips, line items, wallet credits, shared costs and
client earnings and reopens it, so an admin can type hours and rates afresh
(e.g. 5 h at 20 USD/h) and watch the money flow again. Work evidence (shifts,
sessions, absences) is kept. Callers must check the request is in the test
copy — see routers/payroll.py.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, update as sa_update
from sqlmodel import Session, select

from models.client import ClientPeriodEarning
from models.cost_ledger import CostLedgerEntry
from models.email_job import EmailJobItem
from models.enums import PayrollPeriodStatusEnum
from models.payroll import PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.wallet import Wallet, WalletTransaction


def reset_period_finance(db: Session, period: PayrollPeriod) -> dict:
    """Zero the month's finance. Caller commits."""
    summary_ids = list(db.exec(
        select(PayrollWorkerSummary.id).where(PayrollWorkerSummary.payroll_period_id == period.id)
    ).all())
    if summary_ids:
        db.exec(
            sa_update(EmailJobItem)
            .where(EmailJobItem.payroll_worker_summary_id.in_(summary_ids))
            .values(payroll_worker_summary_id=None)
        )

    # Take this month's credits back out of the wallets they went into.
    credits = db.exec(select(WalletTransaction).where(WalletTransaction.payroll_period_id == period.id)).all()
    by_wallet: dict = {}
    for tx in credits:
        by_wallet[tx.wallet_id] = by_wallet.get(tx.wallet_id, Decimal("0")) + Decimal(tx.amount)
    for wallet_id, amount in by_wallet.items():
        wallet = db.get(Wallet, wallet_id)
        if wallet:
            wallet.balance = Decimal(wallet.balance) - amount
            wallet.updated_at = datetime.now(timezone.utc)
            db.add(wallet)
    db.exec(delete(WalletTransaction).where(WalletTransaction.payroll_period_id == period.id))

    db.exec(delete(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period.id))
    db.exec(delete(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period.id))
    db.exec(delete(CostLedgerEntry).where(CostLedgerEntry.payroll_period_id == period.id))
    db.exec(delete(ClientPeriodEarning).where(ClientPeriodEarning.payroll_period_id == period.id))

    period.status = PayrollPeriodStatusEnum.open
    period.approved_by = None
    period.export_generated_at = None
    period.wallet_pushed_at = None
    period.paid_at = None
    db.add(period)
    return {
        "payslips_removed": len(summary_ids),
        "wallet_credits_removed": len(credits),
        "period_status": period.status.value,
    }
