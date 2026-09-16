"""Sticky gateway_id on allocations (Phase 7 gateway cluster).

Revision ID: 3d7e51b0c9a4
Revises: f6a7b8c9d0e1
Create Date: 2026-09-15

NOTE ON THE REVISION ID: originally `a7b8c9d0e1f2`, which already belonged to
`a7b8c9d0e1f2_partner_entities_created_at_timestamptz.py`. The duplicate gave
Alembic two revisions with the same name and broke `upgrade head` for the whole
project. Renamed to a random id.
"""
from alembic import op

revision = "3d7e51b0c9a4"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE allocations
            ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(64)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_allocations_gateway_id
            ON allocations (gateway_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_allocations_gateway_id")
    op.execute("ALTER TABLE allocations DROP COLUMN IF EXISTS gateway_id")
