"""Account usernames + indexes on frequently queried columns

Revision ID: a1c2e3f4d5b6
Revises: d1e2f3a4b5c6
Create Date: 2026-09-14

Two changes:

1. admin_users.username — an account-level sign-in name so a person can log in
   with either their username or their email.

2. Indexes on the columns the hot paths filter by. The database is remote, so
   every sequential scan costs a full network round-trip plus scan time; these
   cover the RDP claim/release path, session history, shift lookups and the
   email delivery poll.

All indexes are created IF NOT EXISTS so re-running is harmless.
"""
from alembic import op

revision = "a1c2e3f4d5b6"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


INDEXES: list[tuple[str, str, str]] = [
    # name, table, columns
    # --- RDP claim / release / repair -----------------------------------
    ("ix_allocations_rdp_open", "allocations", "rdp_resource_id, released_at"),
    ("ix_allocations_worker_open", "allocations", "worker_id, released_at"),
    ("ix_allocations_shift", "allocations", "shift_id"),
    # --- sessions: history, evidence, heartbeat -------------------------
    ("ix_sessions_worker_start", "sessions", "worker_id, start_time DESC"),
    ("ix_sessions_rdp_open", "sessions", "rdp_resource_id, end_time"),
    ("ix_sessions_allocation", "sessions", "allocation_id"),
    ("ix_sessions_client", "sessions", "client_id"),
    # --- machines -------------------------------------------------------
    ("ix_rdp_resources_status", "rdp_resources", "status"),
    ("ix_rdp_resources_assigned", "rdp_resources", "assigned_worker_id"),
    ("ix_rdp_resources_client", "rdp_resources", "client_id"),
    # --- shifts ---------------------------------------------------------
    ("ix_shifts_worker_start", "shifts", "worker_id, scheduled_start"),
    ("ix_shifts_rdp", "shifts", "rdp_resource_id"),
    ("ix_shifts_status", "shifts", "status"),
    # --- identity lookups (admin_user_id already unique-indexed) --------
    ("ix_workers_status", "workers", "status"),
    # --- email delivery (created_at / resend_id already indexed) --------
    ("ix_email_log_last_event", "email_log", "last_event"),
    # --- audit ----------------------------------------------------------
    ("ix_audit_logs_target", "audit_logs", "target_type, target_id"),
    ("ix_audit_logs_created", "audit_logs", "created_at DESC"),
]


def _table_exists(conn, table: str) -> bool:
    return bool(
        conn.exec_driver_sql(
            "select 1 from information_schema.tables "
            f"where table_schema='public' and table_name='{table}' limit 1"
        ).first()
    )


def _columns(conn, table: str) -> set[str]:
    rows = conn.exec_driver_sql(
        "select column_name from information_schema.columns "
        f"where table_schema='public' and table_name='{table}'"
    ).fetchall()
    return {r[0] for r in rows}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Username column (nullable: existing accounts keep working).
    if _table_exists(conn, "admin_users") and "username" not in _columns(conn, "admin_users"):
        op.execute("ALTER TABLE admin_users ADD COLUMN username VARCHAR(64)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_admin_users_username "
        "ON admin_users (username)"
    )

    # 2. Hot-path indexes, skipping anything whose table/columns are absent.
    for name, table, columns in INDEXES:
        if not _table_exists(conn, table):
            continue
        present = _columns(conn, table)
        needed = {
            c.strip().split(" ")[0]
            for c in columns.split(",")
        }
        if not needed.issubset(present):
            continue
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})")


def downgrade() -> None:
    for name, _table, _columns_def in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    op.execute("DROP INDEX IF EXISTS ix_admin_users_username")
    op.execute("ALTER TABLE admin_users DROP COLUMN IF EXISTS username")
