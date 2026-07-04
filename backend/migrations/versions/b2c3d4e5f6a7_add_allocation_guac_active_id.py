"""add allocation guacamole active connection id

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-04

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "allocations",
        sa.Column("guacamole_active_connection_id", sa.String(128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("allocations", "guacamole_active_connection_id")
