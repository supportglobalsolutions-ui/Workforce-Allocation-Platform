"""Add USD/hr billing rate on clients for rate-sheet imports.

Revision ID: f5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-09-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f5b6c7d8e9f0"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clients",
        sa.Column("billing_rate_usd", sa.Numeric(precision=10, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clients", "billing_rate_usd")
