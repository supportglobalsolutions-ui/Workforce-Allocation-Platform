"""rename firebase_uid to auth_user_id

Revision ID: c8d9e0f1a2b3
Revises: b6c7d8e9f0a1
Create Date: 2026-09-13
"""

from typing import Sequence, Union

from alembic import op


revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("admin_users", "firebase_uid", new_column_name="auth_user_id")
    op.execute(
        "ALTER TABLE admin_users RENAME CONSTRAINT admin_users_firebase_uid_key TO admin_users_auth_user_id_key"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE admin_users RENAME CONSTRAINT admin_users_auth_user_id_key TO admin_users_firebase_uid_key"
    )
    op.alter_column("admin_users", "auth_user_id", new_column_name="firebase_uid")
