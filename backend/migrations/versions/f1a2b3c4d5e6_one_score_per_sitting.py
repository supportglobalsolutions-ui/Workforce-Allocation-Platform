"""One current score per worker per test; retake updates that row.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-08-19 19:05:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mcq_results",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "task_assessment_results",
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="1"),
    )
    op.execute(
        """
        DELETE FROM mcq_result_answers
        WHERE mcq_result_id IN (
            SELECT id FROM mcq_results r
            WHERE EXISTS (
                SELECT 1 FROM mcq_results r2
                WHERE r2.worker_id = r.worker_id AND r2.source_id = r.source_id
                  AND (r2.completed_at > r.completed_at
                       OR (r2.completed_at = r.completed_at AND r2.id > r.id))
            )
        )
        """
    )
    op.execute(
        """
        DELETE FROM mcq_results r
        WHERE EXISTS (
            SELECT 1 FROM mcq_results r2
            WHERE r2.worker_id = r.worker_id AND r2.source_id = r.source_id
              AND (r2.completed_at > r.completed_at
                   OR (r2.completed_at = r.completed_at AND r2.id > r.id))
        )
        """
    )
    op.execute(
        """
        DELETE FROM task_result_activity_scores
        WHERE result_id IN (
            SELECT id FROM task_assessment_results r
            WHERE EXISTS (
                SELECT 1 FROM task_assessment_results r2
                WHERE r2.worker_id = r.worker_id AND r2.source_id = r.source_id
                  AND (COALESCE(r2.submitted_at, r2.created_at) > COALESCE(r.submitted_at, r.created_at)
                       OR (COALESCE(r2.submitted_at, r2.created_at) = COALESCE(r.submitted_at, r.created_at) AND r2.id > r.id))
            )
        )
        """
    )
    op.execute(
        """
        DELETE FROM task_assessment_results r
        WHERE EXISTS (
            SELECT 1 FROM task_assessment_results r2
            WHERE r2.worker_id = r.worker_id AND r2.source_id = r.source_id
              AND (COALESCE(r2.submitted_at, r2.created_at) > COALESCE(r.submitted_at, r.created_at)
                   OR (COALESCE(r2.submitted_at, r2.created_at) = COALESCE(r.submitted_at, r.created_at) AND r2.id > r.id))
        )
        """
    )
    op.create_index(
        "uq_mcq_results_worker_source",
        "mcq_results",
        ["worker_id", "source_id"],
        unique=True,
    )
    op.create_index(
        "uq_task_results_worker_source",
        "task_assessment_results",
        ["worker_id", "source_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_task_results_worker_source", table_name="task_assessment_results")
    op.drop_index("uq_mcq_results_worker_source", table_name="mcq_results")
    op.drop_column("task_assessment_results", "attempt_count")
    op.drop_column("mcq_results", "attempt_count")
