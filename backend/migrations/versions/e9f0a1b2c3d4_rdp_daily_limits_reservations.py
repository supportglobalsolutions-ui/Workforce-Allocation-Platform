"""RDP daily hour budgets and claim reservations.

Revision ID: e9f0a1b2c3d4
Revises: d8e3f9c51026
Create Date: 2026-09-24

Outlier-style per-machine daily limits (admin-configurable hours) plus
reservation rows that hold a seat for a worker during a time window.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "d8e3f9c51026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rdp_resources",
        sa.Column(
            "daily_limit_hours",
            sa.Numeric(4, 2),
            nullable=False,
            server_default=sa.text("12"),
        ),
    )
    op.create_table(
        "rdp_claim_reservations",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "rdp_resource_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("rdp_resources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "worker_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("workers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("admin_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_rdp_claim_reservations_rdp_window",
        "rdp_claim_reservations",
        ["rdp_resource_id", "starts_at", "ends_at"],
        unique=False,
    )
    op.create_index(
        "ix_rdp_claim_reservations_worker",
        "rdp_claim_reservations",
        ["worker_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_rdp_claim_reservations_worker", table_name="rdp_claim_reservations")
    op.drop_index("ix_rdp_claim_reservations_rdp_window", table_name="rdp_claim_reservations")
    op.drop_table("rdp_claim_reservations")
    op.drop_column("rdp_resources", "daily_limit_hours")
