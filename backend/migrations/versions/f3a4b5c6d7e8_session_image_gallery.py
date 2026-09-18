"""Replace the fixed start/end screenshot pair with a gallery of up to 8.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-09-18

Evidence used to be exactly two screenshots, each in its own column. Workers
now take as many shots as the job needs (capped at 8) from a single button in
the RDP viewer, so the paths live in one ordered JSONB array. The old columns
are kept and backfilled into the array — history rows still render, and
``image_start_at`` / ``image_end_at`` (what payroll actually pays on) are
untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column(
            "image_urls",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    # Start first, then end — the order the worker took them in.
    op.execute(
        """
        UPDATE sessions
        SET image_urls = (
            SELECT COALESCE(jsonb_agg(path ORDER BY ord), '[]'::jsonb)
            FROM (
                SELECT start_image_url AS path, 1 AS ord
                UNION ALL
                SELECT end_image_url, 2
            ) AS pair
            WHERE path IS NOT NULL AND path <> ''
        )
        WHERE start_image_url IS NOT NULL OR end_image_url IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("sessions", "image_urls")
