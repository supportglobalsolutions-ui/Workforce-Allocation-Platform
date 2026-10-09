"""Extra inboxes for test-mode email.

Revision ID: 9b1f3c7e5d24
Revises: 4c8d2e6f1a93
Create Date: 2026-10-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "9b1f3c7e5d24"
down_revision: Union[str, None] = "4c8d2e6f1a93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column("test_mode_emails", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "test_mode_emails")
