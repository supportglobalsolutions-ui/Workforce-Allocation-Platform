"""Test Month: is_test flags on workers and payroll_periods.

Revision ID: 7a3e91c4d2f8
Revises: c0571ed9e3a4
Create Date: 2026-10-08

Test workers' records only ever join the Test Month and real workers' records
only real months, so the Test Month can share the current month's dates.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "7a3e91c4d2f8"
down_revision: Union[str, None] = "c0571ed9e3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workers",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "payroll_periods",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_payroll_periods_one_test",
        "payroll_periods",
        ["is_test"],
        unique=True,
        postgresql_where=sa.text("is_test IS TRUE"),
    )


def downgrade() -> None:
    op.drop_index("uq_payroll_periods_one_test", table_name="payroll_periods")
    op.drop_column("payroll_periods", "is_test")
    op.drop_column("workers", "is_test")
