"""Create the full schema from the SQLModel definitions, then stamp Alembic.

Why this exists
---------------
The migration chain is not replayable on an empty database. Revision
24cc3a8f148d ("initial_schema") calls ``SQLModel.metadata.create_all()``,
which builds tables from the *current* models — so every column added by the
26 later revisions already exists, and those revisions then fail with
``DuplicateColumn`` (e.g. ``rdp_resources.monitor_host``).

For a fresh environment, the correct bootstrap is therefore:

    1. create_all() from the models  -> the current schema
    2. alembic stamp head            -> record that the DB is up to date

After this, incremental migrations added in the future apply normally.

Usage:
    python scripts/bootstrap_schema.py            # create + stamp
    python scripts/bootstrap_schema.py --check     # report only
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import inspect, text  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import models  # noqa: E402,F401 — registers every table
from core.database import engine  # noqa: E402


def current_revision() -> str | None:
    with engine.connect() as c:
        try:
            return c.execute(text("select version_num from alembic_version")).scalar()
        except Exception:
            return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report state, change nothing")
    args = ap.parse_args()

    insp = inspect(engine)
    live = set(insp.get_table_names(schema="public")) - {"alembic_version"}
    expected = set(SQLModel.metadata.tables.keys())

    print(f"tables defined in models : {len(expected)}")
    print(f"tables live in database   : {len(live)}")
    print(f"alembic revision in DB    : {current_revision() or '(none)'}")

    if args.check:
        missing = sorted(expected - live)
        print(f"missing: {len(missing)}")
        for t in missing:
            print("   ", t)
        return 0

    if live:
        print("\nRefusing to run: the database already has tables.")
        print("This script only bootstraps an empty database.")
        return 1

    print("\ncreating schema from models...")
    SQLModel.metadata.create_all(bind=engine)

    insp = inspect(engine)
    created = set(insp.get_table_names(schema="public")) - {"alembic_version"}
    print(f"created {len(created)} tables")

    gaps = sorted(expected - created)
    if gaps:
        print(f"WARNING: {len(gaps)} expected tables absent: {gaps}")
        return 1

    print("\nstamping alembic to head...")
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    command.stamp(cfg, "head")
    print(f"alembic revision now      : {current_revision()}")

    # Freshly created tables have RLS off, which Supabase flags as a security
    # error and which would expose them through the Data API.
    print("\napplying row level security...")
    rls = BACKEND / "scripts" / "rls_policies.sql"
    if rls.is_file():
        with engine.connect() as c:
            raw = c.connection.dbapi_connection
            with raw.cursor() as cur:
                cur.execute(rls.read_text(encoding="utf-8"))
            raw.commit()
            missing = c.execute(text("""
                SELECT count(*) FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relkind = 'r'
                  AND NOT c.relrowsecurity
            """)).scalar()
        print(f"RLS missing on            : {missing} table(s)")
    else:
        print("WARNING: scripts/rls_policies.sql not found - RLS NOT applied")

    print("\nSchema bootstrap complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
