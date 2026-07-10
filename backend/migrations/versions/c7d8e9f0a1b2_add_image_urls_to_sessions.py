"""add_image_urls_to_sessions

Revision ID: c7d8e9f0a1b2
Revises: f0572adde1a0
Create Date: 2026-07-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c7d8e9f0a1b2'
down_revision: Union[str, None] = 'f0572adde1a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('sessions', sa.Column('start_image_url', sa.Text(), nullable=True))
    op.add_column('sessions', sa.Column('end_image_url', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('sessions', 'end_image_url')
    op.drop_column('sessions', 'start_image_url')
