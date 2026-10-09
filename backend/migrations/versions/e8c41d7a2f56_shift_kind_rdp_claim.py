"""Shift kind: normal shift or RDP claim shift.

Revision ID: e8c41d7a2f56
Revises: b3f6a9c2e815
Create Date: 2026-10-09

Existing shifts stay normal shifts. A claim shift is booked on one RDP and,
once approved, holds that machine for its worker during its hours.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e8c41d7a2f56"
down_revision: Union[str, None] = "b3f6a9c2e815"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "shifts",
        sa.Column("kind", sa.String(16), nullable=False, server_default=sa.text("'shift'")),
    )
    op.create_check_constraint("ck_shifts_kind", "shifts", "kind IN ('shift', 'rdp_claim')")
    op.create_index(
        "ix_shifts_claim_rdp_window",
        "shifts",
        ["rdp_resource_id", "scheduled_start", "scheduled_end"],
        postgresql_where=sa.text("kind = 'rdp_claim'"),
    )


def downgrade() -> None:
    op.drop_index("ix_shifts_claim_rdp_window", table_name="shifts")
    op.drop_constraint("ck_shifts_kind", "shifts", type_="check")
    op.drop_column("shifts", "kind")
