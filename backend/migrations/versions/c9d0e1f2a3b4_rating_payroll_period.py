"""Add payroll_period_id to quality_indicator_ratings.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-21 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'quality_indicator_ratings',
        sa.Column('payroll_period_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_quality_ratings_payroll_period',
        'quality_indicator_ratings',
        'payroll_periods',
        ['payroll_period_id'],
        ['id'],
    )
    op.create_index(
        'ix_quality_indicator_ratings_payroll_period_id',
        'quality_indicator_ratings',
        ['payroll_period_id'],
    )
    op.create_index(
        'uq_quality_rating_worker_indicator_period',
        'quality_indicator_ratings',
        ['worker_id', 'indicator_id', 'payroll_period_id'],
        unique=True,
        postgresql_where=sa.text('payroll_period_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_quality_rating_worker_indicator_period', table_name='quality_indicator_ratings')
    op.drop_index('ix_quality_indicator_ratings_payroll_period_id', table_name='quality_indicator_ratings')
    op.drop_constraint('fk_quality_ratings_payroll_period', 'quality_indicator_ratings', type_='foreignkey')
    op.drop_column('quality_indicator_ratings', 'payroll_period_id')
