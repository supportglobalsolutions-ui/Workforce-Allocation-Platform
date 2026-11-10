"""Finance rework: payee payouts, income entries, admin-added sessions, month bypass.

Received client amounts already typed on the ledger become client-payout
income entries in USD (the ledger columns are kept).
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "e2b5d8c13f16"
down_revision = "e1a4c7b92d05"
branch_labels = None
depends_on = None


def _ts(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()"))


def upgrade():
    op.create_table(
        "payee_payouts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("payee_id", UUID(as_uuid=True), sa.ForeignKey("payees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payroll_period_id", UUID(as_uuid=True),
                  sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount_usd", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("fx_rate", sa.Numeric(18, 6), nullable=True),
        sa.Column("amount_local", sa.Numeric(16, 2), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("statement_path", sa.Text, nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reference", sa.String(255), nullable=True),
        sa.Column("paid_by", UUID(as_uuid=True), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.UniqueConstraint("payee_id", "payroll_period_id", name="uq_payee_payouts_payee_period"),
        sa.CheckConstraint("status IN ('draft', 'sent', 'paid')", name="ck_payee_payouts_status"),
    )
    op.create_index("ix_payee_payouts_payee_id", "payee_payouts", ["payee_id"])
    op.create_index("ix_payee_payouts_payroll_period_id", "payee_payouts", ["payroll_period_id"])

    op.create_table(
        "payee_payout_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("payout_id", UUID(as_uuid=True),
                  sa.ForeignKey("payee_payouts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("amount_usd", sa.Numeric(14, 2), nullable=False),
        sa.UniqueConstraint("payout_id", "client_id", name="uq_payee_payout_lines_payout_client"),
    )
    op.create_index("ix_payee_payout_lines_payout_id", "payee_payout_lines", ["payout_id"])
    op.create_index("ix_payee_payout_lines_client_id", "payee_payout_lines", ["client_id"])

    op.create_table(
        "income_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("payroll_period_id", UUID(as_uuid=True),
                  sa.ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        sa.Column("fx_rate", sa.Numeric(18, 6), nullable=False, server_default="1"),
        sa.Column("amount_usd", sa.Numeric(14, 2), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("client_id", UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("received_on", sa.Date, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True),
                  sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        _ts("created_at"),
        _ts("updated_at"),
        sa.CheckConstraint("category IN ('client_payout', 'gs_account', 'other')", name="ck_income_entries_category"),
        sa.CheckConstraint("amount >= 0", name="ck_income_entries_amount_non_negative"),
    )
    op.create_index("ix_income_entries_payroll_period_id", "income_entries", ["payroll_period_id"])
    op.create_index("ix_income_entries_client_id", "income_entries", ["client_id"])

    op.add_column("sessions", sa.Column("title", sa.String(160), nullable=True))
    op.add_column("sessions", sa.Column("added_by_admin", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("sessions", sa.Column("rate_override", sa.Numeric(12, 2), nullable=True))

    op.add_column("payroll_periods", sa.Column("bypass_reason", sa.Text, nullable=True))
    op.add_column("payroll_periods", sa.Column(
        "bypassed_by", UUID(as_uuid=True), sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True,
    ))
    op.add_column("payroll_periods", sa.Column("bypassed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("payroll_periods", sa.Column("bypassed_issues", JSONB, nullable=True))

    op.execute(
        """
        INSERT INTO income_entries
               (payroll_period_id, category, amount, currency, fx_rate, amount_usd, client_id, received_on)
        SELECT payroll_period_id, 'client_payout', amount, 'USD', 1, amount, client_id, received_on
          FROM client_period_earnings
         WHERE amount IS NOT NULL
        """
    )


def downgrade():
    for col in ("bypassed_issues", "bypassed_at", "bypassed_by", "bypass_reason"):
        op.drop_column("payroll_periods", col)
    for col in ("rate_override", "added_by_admin", "title"):
        op.drop_column("sessions", col)
    op.drop_table("income_entries")
    op.drop_table("payee_payout_lines")
    op.drop_table("payee_payouts")
