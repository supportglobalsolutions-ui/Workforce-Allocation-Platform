"""Admin note per worker payslip.

Revision ID: a4d8e1f05b27
Revises: f2a7c9d41e83
Create Date: 2026-10-10

Null means no note was typed; the ledger then shows the work month.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a4d8e1f05b27"
down_revision: Union[str, None] = "f2a7c9d41e83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("payroll_worker_summaries", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("payroll_worker_summaries", "notes")
