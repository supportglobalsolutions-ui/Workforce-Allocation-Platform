"""
Create (or repair) the private `session-images` storage bucket and its RLS
policies. Idempotent — safe to re-run.

    cd backend && ./venv/Scripts/python.exe scripts/setup_session_images_bucket.py

Bucket creation uses the Supabase Storage API with the service-role key.
Policies are applied over DATABASE_URL, which connects as the project's
`postgres` role.

Why private: session screenshots are work evidence and may show client
accounts. A public bucket makes every object readable by anyone holding — or
guessing — its URL, since paths are just "<session_id>/start.jpg". The app
reads them through short-lived signed URLs instead.
"""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # noqa: E402
from core.database import engine  # noqa: E402

BUCKET = "session-images"

# Applied one at a time so a failure on a single statement is reported without
# aborting the rest.
POLICY_STATEMENTS: list[tuple[str, str]] = [
    (
        "drop legacy public read policy",
        'drop policy if exists "session images are publicly readable" on storage.objects',
    ),
    ("drop old read policy",   'drop policy if exists "session_images_read"   on storage.objects'),
    ("drop old insert policy", 'drop policy if exists "session_images_insert" on storage.objects'),
    ("drop old update policy", 'drop policy if exists "session_images_update" on storage.objects'),
    (
        "read policy (authenticated only)",
        """create policy "session_images_read" on storage.objects
               for select to authenticated
               using (bucket_id = 'session-images')""",
    ),
    (
        "insert policy (authenticated only)",
        """create policy "session_images_insert" on storage.objects
               for insert to authenticated
               with check (bucket_id = 'session-images')""",
    ),
    (
        "update policy (upsert replaces an image)",
        """create policy "session_images_update" on storage.objects
               for update to authenticated
               using (bucket_id = 'session-images')
               with check (bucket_id = 'session-images')""",
    ),
    # No delete policy on purpose: evidence must not be erasable from the client.
]


def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if not key:
        raise SystemExit("No SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY configured")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def ensure_bucket() -> None:
    base = settings.SUPABASE_URL.rstrip("/")
    if not base:
        raise SystemExit("SUPABASE_URL is not configured")

    with httpx.Client(timeout=30.0, headers=_headers()) as client:
        existing = client.get(f"{base}/storage/v1/bucket/{BUCKET}")

        if existing.status_code == 200:
            is_public = bool(existing.json().get("public"))
            print(f"  bucket '{BUCKET}' exists (public={is_public})")
            if is_public:
                resp = client.put(
                    f"{base}/storage/v1/bucket/{BUCKET}",
                    json={"public": False},
                )
                resp.raise_for_status()
                print("  -> flipped to PRIVATE")
            else:
                print("  -> already private, nothing to change")
            return

        if existing.status_code not in (400, 404):
            existing.raise_for_status()

        resp = client.post(
            f"{base}/storage/v1/bucket",
            json={"id": BUCKET, "name": BUCKET, "public": False},
        )
        resp.raise_for_status()
        print(f"  created bucket '{BUCKET}' (private)")


def apply_policies() -> list[str]:
    failures: list[str] = []
    with engine.connect() as conn:
        for label, sql in POLICY_STATEMENTS:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"  ok    {label}")
            except Exception as exc:
                conn.rollback()
                msg = str(getattr(exc, "orig", exc)).splitlines()[0][:160]
                print(f"  FAIL  {label}: {msg}")
                failures.append(label)
    return failures


def verify() -> None:
    base = settings.SUPABASE_URL.rstrip("/")
    with httpx.Client(timeout=30.0, headers=_headers()) as client:
        info = client.get(f"{base}/storage/v1/bucket/{BUCKET}")
        if info.status_code == 200:
            print(f"  bucket public = {info.json().get('public')}")

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """select policyname, cmd from pg_policies
                    where schemaname = 'storage' and tablename = 'objects'
                      and policyname like 'session_images%'
                    order by policyname"""
            )
        ).fetchall()
    if rows:
        for name, cmd in rows:
            print(f"  policy {name:24} {cmd}")
    else:
        print("  no session_images policies found")


if __name__ == "__main__":
    print("1. Bucket")
    ensure_bucket()
    print("\n2. Policies")
    failed = apply_policies()
    print("\n3. Verify")
    verify()
    if failed:
        print(f"\nCompleted with {len(failed)} failed statement(s): {failed}")
        sys.exit(1)
    print("\nDone — bucket is private and policies are in place.")
