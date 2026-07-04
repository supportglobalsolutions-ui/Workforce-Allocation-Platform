"""add rdp monitor fields for uptime kuma

Revision ID: a1b2c3d4e5f6
Revises: 24cc3a8f148d
Create Date: 2026-06-29

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "24cc3a8f148d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("rdp_resources", sa.Column("monitor_host", sa.String(255), nullable=True))
    op.add_column("rdp_resources", sa.Column("monitor_port", sa.Integer(), nullable=True))
    op.add_column(
        "rdp_resources",
        sa.Column(
            "status_changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_column("rdp_resources", "status_changed_at")
    op.drop_column("rdp_resources", "monitor_port")
    op.drop_column("rdp_resources", "monitor_host")
