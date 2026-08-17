"""Store the broadcast message body on the email job row.

Payslip jobs render their body from the payroll summary at send time; broadcast
jobs need the composed message to survive a restart, so it lives on the job.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-08-17 17:35:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_jobs", sa.Column("body", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("email_jobs", "body")
