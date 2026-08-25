"""add client period earnings

Revision ID: b6c7d8e9f0a1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_period_earnings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id"),
            nullable=False,
        ),
        sa.Column(
            "payroll_period_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("payroll_periods.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("amount >= 0", name="ck_client_period_earnings_amount_non_negative"),
        sa.UniqueConstraint(
            "client_id",
            "payroll_period_id",
            name="uq_client_period_earnings_client_period",
        ),
    )
    op.create_index(
        "ix_client_period_earnings_client_id",
        "client_period_earnings",
        ["client_id"],
    )
    op.create_index(
        "ix_client_period_earnings_payroll_period_id",
        "client_period_earnings",
        ["payroll_period_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_client_period_earnings_payroll_period_id", table_name="client_period_earnings")
    op.drop_index("ix_client_period_earnings_client_id", table_name="client_period_earnings")
    op.drop_table("client_period_earnings")
