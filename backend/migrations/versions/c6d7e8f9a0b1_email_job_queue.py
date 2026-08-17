"""Durable email job queue for bulk payslip and broadcast sends.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-17 17:20:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_jobs",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="queued"),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("attach_pdf", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("payroll_period_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("skipped", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["payroll_period_id"], ["payroll_periods.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["admin_users.id"]),
    )
    op.create_index("ix_email_jobs_payroll_period_id", "email_jobs", ["payroll_period_id"])

    op.create_table(
        "email_job_items",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("worker_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payroll_worker_summary_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("to_email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("resend_id", sa.String(length=64), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["job_id"], ["email_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["worker_id"], ["workers.id"]),
        sa.ForeignKeyConstraint(["payroll_worker_summary_id"], ["payroll_worker_summaries.id"]),
        sa.UniqueConstraint("job_id", "worker_id", name="uq_email_job_item_job_worker"),
    )
    op.create_index("ix_email_job_items_job_id", "email_job_items", ["job_id"])
    # Drives the dispatcher's claim query.
    op.create_index("ix_email_job_items_status_job", "email_job_items", ["status", "job_id"])


def downgrade() -> None:
    op.drop_index("ix_email_job_items_status_job", table_name="email_job_items")
    op.drop_index("ix_email_job_items_job_id", table_name="email_job_items")
    op.drop_table("email_job_items")
    op.drop_index("ix_email_jobs_payroll_period_id", table_name="email_jobs")
    op.drop_table("email_jobs")
