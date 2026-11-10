"""Client splits: up to three recipients of a client's net distributable per month.

Revision ID: c3f81a6d9e42
Revises: b7e2c94a1d38
Create Date: 2026-10-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c3f81a6d9e42"
down_revision: Union[str, None] = "b7e2c94a1d38"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_split_recipients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("payroll_period_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("payroll_periods.id"), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(120), nullable=True),
        sa.Column("pct", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("client_id", "payroll_period_id", "slot", name="uq_client_split_recipients_slot"),
        sa.CheckConstraint("slot BETWEEN 1 AND 3", name="ck_client_split_recipients_slot"),
        sa.CheckConstraint("pct >= 0 AND pct <= 100", name="ck_client_split_recipients_pct"),
    )
    op.create_index("ix_client_split_recipients_client_id", "client_split_recipients", ["client_id"])
    op.create_index("ix_client_split_recipients_payroll_period_id", "client_split_recipients", ["payroll_period_id"])


def downgrade() -> None:
    op.drop_index("ix_client_split_recipients_payroll_period_id", "client_split_recipients")
    op.drop_index("ix_client_split_recipients_client_id", "client_split_recipients")
    op.drop_table("client_split_recipients")
