"""Several worked start/end blocks per session.

Revision ID: b3f6a9c2e815
Revises: d4f7a2b9c613
Create Date: 2026-10-09

A worker who takes breaks inside one RDP session records each stretch worked
(e.g. 10:00–11:00, 13:00–14:00); paid work time is their sum.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b3f6a9c2e815"
down_revision: Union[str, None] = "d4f7a2b9c613"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("work_blocks", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("sessions", "work_blocks")
