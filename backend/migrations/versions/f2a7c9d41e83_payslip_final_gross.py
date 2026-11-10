"""Admin final gross per worker payslip (override, confirmation).

Revision ID: f2a7c9d41e83
Revises: e8c41d7a2f56
Create Date: 2026-10-09

calculated_gross = rate x hours + bonus (backfilled from base_pay + bonus);
gross_override, when set, replaces it and deductions come off it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f2a7c9d41e83"
down_revision: Union[str, None] = "e8c41d7a2f56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payroll_worker_summaries", sa.Column("calculated_gross", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("payroll_worker_summaries", sa.Column("gross_override", sa.Numeric(14, 2), nullable=True))
    op.add_column("payroll_worker_summaries", sa.Column("final_confirmed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "payroll_worker_summaries",
        sa.Column("final_confirmed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("admin_users.id"), nullable=True),
    )
    # Existing rows: their gross so far was exactly base pay + bonus.
    op.execute("UPDATE payroll_worker_summaries SET calculated_gross = base_pay + bonus")


def downgrade() -> None:
    op.drop_column("payroll_worker_summaries", "final_confirmed_by")
    op.drop_column("payroll_worker_summaries", "final_confirmed_at")
    op.drop_column("payroll_worker_summaries", "gross_override")
    op.drop_column("payroll_worker_summaries", "calculated_gross")
