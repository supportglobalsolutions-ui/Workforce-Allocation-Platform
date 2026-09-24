"""
Create (or repair) the private `absence-evidence` storage bucket and its RLS
policies. Idempotent — safe to re-run.

    cd backend && ./venv/Scripts/python.exe scripts/setup_absence_evidence_bucket.py

Mirrors scripts/setup_session_images_bucket.py, with two additions the session
bucket does not carry: a size ceiling and a MIME allow-list, both set on the
bucket itself. The browser checks the same rules before uploading, but the
bytes go straight from the browser to Supabase — so the bucket is the only
place a rule actually holds. Anything not on this list is refused by storage
regardless of what the client claims.

Why private: an absence report can carry a sick note or a death certificate.
Objects are read through short-lived signed URLs, never public links.
"""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # noqa: E402
from core.database import engine  # noqa: E402

BUCKET = "absence-evidence"

#: Keep in step with MAX_ATTACHMENT_MB in frontend/lib/absence-reports.ts.
MAX_BYTES = 5 * 1024 * 1024

#: Keep in step with ABSENCE_ATTACHMENT_EXTENSIONS in core/security_validation.py.
ALLOWED_MIME = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
]

POLICY_STATEMENTS: list[tuple[str, str]] = [
    ("drop old read policy",   'drop policy if exists "absence_evidence_read"   on storage.objects'),
    ("drop old insert policy", 'drop policy if exists "absence_evidence_insert" on storage.objects'),
    ("drop old update policy", 'drop policy if exists "absence_evidence_update" on storage.objects'),
    (
        "read policy (authenticated only)",
        """create policy "absence_evidence_read" on storage.objects
               for select to authenticated
               using (bucket_id = 'absence-evidence')""",
    ),
    (
        "insert policy (authenticated only)",
        """create policy "absence_evidence_insert" on storage.objects
               for insert to authenticated
               with check (bucket_id = 'absence-evidence')""",
    ),
    (
        "update policy (re-upload replaces a file)",
        """create policy "absence_evidence_update" on storage.objects
               for update to authenticated
               using (bucket_id = 'absence-evidence')
               with check (bucket_id = 'absence-evidence')""",
    ),
    # No delete policy on purpose: the app removes an attachment by dropping it
    # from the report's path list, so evidence cannot be erased from a browser.
]


def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if not key:
        raise SystemExit("No SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY configured")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _bucket_settings() -> dict:
    return {
        "public": False,
        "file_size_limit": MAX_BYTES,
        "allowed_mime_types": ALLOWED_MIME,
    }


def ensure_bucket() -> None:
    base = settings.SUPABASE_URL.rstrip("/")
    if not base:
        raise SystemExit("SUPABASE_URL is not configured")

    with httpx.Client(timeout=30.0, headers=_headers()) as client:
        existing = client.get(f"{base}/storage/v1/bucket/{BUCKET}")

        if existing.status_code == 200:
            info = existing.json()
            print(f"  bucket '{BUCKET}' exists (public={info.get('public')})")
            # Re-assert every constraint: a bucket made by hand in the
            # dashboard will not have the limit or the MIME list.
            resp = client.put(f"{base}/storage/v1/bucket/{BUCKET}", json=_bucket_settings())
            resp.raise_for_status()
            print("  -> settings re-applied (private, 5 MB, MIME allow-list)")
            return

        if existing.status_code not in (400, 404):
            existing.raise_for_status()

        resp = client.post(
            f"{base}/storage/v1/bucket",
            json={"id": BUCKET, "name": BUCKET, **_bucket_settings()},
        )
        resp.raise_for_status()
        print(f"  created bucket '{BUCKET}' (private, 5 MB, MIME allow-list)")


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
            data = info.json()
            print(f"  public           = {data.get('public')}")
            print(f"  file_size_limit  = {data.get('file_size_limit')}")
            print(f"  allowed_mime     = {data.get('allowed_mime_types')}")
        else:
            print(f"  bucket lookup returned {info.status_code}")

    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """select policyname, cmd from pg_policies
                    where schemaname = 'storage' and tablename = 'objects'
                      and policyname like 'absence_evidence%'
                    order by policyname"""
            )
        ).fetchall()
    if rows:
        for name, cmd in rows:
            print(f"  policy {name:26} {cmd}")
    else:
        print("  no absence_evidence policies found")


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
    print("\nDone — bucket is private, capped at 5 MB, and policies are in place.")
