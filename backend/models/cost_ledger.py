"""
Shared-cost ledger and monthly member approvals.

A ledger entry is one cost (or bonus) for a work month, entered once in the
month's reporting currency and split across workers and/or clients. Each
recipient's share is an allocation row; worker shares are added to the chosen
payslip field, client shares are deducted from that client's earnings before
the GS / account-owner split.
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
    title: str = Field(sa_column=Column(String(255), nullable=False))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # In the period's reporting currency.
    total_amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    target_field: str = Field(sa_column=Column(String(32), nullable=False))
    # Share of the total that goes to workers; the rest goes to clients.
    worker_pool_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
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
