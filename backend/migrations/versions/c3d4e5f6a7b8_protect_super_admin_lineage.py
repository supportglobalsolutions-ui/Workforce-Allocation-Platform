"""Protect founder Super Admins and record who created each account.

Revision ID: c3d4e5f6a7b8
Revises: b2d3e4f5a6c7
Create Date: 2026-09-15

A Super Admin you add must not be able to delete or demote you. We store the
creator's auth uid on admin_users. Two founder emails are also flagged
is_protected so nobody — including other Super Admins — can remove them.
"""
from alembic import op
from sqlalchemy import text

from core.config import settings

revision = "c3d4e5f6a7b8"
down_revision = "b2d3e4f5a6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS created_by_auth_user_id VARCHAR(128)"
    )
    op.execute(
        "ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_admin_users_created_by_auth_user_id "
        "ON admin_users (created_by_auth_user_id)"
    )
    bind = op.get_bind()
    for email in settings.protected_super_admin_emails:
        bind.execute(
            text("UPDATE admin_users SET is_protected = true WHERE lower(email) = :email"),
            {"email": email},
        )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_admin_users_created_by_auth_user_id")
    op.execute("ALTER TABLE admin_users DROP COLUMN IF EXISTS is_protected")
    op.execute("ALTER TABLE admin_users DROP COLUMN IF EXISTS created_by_auth_user_id")
