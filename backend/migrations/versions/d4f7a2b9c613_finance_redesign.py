"""Finance redesign: Hours Log, client billing columns, client tiers and payouts.

Revision ID: d4f7a2b9c613
Revises: 5e2a8d1c7b40
Create Date: 2026-10-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d4f7a2b9c613"
down_revision: Union[str, None] = "5e2a8d1c7b40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)

_EARNING_COLUMNS = (
    ("received_on", sa.Date()),
    ("billed_hours_manual", sa.Numeric(10, 2)),
    ("billed_hours", sa.Numeric(10, 2)),
    ("rate_used", sa.Numeric(12, 2)),
    ("expected_amount", sa.Numeric(14, 2)),
    ("client_pct_used", sa.Numeric(5, 2)),
    ("client_share", sa.Numeric(14, 2)),
    ("gs_share", sa.Numeric(14, 2)),
)


def upgrade() -> None:
    # Clients: tier, desktop-hours switch, payout details.
    op.add_column(
        "clients",
        sa.Column("payment_tier_id", _UUID, sa.ForeignKey("payment_tiers.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "clients", sa.Column("hours_from_desktops", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("clients", sa.Column("payout_currency", sa.String(3), nullable=True))
    op.add_column("clients", sa.Column("payout_email", sa.String(255), nullable=True))
    op.add_column("clients", sa.Column("payout_method", sa.String(64), nullable=True))
    op.add_column("clients", sa.Column("payout_details", sa.Text(), nullable=True))

    # Tiers can be for workers, clients or both.
    op.add_column(
        "payment_tiers", sa.Column("applies_to", sa.String(16), server_default="workers", nullable=False),
    )
    op.create_check_constraint(
        "ck_payment_tiers_applies_to", "payment_tiers", "applies_to IN ('workers', 'clients', 'both')",
    )

    # Monthly client billing: amount becomes "actual received" and may be blank.
    op.alter_column("client_period_earnings", "amount", existing_type=sa.Numeric(14, 2), nullable=True)
    for name, col_type in _EARNING_COLUMNS:
        op.add_column("client_period_earnings", sa.Column(name, col_type, nullable=True))
    op.add_column(
        "client_period_earnings",
        sa.Column("client_costs", sa.Numeric(14, 2), server_default="0", nullable=False),
    )

    op.create_table(
        "hours_log",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "payroll_period_id", _UUID, sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("worker_id", _UUID, sa.ForeignKey("workers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rdp_resource_id", _UUID, sa.ForeignKey("rdp_resources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("hours", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("session_hours", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("is_manual", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("updated_by", _UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("hours >= 0", name="ck_hours_log_hours_non_negative"),
    )
    op.create_index("ix_hours_log_payroll_period_id", "hours_log", ["payroll_period_id"])
    op.create_index("ix_hours_log_worker_id", "hours_log", ["worker_id"])
    op.create_index("ix_hours_log_rdp_resource_id", "hours_log", ["rdp_resource_id"])
    op.create_index(
        "uq_hours_log_period_worker_rdp",
        "hours_log",
        ["payroll_period_id", "worker_id", "rdp_resource_id"],
        unique=True,
        postgresql_where=sa.text("rdp_resource_id IS NOT NULL"),
    )
    op.create_index(
        "uq_hours_log_period_worker_no_rdp",
        "hours_log",
        ["payroll_period_id", "worker_id"],
        unique=True,
        postgresql_where=sa.text("rdp_resource_id IS NULL"),
    )

    op.create_table(
        "client_payouts",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("client_id", _UUID, sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "payroll_period_id", _UUID, sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("amount_usd", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("fx_rate", sa.Numeric(18, 6), nullable=True),
        sa.Column("amount_local", sa.Numeric(16, 2), nullable=True),
        sa.Column("status", sa.String(16), server_default="draft", nullable=False),
        sa.Column("statement_path", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("paid_by", _UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("client_id", "payroll_period_id", name="uq_client_payouts_client_period"),
        sa.CheckConstraint("status IN ('draft', 'sent', 'paid')", name="ck_client_payouts_status"),
    )
    op.create_index("ix_client_payouts_client_id", "client_payouts", ["client_id"])
    op.create_index("ix_client_payouts_payroll_period_id", "client_payouts", ["payroll_period_id"])


def downgrade() -> None:
    op.drop_index("ix_client_payouts_payroll_period_id", table_name="client_payouts")
    op.drop_index("ix_client_payouts_client_id", table_name="client_payouts")
    op.drop_table("client_payouts")

    op.drop_index("uq_hours_log_period_worker_no_rdp", table_name="hours_log")
    op.drop_index("uq_hours_log_period_worker_rdp", table_name="hours_log")
    op.drop_index("ix_hours_log_rdp_resource_id", table_name="hours_log")
    op.drop_index("ix_hours_log_worker_id", table_name="hours_log")
    op.drop_index("ix_hours_log_payroll_period_id", table_name="hours_log")
    op.drop_table("hours_log")

    op.drop_column("client_period_earnings", "client_costs")
    for name, _ in reversed(_EARNING_COLUMNS):
        op.drop_column("client_period_earnings", name)
    op.execute("UPDATE client_period_earnings SET amount = 0 WHERE amount IS NULL")
    op.alter_column("client_period_earnings", "amount", existing_type=sa.Numeric(14, 2), nullable=False)

    op.drop_constraint("ck_payment_tiers_applies_to", "payment_tiers", type_="check")
    op.drop_column("payment_tiers", "applies_to")

    for name in ("payout_details", "payout_method", "payout_email", "payout_currency", "hours_from_desktops"):
        op.drop_column("clients", name)
    op.drop_column("clients", "payment_tier_id")
