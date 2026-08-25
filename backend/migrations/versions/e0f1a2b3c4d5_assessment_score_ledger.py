"""Assessment marks, retakes, delete-safe result snapshots.

Revision ID: a1b2c3d4e5f6_assess_ledger
Revises: d2e3f4a5b6c7
Create Date: 2026-08-19 18:45:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("allow_retakes", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "mcq_assessment_sets",
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "mcq_questions",
        sa.Column("marks", sa.Numeric(5, 2), nullable=False, server_default="0"),
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (PARTITION BY assessment_set_id ORDER BY sort_order, id) AS rn,
                   COUNT(*) OVER (PARTITION BY assessment_set_id) AS n
            FROM mcq_questions
        )
        UPDATE mcq_questions q
        SET marks = CASE
            WHEN r.n = 0 THEN 0
            WHEN r.rn < r.n THEN FLOOR((100.0 / r.n) * 100) / 100
            ELSE ROUND((100 - (FLOOR((100.0 / r.n) * 100) / 100) * (r.n - 1))::numeric, 2)
        END
        FROM ranked r
        WHERE q.id = r.id
        """
    )

    op.add_column("mcq_results", sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "mcq_results",
        sa.Column("title_snapshot", sa.String(255), nullable=False, server_default=""),
    )
    op.execute("UPDATE mcq_results SET source_id = assessment_set_id WHERE source_id IS NULL")
    op.execute(
        """
        UPDATE mcq_results r
        SET title_snapshot = s.title
        FROM mcq_assessment_sets s
        WHERE r.assessment_set_id = s.id AND (r.title_snapshot IS NULL OR r.title_snapshot = '')
        """
    )
    op.alter_column("mcq_results", "source_id", nullable=False)
    op.create_index("ix_mcq_results_source_id", "mcq_results", ["source_id"])

    op.execute("ALTER TABLE mcq_results ALTER COLUMN assessment_set_id DROP NOT NULL")
    op.execute("ALTER TABLE mcq_results DROP CONSTRAINT IF EXISTS mcq_results_assessment_set_id_fkey")
    op.create_foreign_key(
        "mcq_results_assessment_set_id_fkey",
        "mcq_results",
        "mcq_assessment_sets",
        ["assessment_set_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("mcq_result_answers", sa.Column("prompt_snapshot", sa.Text(), nullable=True))
    op.add_column("mcq_result_answers", sa.Column("options_snapshot", postgresql.JSONB(), nullable=True))
    op.add_column("mcq_result_answers", sa.Column("marks_snapshot", sa.Numeric(5, 2), nullable=True))
    op.execute(
        """
        UPDATE mcq_result_answers a
        SET prompt_snapshot = q.prompt,
            options_snapshot = q.options,
            marks_snapshot = q.marks
        FROM mcq_questions q
        WHERE a.question_id = q.id
        """
    )
    op.execute("ALTER TABLE mcq_result_answers ALTER COLUMN question_id DROP NOT NULL")
    op.execute("ALTER TABLE mcq_result_answers DROP CONSTRAINT IF EXISTS mcq_result_answers_question_id_fkey")
    op.create_foreign_key(
        "mcq_result_answers_question_id_fkey",
        "mcq_result_answers",
        "mcq_questions",
        ["question_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "task_assessments",
        sa.Column("allow_retakes", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "task_assessments",
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
    )

    op.create_table(
        "task_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("task_assessment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("max_marks", sa.Numeric(5, 2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["task_assessment_id"], ["task_assessments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_activities_task_assessment_id", "task_activities", ["task_assessment_id"])

    op.add_column("task_assessment_results", sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "task_assessment_results",
        sa.Column("title_snapshot", sa.String(255), nullable=False, server_default=""),
    )
    op.execute("UPDATE task_assessment_results SET source_id = task_assessment_id WHERE source_id IS NULL")
    op.execute(
        """
        UPDATE task_assessment_results r
        SET title_snapshot = t.title
        FROM task_assessments t
        WHERE r.task_assessment_id = t.id AND (r.title_snapshot IS NULL OR r.title_snapshot = '')
        """
    )
    op.alter_column("task_assessment_results", "source_id", nullable=False)
    op.create_index("ix_task_assessment_results_source_id", "task_assessment_results", ["source_id"])

    op.execute("ALTER TABLE task_assessment_results ALTER COLUMN task_assessment_id DROP NOT NULL")
    op.execute(
        "ALTER TABLE task_assessment_results DROP CONSTRAINT IF EXISTS task_assessment_results_task_assessment_id_fkey"
    )
    op.create_foreign_key(
        "task_assessment_results_task_assessment_id_fkey",
        "task_assessment_results",
        "task_assessments",
        ["task_assessment_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "task_result_activity_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("result_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("prompt_snapshot", sa.Text(), nullable=False),
        sa.Column("max_marks_snapshot", sa.Numeric(5, 2), nullable=False),
        sa.Column("marks_awarded", sa.Numeric(5, 2), nullable=False),
        sa.ForeignKeyConstraint(["result_id"], ["task_assessment_results.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_id"], ["task_activities.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_result_activity_scores_result_id", "task_result_activity_scores", ["result_id"])


def downgrade() -> None:
    op.drop_index("ix_task_result_activity_scores_result_id", table_name="task_result_activity_scores")
    op.drop_table("task_result_activity_scores")
    op.drop_constraint("task_assessment_results_task_assessment_id_fkey", "task_assessment_results", type_="foreignkey")
    op.drop_index("ix_task_assessment_results_source_id", table_name="task_assessment_results")
    op.drop_column("task_assessment_results", "title_snapshot")
    op.drop_column("task_assessment_results", "source_id")
    op.drop_index("ix_task_activities_task_assessment_id", table_name="task_activities")
    op.drop_table("task_activities")
    op.drop_column("task_assessments", "max_attempts")
    op.drop_column("task_assessments", "allow_retakes")
    op.drop_constraint("mcq_result_answers_question_id_fkey", "mcq_result_answers", type_="foreignkey")
    op.drop_column("mcq_result_answers", "marks_snapshot")
    op.drop_column("mcq_result_answers", "options_snapshot")
    op.drop_column("mcq_result_answers", "prompt_snapshot")
    op.drop_constraint("mcq_results_assessment_set_id_fkey", "mcq_results", type_="foreignkey")
    op.drop_index("ix_mcq_results_source_id", table_name="mcq_results")
    op.drop_column("mcq_results", "title_snapshot")
    op.drop_column("mcq_results", "source_id")
    op.drop_column("mcq_questions", "marks")
    op.drop_column("mcq_assessment_sets", "max_attempts")
    op.drop_column("mcq_assessment_sets", "allow_retakes")
