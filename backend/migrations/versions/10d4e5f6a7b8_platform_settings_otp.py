"""Platform settings singleton, OTP challenges, and the seeded alert inbox.

Revision ID: 10d4e5f6a7b8
Revises: f9a0b1c2d3e4
Create Date: 2026-08-17 23:40:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "10d4e5f6a7b8"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alert_email", sa.String(255), nullable=False),
        sa.Column("alert_email_previous", sa.String(255), nullable=True),
        sa.Column("alert_email_changed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        "INSERT INTO platform_settings (id, alert_email) "
        "VALUES ('00000000-0000-4000-8000-000000000001'::uuid, "
        "'peterkelvinkibiru1532@gmail.com')"
    )

    op.create_table(
        "admin_otp_challenges",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(64), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("sent_to", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by"], ["admin_users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_admin_otp_challenges_purpose", "admin_otp_challenges", ["purpose"])
    op.create_index("ix_admin_otp_challenges_target_id", "admin_otp_challenges", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_admin_otp_challenges_target_id", table_name="admin_otp_challenges")
    op.drop_index("ix_admin_otp_challenges_purpose", table_name="admin_otp_challenges")
    op.drop_table("admin_otp_challenges")
    op.drop_table("platform_settings")
