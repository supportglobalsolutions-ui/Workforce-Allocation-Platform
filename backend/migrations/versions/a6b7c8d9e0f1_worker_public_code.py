"""Add workers.public_code (G+DDMMYY+seq) and backfill from created_at.

Revision ID: a6b7c8d9e0f1
Revises: f5b6c7d8e9f0
Create Date: 2026-09-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "f5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workers",
        sa.Column("public_code", sa.String(length=16), nullable=True),
    )
    op.create_index("ix_workers_public_code", "workers", ["public_code"], unique=True)

    # G + DDMMYY (UTC date of created_at) + 3-digit daily sequence by signup order.
    op.execute(
        """
        WITH ordered AS (
            SELECT
                id,
                to_char((created_at AT TIME ZONE 'UTC'), 'DDMMYY') AS dmy,
                ROW_NUMBER() OVER (
                    PARTITION BY ((created_at AT TIME ZONE 'UTC')::date)
                    ORDER BY created_at ASC, id ASC
                ) AS rn
            FROM workers
        )
        UPDATE workers AS w
        SET public_code = 'G' || o.dmy || lpad(o.rn::text, 3, '0')
        FROM ordered AS o
        WHERE w.id = o.id
        """
    )

    op.alter_column("workers", "public_code", nullable=False)


def downgrade() -> None:
    op.drop_index("ix_workers_public_code", table_name="workers")
    op.drop_column("workers", "public_code")
