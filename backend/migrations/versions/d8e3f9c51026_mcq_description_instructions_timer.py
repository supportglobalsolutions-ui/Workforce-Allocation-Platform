"""MCQ sets get description, instructions, and optional timer.

Revision ID: d8e3f9c51026
Revises: c7d2e8b40915
Create Date: 2026-09-24

Mirrors the task-assessment fields so MCQ builder/worker UX can show
briefing text and a countdown the same way practical tasks already do.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d8e3f9c51026"
down_revision: Union[str, None] = "c7d2e8b40915"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("instructions", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("is_timed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("time_limit_minutes", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mcq_assessment_sets", "time_limit_minutes")
    op.drop_column("mcq_assessment_sets", "is_timed")
    op.drop_column("mcq_assessment_sets", "instructions")
    op.drop_column("mcq_assessment_sets", "description")
