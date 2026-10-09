"""RDP daily window start hour (EAT).

Revision ID: 4c8d2e6f1a93
Revises: 7a3e91c4d2f8
Create Date: 2026-10-08

Each machine's day budget becomes a clock window that opens at this hour and
lasts daily_limit_hours (10 + 12h = 10:00–22:00 EAT; 22 + 12h = 22:00–10:00).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "4c8d2e6f1a93"
down_revision: Union[str, None] = "7a3e91c4d2f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rdp_resources",
        sa.Column("daily_window_start_hour", sa.SmallInteger(), nullable=False, server_default=sa.text("10")),
    )
    op.create_check_constraint(
        "ck_rdp_resources_window_start_hour",
        "rdp_resources",
        "daily_window_start_hour BETWEEN 0 AND 23",
    )


def downgrade() -> None:
    op.drop_constraint("ck_rdp_resources_window_start_hour", "rdp_resources", type_="check")
    op.drop_column("rdp_resources", "daily_window_start_hour")
