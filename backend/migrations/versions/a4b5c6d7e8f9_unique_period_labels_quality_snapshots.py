"""Unique payroll period labels and quality score snapshots per period.

Revision ID: a4b5c6d7e8f9
Revises: f2a3b4c5d6e7
Create Date: 2026-08-17 13:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4b5c6d7e8f9"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE payroll_periods SET label = trim(to_char(start_date, 'FMMonth YYYY'))"
    ))
    rows = conn.execute(sa.text(
        "SELECT id, label FROM payroll_periods ORDER BY label, created_at, id"
    )).fetchall()
    seen: dict[str, int] = {}
    for row in rows:
        period_id, label = row[0], row[1]
        count = seen.get(label, 0) + 1
        seen[label] = count
        if count == 1:
            continue
        conn.execute(
            sa.text("UPDATE payroll_periods SET label = :new_label WHERE id = :id"),
            {"new_label": f"{label} ({count})", "id": period_id},
        )

    op.create_unique_constraint("uq_payroll_periods_label", "payroll_periods", ["label"])

    op.add_column(
        "quality_composite_scores",
        sa.Column("payroll_period_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_quality_scores_payroll_period",
        "quality_composite_scores",
        "payroll_periods",
        ["payroll_period_id"],
        ["id"],
    )
    op.create_index(
        "ix_quality_composite_scores_payroll_period_id",
        "quality_composite_scores",
        ["payroll_period_id"],
    )
    conn.execute(sa.text(
        """
        UPDATE quality_composite_scores q
        SET payroll_period_id = p.id
        FROM payroll_periods p
        WHERE q.period_type = 'payroll'
          AND q.payroll_period_id IS NULL
          AND q.period_label = p.label
        """
    ))
    conn.execute(sa.text(
        """
        DELETE FROM quality_composite_scores a
        USING quality_composite_scores b
        WHERE a.payroll_period_id IS NOT NULL
          AND a.payroll_period_id = b.payroll_period_id
          AND a.worker_id = b.worker_id
          AND a.id <> b.id
          AND (
            a.calculated_at < b.calculated_at
            OR (a.calculated_at = b.calculated_at AND a.id < b.id)
          )
        """
    ))
    op.create_index(
        "uq_quality_score_worker_payroll_period",
        "quality_composite_scores",
        ["worker_id", "payroll_period_id"],
        unique=True,
        postgresql_where=sa.text("payroll_period_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_quality_score_worker_payroll_period",
        table_name="quality_composite_scores",
        postgresql_where=sa.text("payroll_period_id IS NOT NULL"),
    )
    op.drop_index("ix_quality_composite_scores_payroll_period_id", table_name="quality_composite_scores")
    op.drop_constraint("fk_quality_scores_payroll_period", "quality_composite_scores", type_="foreignkey")
    op.drop_column("quality_composite_scores", "payroll_period_id")
    op.drop_constraint("uq_payroll_periods_label", "payroll_periods", type_="unique")
