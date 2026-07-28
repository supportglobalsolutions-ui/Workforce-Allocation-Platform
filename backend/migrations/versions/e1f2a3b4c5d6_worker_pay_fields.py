"""Add worker pay_amount and pay_frequency.

Revision ID: e1f2a3b4c5d6
Revises: c9d0e1f2a3b4
Create Date: 2026-07-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('workers', sa.Column('pay_amount', sa.Numeric(12, 2), nullable=True))
    op.add_column('workers', sa.Column('pay_frequency', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('workers', 'pay_frequency')
    op.drop_column('workers', 'pay_amount')
