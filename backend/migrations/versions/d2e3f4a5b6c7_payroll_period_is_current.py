"""Pin a shared current work period on payroll_periods.

Revision ID: d2e3f4a5b6c7
Revises: 10d4e5f6a7b8
Create Date: 2026-08-19 15:50:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "10d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "payroll_periods",
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_payroll_periods_one_current",
        "payroll_periods",
        ["is_current"],
        unique=True,
        postgresql_where=sa.text("is_current IS TRUE"),
    )

    conn = op.get_bind()
    covering = conn.execute(
        sa.text(
            "SELECT id FROM payroll_periods "
            "WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE "
            "ORDER BY start_date DESC LIMIT 1"
        )
    ).first()
    if covering:
        conn.execute(
            sa.text("UPDATE payroll_periods SET is_current = true WHERE id = :id"),
            {"id": covering[0]},
        )
    else:
        latest = conn.execute(
            sa.text("SELECT id FROM payroll_periods ORDER BY start_date DESC LIMIT 1")
        ).first()
        if latest:
            conn.execute(
                sa.text("UPDATE payroll_periods SET is_current = true WHERE id = :id"),
                {"id": latest[0]},
            )


def downgrade() -> None:
    op.drop_index("uq_payroll_periods_one_current", table_name="payroll_periods")
    op.drop_column("payroll_periods", "is_current")
