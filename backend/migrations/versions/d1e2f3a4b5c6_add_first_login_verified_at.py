"""add first_login_verified_at for login OTP

Revision ID: d1e2f3a4b5c6
Revises: c8d9e0f1a2b3
Create Date: 2026-09-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "admin_users",
        sa.Column("first_login_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Existing accounts are treated as already past first-login verification.
    # New signups keep NULL until they complete login OTP once.
    op.execute(
        "UPDATE admin_users SET first_login_verified_at = COALESCE(created_at, NOW()) "
        "WHERE first_login_verified_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("admin_users", "first_login_verified_at")
