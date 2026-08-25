"""Store replay data for failed direct emails.

Successful messages and one-time-password messages never populate this field.
Queued payslips and broadcasts are rebuilt from their existing job rows.

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-25 10:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_log", sa.Column("retry_payload", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("email_log", "retry_payload")
