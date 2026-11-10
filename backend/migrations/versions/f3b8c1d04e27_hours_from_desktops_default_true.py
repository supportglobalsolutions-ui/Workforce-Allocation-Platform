"""hours_from_desktops defaults on for new clients

Revision ID: f3b8c1d04e27
Revises: e2b5d8c13f16
Create Date: 2026-10-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f3b8c1d04e27"
down_revision: Union[str, None] = "a7c3e9d15b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "clients",
        "hours_from_desktops",
        existing_type=sa.Boolean(),
        server_default="true",
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "clients",
        "hours_from_desktops",
        existing_type=sa.Boolean(),
        server_default="false",
        existing_nullable=False,
    )
