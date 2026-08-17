"""Backfill email_log.resend_id / email_job_id from the queue items.

Sends that ran before email_log carried a provider trace still have their Resend
message id on the queue item that produced them. Copying it across means the
history page can resolve delivery state for those rows too, instead of showing
them as untraceable. Matched on recipient plus send time because the two tables
had no link before this.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-08-17 19:58:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "e8f9a0b1c2d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE email_log AS l
        SET resend_id = i.resend_id,
            email_job_id = i.job_id
        FROM email_job_items AS i
        WHERE l.resend_id IS NULL
          AND l.email_job_id IS NULL
          AND i.resend_id IS NOT NULL
          AND i.sent_at IS NOT NULL
          AND l.to_email = i.to_email
          AND l.created_at BETWEEN i.sent_at - interval '1 minute'
                               AND i.sent_at + interval '1 minute'
        """
    )


def downgrade() -> None:
    # Data-only migration; the columns themselves are dropped by e8f9a0b1c2d3.
    pass
