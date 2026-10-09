"""Worker requests to edit or delete approved shifts.

Revision ID: 5e2a8d1c7b40
Revises: 9b1f3c7e5d24
Create Date: 2026-10-08
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "5e2a8d1c7b40"
down_revision: Union[str, None] = "9b1f3c7e5d24"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "shift_change_requests",
        sa.Column("id", _UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("shift_id", _UUID, sa.ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("worker_id", _UUID, sa.ForeignKey("workers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("old_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("old_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("new_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("status", sa.String(16), server_default="pending", nullable=False),
        sa.Column("reviewed_by", _UUID, sa.ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("admin_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('edit', 'delete')", name="ck_shift_change_requests_kind"),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_shift_change_requests_status",
        ),
        sa.CheckConstraint(
            "kind = 'delete' OR (new_start IS NOT NULL AND new_end IS NOT NULL AND new_end > new_start)",
            name="ck_shift_change_requests_edit_times",
        ),
    )
    op.create_index("ix_shift_change_requests_shift_id", "shift_change_requests", ["shift_id"])
    op.create_index("ix_shift_change_requests_worker_id", "shift_change_requests", ["worker_id"])
    op.create_index(
        "uq_shift_change_requests_one_pending",
        "shift_change_requests",
        ["shift_id"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("uq_shift_change_requests_one_pending", table_name="shift_change_requests")
    op.drop_index("ix_shift_change_requests_worker_id", table_name="shift_change_requests")
    op.drop_index("ix_shift_change_requests_shift_id", table_name="shift_change_requests")
    op.drop_table("shift_change_requests")
