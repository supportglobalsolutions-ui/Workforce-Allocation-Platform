"""Remove the country cost-pool feature.

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-21 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("country_cost_pools")


def downgrade() -> None:
    op.create_table(
        "country_cost_pools",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("payroll_period_id", sa.UUID(), nullable=False),
        sa.Column("country", sa.String(64), nullable=False),
        sa.Column("transfer_cost_total", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("external_cost_total", sa.Numeric(14, 2), server_default="0.00", nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["payroll_period_id"], ["payroll_periods.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "payroll_period_id",
            "country",
            name="uq_country_cost_pool_period_country",
        ),
    )
    op.create_index(
        "ix_country_cost_pools_payroll_period_id",
        "country_cost_pools",
        ["payroll_period_id"],
    )
