"""cost ledger: category, Global Solutions share, distribute later

A cost is now recorded first (category, description, amount) and distributed
later across workers, clients and Global Solutions. Entries that already exist
were split when they were saved, so they are marked distributed.

Revision ID: c7d2e4f61a93
Revises: e2b5d8c13f16
Create Date: 2026-10-14
"""
import sqlalchemy as sa
from alembic import op

revision = "c7d2e4f61a93"
down_revision = "e2b5d8c13f16"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cost_ledger_entries", sa.Column("category", sa.String(64), nullable=True))
    op.add_column(
        "cost_ledger_entries",
        sa.Column("gs_pool_pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )
    op.add_column(
        "cost_ledger_entries",
        sa.Column("gs_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
    )
    op.add_column("cost_ledger_entries", sa.Column("distributed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(
        """
        UPDATE cost_ledger_entries SET
            category = CASE target_field
                WHEN 'transfer_cost' THEN 'Transfer cost'
                WHEN 'bonus' THEN 'Bonus'
                ELSE 'External cost' END,
            distributed_at = created_at
        """
    )
    op.alter_column("cost_ledger_entries", "category", nullable=False)
    op.create_check_constraint(
        "ck_cost_ledger_entries_gs_pool_pct",
        "cost_ledger_entries",
        "gs_pool_pct >= 0 AND worker_pool_pct + gs_pool_pct <= 100",
    )


def downgrade() -> None:
    op.drop_constraint("ck_cost_ledger_entries_gs_pool_pct", "cost_ledger_entries", type_="check")
    op.drop_column("cost_ledger_entries", "distributed_at")
    op.drop_column("cost_ledger_entries", "gs_amount")
    op.drop_column("cost_ledger_entries", "gs_pool_pct")
    op.drop_column("cost_ledger_entries", "category")
