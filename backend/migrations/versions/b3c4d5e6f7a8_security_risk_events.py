"""Add security_risk_events for admin threat scoring.

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-08-21 18:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "security_risk_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("admin_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("points", sa.Integer(), server_default="0", nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["admin_user_id"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_risk_events_admin_user_id", "security_risk_events", ["admin_user_id"])
    op.create_index("ix_security_risk_events_event_type", "security_risk_events", ["event_type"])
    op.create_index("ix_security_risk_events_created_at", "security_risk_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_security_risk_events_created_at", table_name="security_risk_events")
    op.drop_index("ix_security_risk_events_event_type", table_name="security_risk_events")
    op.drop_index("ix_security_risk_events_admin_user_id", table_name="security_risk_events")
    op.drop_table("security_risk_events")
