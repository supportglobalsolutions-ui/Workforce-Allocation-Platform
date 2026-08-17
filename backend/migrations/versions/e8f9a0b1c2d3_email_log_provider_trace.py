"""Give email_log a provider trace so delivery history is auditable.

`status` only records whether Resend accepted the message. To answer "did it
actually land", each row now keeps the Resend message id, the latest provider
event (delivered / bounced / complained / opened / clicked), and an append-only
event timeline. The job link lets the history page group a row back to the bulk
send it came from.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-08-17 19:50:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_log", sa.Column("from_email", sa.String(255), nullable=True))
    op.add_column("email_log", sa.Column("resend_id", sa.String(64), nullable=True))
    op.add_column("email_log", sa.Column("last_event", sa.String(32), nullable=True))
    op.add_column("email_log", sa.Column("last_event_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("email_log", sa.Column("provider_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("email_log", sa.Column("events", postgresql.JSONB(), nullable=True))
    op.add_column("email_log", sa.Column("email_job_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.create_foreign_key(
        "fk_email_log_email_job_id", "email_log", "email_jobs", ["email_job_id"], ["id"],
    )
    # Webhook lookups hit resend_id; the history page pages by created_at and
    # filters by job.
    op.create_index("ix_email_log_resend_id", "email_log", ["resend_id"])
    op.create_index("ix_email_log_email_job_id", "email_log", ["email_job_id"])
    op.create_index("ix_email_log_created_at", "email_log", ["created_at"])

    # Existing rows were accepted by Resend but have no provider trace; mark the
    # accepted ones as `sent` so the history page does not show them as unknown.
    op.execute("UPDATE email_log SET last_event = 'sent' WHERE status = 'sent'")


def downgrade() -> None:
    op.drop_index("ix_email_log_created_at", table_name="email_log")
    op.drop_index("ix_email_log_email_job_id", table_name="email_log")
    op.drop_index("ix_email_log_resend_id", table_name="email_log")
    op.drop_constraint("fk_email_log_email_job_id", "email_log", type_="foreignkey")
    for column in (
        "email_job_id", "events", "provider_checked_at",
        "last_event_at", "last_event", "resend_id", "from_email",
    ):
        op.drop_column("email_log", column)
