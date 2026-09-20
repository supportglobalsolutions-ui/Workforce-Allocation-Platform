"""Add mobile-money payout identity fields on workers.

Revision ID: f4a5b6c7d8e9
Revises: f3a4b5c6d7e8
Create Date: 2026-09-19

Payroll exports need the registered wallet name and provider (MTN, Airtel,
etc.) separately from the employee display name. Phone remains in auth
metadata; these two columns live on workers so admins can query them without
hitting Supabase per row.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workers",
        sa.Column("mobile_money_name", sa.String(length=60), nullable=True),
    )
    op.add_column(
        "workers",
        sa.Column("mobile_money_provider", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workers", "mobile_money_provider")
    op.drop_column("workers", "mobile_money_name")
