"""
Create (or repair) the public `task-media` storage bucket and its RLS
policies. Idempotent — safe to re-run.

    cd backend && ./venv/Scripts/python.exe scripts/setup_task_media_bucket.py

Why public: task assessment reference media is shown to workers via the
URL stored on the assessment row (getPublicUrl). These are instructional
assets, not personal evidence.

Create the bucket first with minimal settings — some Supabase plans reject a
large file_size_limit on create with 413 EntityTooLarge. Limits / MIME are
applied afterward when the plan allows.
"""
from __future__ import annotations

import sys
from pathlib import Path

import httpx
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.config import settings  # noqa: E402
from core.database import engine  # noqa: E402

BUCKET = "task-media"

#: Project plans often reject a 200 MB ceiling. Cap at 50 MB on the bucket;
#: the browser still rejects oversized images (20 MB) before upload.
MAX_BYTES = 50 * 1024 * 1024

ALLOWED_MIME = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
]

POLICY_STATEMENTS: list[tuple[str, str]] = [
    ("drop old read policy",   'drop policy if exists "task_media_read"   on storage.objects'),
    ("drop old insert policy", 'drop policy if exists "task_media_insert" on storage.objects'),
    ("drop old update policy", 'drop policy if exists "task_media_update" on storage.objects'),
    ("drop old delete policy", 'drop policy if exists "task_media_delete" on storage.objects'),
    (
        "read policy (public — instructional assets)",
        """create policy "task_media_read" on storage.objects
               for select
               using (bucket_id = 'task-media')""",
    ),
    (
        "insert policy (authenticated only)",
        """create policy "task_media_insert" on storage.objects
               for insert to authenticated
               with check (bucket_id = 'task-media')""",
    ),
    (
        "update policy (upsert replaces a file)",
        """create policy "task_media_update" on storage.objects
               for update to authenticated
               using (bucket_id = 'task-media')
               with check (bucket_id = 'task-media')""",
    ),
    (
        "delete policy (admin removes a file from the uploader)",
        """create policy "task_media_delete" on storage.objects
               for delete to authenticated
               using (bucket_id = 'task-media')""",
    ),
]


def _headers() -> dict[str, str]:
    key = settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY
    if not key:
        raise SystemExit("No SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY configured")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _bucket_settings() -> dict:
    return {
        "public": True,
        "file_size_limit": MAX_BYTES,
        "allowed_mime_types": ALLOWED_MIME,
    }


def _missing_bucket(resp: httpx.Response) -> bool:
    if resp.status_code in (400, 404):
        try:
            data = resp.json()
        except Exception:
            data = {}
        text_body = (resp.text or "").lower()
        return (
            data.get("code") == "NoSuchBucket"
            or "not found" in text_body
            or "nosuchbucket" in text_body
        )
    return False


def ensure_bucket() -> None:
    base = settings.SUPABASE_URL.rstrip("/")
    if not base:
        raise SystemExit("SUPABASE_URL is not configured")

    with httpx.Client(timeout=30.0, headers=_headers()) as client:
        existing = client.get(f"{base}/storage/v1/bucket/{BUCKET}")

        if existing.status_code == 200:
            info = existing.json()
            print(f"  bucket '{BUCKET}' exists (public={info.get('public')})")
            for label, body in (
                ("full", _bucket_settings()),
                ("mime-only", {"public": True, "allowed_mime_types": ALLOWED_MIME}),
                ("public-only", {"public": True}),
            ):
                resp = client.put(f"{base}/storage/v1/bucket/{BUCKET}", json=body)
                if resp.status_code == 200:
                    print(f"  -> settings re-applied ({label})")
                    return
                print(f"  -> {label} settings rejected ({resp.status_code}): {resp.text[:160]}")
            return

        if not _missing_bucket(existing):
            existing.raise_for_status()

        # Create minimally first — large file_size_limit on create can 413.
        resp = client.post(
            f"{base}/storage/v1/bucket",
            json={"id": BUCKET, "name": BUCKET, "public": True},
        )
        resp.raise_for_status()
        print(f"  created bucket '{BUCKET}' (public)")

        for label, body in (
            ("full", _bucket_settings()),
            ("mime-only", {"public": True, "allowed_mime_types": ALLOWED_MIME}),
        ):
            put = client.put(f"{base}/storage/v1/bucket/{BUCKET}", json=body)
            if put.status_code == 200:
                print(f"  -> settings applied ({label})")
                return
            print(f"  -> {label} settings rejected ({put.status_code}): {put.text[:160]}")


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
                      and policyname like 'task_media%'
                    order by policyname"""
            )
        ).fetchall()
    if rows:
        for name, cmd in rows:
            print(f"  policy {name:26} {cmd}")
    else:
        print("  no task_media policies found")


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
    print("\nDone — bucket is public and policies are in place.")
