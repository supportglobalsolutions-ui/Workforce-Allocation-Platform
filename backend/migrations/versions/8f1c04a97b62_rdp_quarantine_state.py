"""Quarantine lifecycle state for unconfirmed closures (Phase 8 Action 2).

Revision ID: 8f1c04a97b62
Revises: 3d7e51b0c9a4
Create Date: 2026-09-15

"Unknown is not free" previously had no exit: an allocation whose tunnel
closure could not be confirmed stayed in `ending` forever. This adds the
terminal-but-recoverable state it escalates into, plus why and since when.

NOTE ON THE REVISION ID: this was originally created as `b8c9d0e1f2a3`, which
already belonged to `b8c9d0e1f2a3_notification_category.py`. Duplicate ids give
Alembic two revisions with the same name, which produced spurious extra heads
and made `alembic upgrade head` refuse to run at all. Renamed to a random id —
do not derive migration ids by continuing a visual pattern; check the existing
set first.
"""
from alembic import op

revision = "8f1c04a97b62"
down_revision = "3d7e51b0c9a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ADD VALUE cannot run inside a transaction block on older PostgreSQL, and
    # is not reversible. IF NOT EXISTS keeps the migration idempotent.
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE allocation_lifecycle_enum ADD VALUE IF NOT EXISTS 'quarantined'"
        )

    op.execute(
        """
        ALTER TABLE allocations
            ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS quarantine_reason VARCHAR(300)
        """
    )
    # Admin repair screens list quarantined rows first; without this every
    # lookup scans the full allocation history.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_allocations_quarantined_at
            ON allocations (quarantined_at)
            WHERE quarantined_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_allocations_quarantined_at")
    op.execute(
        """
        ALTER TABLE allocations
            DROP COLUMN IF EXISTS quarantine_reason,
            DROP COLUMN IF EXISTS quarantined_at
        """
    )
    # PostgreSQL cannot drop a single enum value. Any row still carrying
    # 'quarantined' would be orphaned by a rebuild, so the value is left in
    # place — harmless, and re-running upgrade() is a no-op.
