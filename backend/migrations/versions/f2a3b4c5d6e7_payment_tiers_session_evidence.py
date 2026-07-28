"""Payment tiers, session image times, and sticky payroll summary locks.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

payment_tier_unit = postgresql.ENUM(
    "per_hour",
    "per_day",
    "per_week",
    "per_month",
    "per_task",
    name="payment_tier_unit_enum",
    create_type=False,
)


def upgrade() -> None:
    payment_tier_unit.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "payment_tiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("unit", payment_tier_unit, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("name", name="uq_payment_tiers_name"),
    )

    op.add_column("sessions", sa.Column("image_start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sessions", sa.Column("image_end_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "payroll_worker_summaries",
        sa.Column("admin_locked", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("payroll_worker_summaries", "admin_locked")
    op.drop_column("sessions", "image_end_at")
    op.drop_column("sessions", "image_start_at")
    op.drop_table("payment_tiers")
    payment_tier_unit.drop(op.get_bind(), checkfirst=True)
