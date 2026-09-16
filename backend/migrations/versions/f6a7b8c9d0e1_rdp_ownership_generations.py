"""RDP ownership dimensions and connection generations (Phase 4).

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-15

Adds independent health / allocation / tunnel fields, connection_generation,
optimistic version columns, and ensures the partial unique index on open
allocations exists in the database (not only on the SQLModel metadata).
"""
from alembic import op

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE machine_health_enum AS ENUM ('unknown', 'reachable', 'unreachable');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE allocation_lifecycle_enum AS ENUM ('reserved', 'assigned', 'ending', 'ended');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$ BEGIN
            CREATE TYPE tunnel_status_enum AS ENUM (
                'none', 'connecting', 'connected', 'reconnecting', 'disconnected'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        """
    )

    op.execute(
        """
        ALTER TABLE rdp_resources
            ADD COLUMN IF NOT EXISTS machine_health machine_health_enum NOT NULL DEFAULT 'unknown',
            ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1
        """
    )
    op.execute(
        """
        UPDATE rdp_resources SET machine_health = CASE
            WHEN status::text IN ('offline', 'unhealthy') THEN 'unreachable'::machine_health_enum
            WHEN status::text IN ('admin_locked', 'maintenance') THEN 'unknown'::machine_health_enum
            ELSE 'reachable'::machine_health_enum
        END
        """
    )

    op.execute(
        """
        ALTER TABLE allocations
            ADD COLUMN IF NOT EXISTS connection_generation INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
            ADD COLUMN IF NOT EXISTS allocation_status allocation_lifecycle_enum NOT NULL DEFAULT 'assigned',
            ADD COLUMN IF NOT EXISTS tunnel_status tunnel_status_enum NOT NULL DEFAULT 'none',
            ADD COLUMN IF NOT EXISTS last_gateway_observation_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS last_client_heartbeat_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ
        """
    )
    op.execute(
        """
        UPDATE allocations SET
            allocation_status = CASE
                WHEN released_at IS NULL THEN 'assigned'::allocation_lifecycle_enum
                ELSE 'ended'::allocation_lifecycle_enum
            END,
            ended_at = COALESCE(ended_at, released_at),
            tunnel_status = 'none'::tunnel_status_enum
        """
    )

    # One open allocation per desktop — database expression of the lock.
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_allocations_active_rdp
            ON allocations (rdp_resource_id)
            WHERE released_at IS NULL
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_allocations_active_rdp")
    op.execute(
        """
        ALTER TABLE allocations
            DROP COLUMN IF EXISTS ended_at,
            DROP COLUMN IF EXISTS last_client_heartbeat_at,
            DROP COLUMN IF EXISTS last_gateway_observation_at,
            DROP COLUMN IF EXISTS tunnel_status,
            DROP COLUMN IF EXISTS allocation_status,
            DROP COLUMN IF EXISTS version,
            DROP COLUMN IF EXISTS connection_generation
        """
    )
    op.execute(
        """
        ALTER TABLE rdp_resources
            DROP COLUMN IF EXISTS version,
            DROP COLUMN IF EXISTS machine_health
        """
    )
    op.execute("DROP TYPE IF EXISTS tunnel_status_enum")
    op.execute("DROP TYPE IF EXISTS allocation_lifecycle_enum")
    op.execute("DROP TYPE IF EXISTS machine_health_enum")
