"""add_task_assessments

Revision ID: d3e4f5a6b7c8
Revises: f0572adde1a0
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[tuple, None] = ('c7d8e9f0a1b2', 'f0572adde1a0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# create_type=False: we manage creation ourselves with checkfirst
task_result_status_enum = postgresql.ENUM(
    'pending', 'in_progress', 'submitted', 'graded',
    name='task_result_status_enum',
    create_type=False,
)


def upgrade() -> None:
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE task_result_status_enum AS ENUM ('pending', 'in_progress', 'submitted', 'graded');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        'task_assessments',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('category', sa.String(128), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('instructions', sa.Text(), nullable=False),
        sa.Column('media_urls', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('is_timed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('time_limit_minutes', sa.Integer(), nullable=True),
        sa.Column('passing_score_pct', sa.Numeric(5, 2), server_default='70.00', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['admin_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'task_assessment_results',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('task_assessment_id', sa.UUID(), nullable=False),
        sa.Column('worker_id', sa.UUID(), nullable=False),
        sa.Column('status', task_result_status_enum, nullable=False, server_default='pending'),
        sa.Column('submission_notes', sa.Text(), nullable=True),
        sa.Column('submission_media_urls', postgresql.JSONB(), nullable=True),
        sa.Column('score_pct', sa.Numeric(5, 2), nullable=True),
        sa.Column('passed', sa.Boolean(), nullable=True),
        sa.Column('grader_notes', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('graded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('graded_by', sa.UUID(), nullable=True),
        sa.Column('time_taken_seconds', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['task_assessment_id'], ['task_assessments.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.ForeignKeyConstraint(['graded_by'], ['admin_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_task_assessment_results_task_assessment_id', 'task_assessment_results', ['task_assessment_id'])
    op.create_index('ix_task_assessment_results_worker_id', 'task_assessment_results', ['worker_id'])


def downgrade() -> None:
    op.drop_index('ix_task_assessment_results_worker_id', table_name='task_assessment_results')
    op.drop_index('ix_task_assessment_results_task_assessment_id', table_name='task_assessment_results')
    op.drop_table('task_assessment_results')
    op.drop_table('task_assessments')
    op.execute("DROP TYPE IF EXISTS task_result_status_enum")
