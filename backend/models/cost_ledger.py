"""
Shared-cost ledger and monthly member approvals.

A ledger entry is one cost for a work month, entered once in the month's
reporting currency with a category and a description. It is distributed later
across workers, clients and Global Solutions. Each worker or client share is an
allocation row; worker shares are added to the payslip field the category maps
to, client shares are deducted from that client's earnings before the
GS / account-owner split, and the Global Solutions share is a GS expense.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

COST_TARGET_FIELDS = ("bonus", "transfer_cost", "external_cost")
SPLIT_MODES = ("equal", "percent")


class CostLedgerEntry(SQLModel, table=True):
    __tablename__ = "cost_ledger_entries"
    __table_args__ = (
        CheckConstraint("total_amount > 0", name="ck_cost_ledger_entries_total_positive"),
        CheckConstraint(
            "worker_pool_pct >= 0 AND worker_pool_pct <= 100",
            name="ck_cost_ledger_entries_worker_pool_pct",
        ),
        CheckConstraint(
            "target_field IN ('bonus', 'transfer_cost', 'external_cost')",
            name="ck_cost_ledger_entries_target_field",
        ),
        CheckConstraint("worker_mode IN ('equal', 'percent')", name="ck_cost_ledger_entries_worker_mode"),
        CheckConstraint("client_mode IN ('equal', 'percent')", name="ck_cost_ledger_entries_client_mode"),
        CheckConstraint(
            "gs_pool_pct >= 0 AND worker_pool_pct + gs_pool_pct <= 100",
            name="ck_cost_ledger_entries_gs_pool_pct",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    # e.g. "Transfer cost", "External cost" or one the admin typed.
    category: str = Field(sa_column=Column(String(64), nullable=False))
    # The description.
    title: str = Field(sa_column=Column(String(255), nullable=False))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # In the period's reporting currency.
    total_amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    target_field: str = Field(sa_column=Column(String(32), nullable=False))
    # Shares of the total for workers and Global Solutions; the rest goes to clients.
    worker_pool_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    gs_pool_pct: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(5, 2), nullable=False, server_default="0"),
    )
    # What Global Solutions bears, in the reporting currency.
    gs_amount: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(14, 2), nullable=False, server_default="0"),
    )
    # Null until the cost is distributed; an undistributed cost touches no payslip or client.
    distributed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    worker_mode: str = Field(default="equal", sa_column=Column(String(16), nullable=False, server_default="equal"))
    client_mode: str = Field(default="equal", sa_column=Column(String(16), nullable=False, server_default="equal"))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class CostLedgerAllocation(SQLModel, table=True):
    """One recipient's share of a ledger entry (exactly one of worker / client)."""

    __tablename__ = "cost_ledger_allocations"
    __table_args__ = (
        CheckConstraint(
            "(worker_id IS NOT NULL) <> (client_id IS NOT NULL)",
            name="ck_cost_ledger_allocations_one_recipient",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    entry_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("cost_ledger_entries.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id", ondelete="CASCADE"), nullable=True, index=True),
    )
    client_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=True, index=True),
    )
    # Share of its pool (worker or client), 0-100.
    pool_pct: Decimal = Field(sa_column=Column(Numeric(7, 4), nullable=False))
    amount_base: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    # Worker shares only: what was written to the payslip, in the payslip's currency.
    amount_local: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    local_currency: Optional[str] = Field(default=None, sa_column=Column(String(3), nullable=True))


class PeriodMemberApproval(SQLModel, table=True):
    """A member approved to work (RDPs, shifts) during one work month."""

    __tablename__ = "period_member_approvals"
    __table_args__ = (
        UniqueConstraint("payroll_period_id", "worker_id", name="uq_period_member_approvals_period_worker"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    approved_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
    )
    approved_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
