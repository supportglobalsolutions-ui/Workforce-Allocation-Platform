"""Apply scripts/rls_policies.sql and verify the result.

Enables Row Level Security on every table in the public schema and removes the
blanket anon/authenticated grants. The backend is unaffected: it connects as
`postgres`, which owns the tables and holds BYPASSRLS.

Usage:
    python scripts/apply_rls.py            # apply, then verify
    python scripts/apply_rls.py --check    # report only, change nothing
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from core.database import engine  # noqa: E402

SQL_FILE = BACKEND / "scripts" / "rls_policies.sql"

STATE_SQL = text("""
    SELECT c.relname,
           c.relrowsecurity,
           c.relforcerowsecurity,
           pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
""")


def report(conn) -> tuple[int, int, int]:
    rows = conn.execute(STATE_SQL).all()
    total = len(rows)
    without = [r[0] for r in rows if not r[1]]
    forced = [r[0] for r in rows if r[2]]
    policies = conn.execute(
        text("SELECT count(*) FROM pg_policies WHERE schemaname = 'public'")
    ).scalar() or 0

    print(f"  public tables        : {total}")
    print(f"  RLS enabled          : {total - len(without)}")
    print(f"  RLS missing          : {len(without)}")
    print(f"  FORCE RLS (must be 0): {len(forced)}")
    print(f"  policies in public   : {policies}")
    if without:
        print("  tables still without RLS:")
        for name in without[:15]:
            print(f"      {name}")
        if len(without) > 15:
            print(f"      ... and {len(without) - 15} more")
    if forced:
        print("  WARNING - FORCE RLS is set, which applies RLS to the owner too.")
        print("  That WILL break the backend:", forced)
    return total, len(without), policies


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only")
    args = ap.parse_args()

    if not SQL_FILE.is_file():
        print(f"ERROR: {SQL_FILE} not found")
        return 1

    with engine.connect() as conn:
        who = conn.execute(text("SELECT current_user")).scalar()
        bypass = conn.execute(text(
            "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user"
        )).scalar()
        print(f"connected as {who} (BYPASSRLS={bypass})")
        if not bypass:
            print("\nWARNING: this role does NOT have BYPASSRLS. Enabling RLS")
            print("could lock the backend out of its own tables. Aborting.")
            return 1

        print("\nbefore:")
        report(conn)

        if args.check:
            print("\nCheck only - nothing changed.")
            return 0

        print("\napplying scripts/rls_policies.sql ...")
        raw = conn.connection.dbapi_connection
        with raw.cursor() as cur:
            cur.execute(SQL_FILE.read_text(encoding="utf-8"))
            for notice in getattr(raw, "notices", [])[-5:]:
                print("   ", notice.strip())
        raw.commit()

        print("\nafter:")
        total, missing, policies = report(conn)

    print()
    if missing == 0:
        print("RLS is enabled on every public table.")
        if policies == 0:
            print("No permissive policies exist, so the Data API returns nothing")
            print("to anon/authenticated. The backend is unaffected (BYPASSRLS).")
        return 0
    print(f"{missing} table(s) still lack RLS.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
