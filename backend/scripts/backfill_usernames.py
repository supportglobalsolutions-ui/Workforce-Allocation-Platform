"""
Give existing accounts a username so they can sign in with one.

Derives it from the worker profile's username when present, otherwise from the
email local-part, de-duplicating with a numeric suffix. Idempotent.

    cd backend && ./venv/Scripts/python.exe scripts/backfill_usernames.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

from sqlmodel import Session, select  # noqa: E402

from core.database import engine  # noqa: E402
from models.admin_users import AdminUser  # noqa: E402
from models.worker import Worker  # noqa: E402
from services.usernames import (  # noqa: E402
    RESERVED,
    normalize_username,
    username_taken,
    validate_username,
)


def _candidate(email: str) -> str:
    local = (email or "").split("@")[0]
    cleaned = "".join(ch for ch in normalize_username(local) if ch.isalnum() or ch in "._-")
    cleaned = cleaned.strip("._-")
    if len(cleaned) < 3:
        cleaned = f"user{cleaned}" if cleaned else "user"
    return cleaned[:32]


def main() -> int:
    assigned = 0
    skipped = 0
    with Session(engine) as db:
        rows = db.exec(select(AdminUser)).all()
        for row in rows:
            if row.username:
                skipped += 1
                continue

            worker = db.exec(
                select(Worker).where(Worker.admin_user_id == row.id)
            ).first()
            base = (worker.username if worker and worker.username else None) or _candidate(row.email)
            base = normalize_username(base)
            if base in RESERVED:
                base = f"{base}1"

            candidate = base
            n = 1
            while True:
                try:
                    validate_username(candidate)
                    ok = not username_taken(db, candidate)
                except Exception:
                    ok = False
                if ok:
                    break
                n += 1
                suffix = str(n)
                candidate = f"{base[: 32 - len(suffix)]}{suffix}"
                if n > 500:
                    break

            row.username = candidate
            db.add(row)
            if worker is not None and not worker.username:
                worker.username = candidate
                db.add(worker)
            db.commit()
            print(f"  {row.email:42} -> {candidate}")
            assigned += 1

    print(f"\nassigned {assigned}, already had one {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
