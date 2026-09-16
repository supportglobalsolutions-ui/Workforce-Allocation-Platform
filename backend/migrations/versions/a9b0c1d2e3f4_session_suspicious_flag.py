"""Add admin-only suspicious flag on sessions.

Revision ID: a9b0c1d2e3f4
Revises: 8f1c04a97b62
Create Date: 2026-09-16

Admins can mark a session suspicious when evidence screenshots do not
match the claimed work. Workers never set or see this in the UI.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a9b0c1d2e3f4"
down_revision: Union[str, None] = "8f1c04a97b62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "suspicious",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_sessions_suspicious",
        "sessions",
        ["suspicious"],
        unique=False,
        postgresql_where=sa.text("suspicious IS TRUE"),
    )


def downgrade() -> None:
    op.drop_index("ix_sessions_suspicious", table_name="sessions")
    op.drop_column("sessions", "suspicious")
