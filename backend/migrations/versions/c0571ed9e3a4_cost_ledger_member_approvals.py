"""Shared-cost ledger and monthly member approvals.

Revision ID: c0571ed9e3a4
Revises: e9f0a1b2c3d4
Create Date: 2026-10-07

Existing work months get member_approval_required = false so deploying this
does not lock every worker out of their RDPs; months created afterwards start
with it on (set by the application) and every member unapproved.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c0571ed9e3a4"
down_revision: Union[str, None] = "e9f0a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)


def _id() -> sa.Column:
    return sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"), nullable=False)


def upgrade() -> None:
    op.add_column(
        "payroll_periods",
        sa.Column("member_approval_required", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.create_table(
        "cost_ledger_entries",
        _id(),
        sa.Column(
            "payroll_period_id", _UUID,
            sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("target_field", sa.String(32), nullable=False),
        sa.Column("worker_pool_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("worker_mode", sa.String(16), server_default="equal", nullable=False),
        sa.Column("client_mode", sa.String(16), server_default="equal", nullable=False),
        sa.Column("created_by", _UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("total_amount > 0", name="ck_cost_ledger_entries_total_positive"),
        sa.CheckConstraint(
            "worker_pool_pct >= 0 AND worker_pool_pct <= 100",
            name="ck_cost_ledger_entries_worker_pool_pct",
        ),
        sa.CheckConstraint(
            "target_field IN ('bonus', 'transfer_cost', 'external_cost')",
            name="ck_cost_ledger_entries_target_field",
        ),
        sa.CheckConstraint("worker_mode IN ('equal', 'percent')", name="ck_cost_ledger_entries_worker_mode"),
        sa.CheckConstraint("client_mode IN ('equal', 'percent')", name="ck_cost_ledger_entries_client_mode"),
    )
    op.create_index("ix_cost_ledger_entries_payroll_period_id", "cost_ledger_entries", ["payroll_period_id"])

    op.create_table(
        "cost_ledger_allocations",
        _id(),
        sa.Column(
            "entry_id", _UUID,
            sa.ForeignKey("cost_ledger_entries.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("worker_id", _UUID, sa.ForeignKey("workers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("client_id", _UUID, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=True),
        sa.Column("pool_pct", sa.Numeric(7, 4), nullable=False),
        sa.Column("amount_base", sa.Numeric(14, 2), nullable=False),
        sa.Column("amount_local", sa.Numeric(14, 2), nullable=True),
        sa.Column("local_currency", sa.String(3), nullable=True),
        sa.CheckConstraint(
            "(worker_id IS NOT NULL) <> (client_id IS NOT NULL)",
            name="ck_cost_ledger_allocations_one_recipient",
        ),
    )
    op.create_index("ix_cost_ledger_allocations_entry_id", "cost_ledger_allocations", ["entry_id"])
    op.create_index("ix_cost_ledger_allocations_worker_id", "cost_ledger_allocations", ["worker_id"])
    op.create_index("ix_cost_ledger_allocations_client_id", "cost_ledger_allocations", ["client_id"])

    op.create_table(
        "period_member_approvals",
        _id(),
        sa.Column(
            "payroll_period_id", _UUID,
            sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("worker_id", _UUID, sa.ForeignKey("workers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("approved_by", _UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("payroll_period_id", "worker_id", name="uq_period_member_approvals_period_worker"),
    )
    op.create_index(
        "ix_period_member_approvals_payroll_period_id", "period_member_approvals", ["payroll_period_id"],
    )
    op.create_index("ix_period_member_approvals_worker_id", "period_member_approvals", ["worker_id"])


def downgrade() -> None:
    op.drop_index("ix_period_member_approvals_worker_id", table_name="period_member_approvals")
    op.drop_index("ix_period_member_approvals_payroll_period_id", table_name="period_member_approvals")
    op.drop_table("period_member_approvals")
    op.drop_index("ix_cost_ledger_allocations_client_id", table_name="cost_ledger_allocations")
    op.drop_index("ix_cost_ledger_allocations_worker_id", table_name="cost_ledger_allocations")
    op.drop_index("ix_cost_ledger_allocations_entry_id", table_name="cost_ledger_allocations")
    op.drop_table("cost_ledger_allocations")
    op.drop_index("ix_cost_ledger_entries_payroll_period_id", table_name="cost_ledger_entries")
    op.drop_table("cost_ledger_entries")
    op.drop_column("payroll_periods", "member_approval_required")
