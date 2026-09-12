"""Regroup the root .env.local into labelled, spaced sections.

Rewrites the file so related settings sit together under a banner comment,
with blank lines between groups. Values are preserved byte-for-byte; only
ordering, grouping and comments change.

It also reconciles the database password: DATABASE_URL is the source of
truth, and SUPABASE_DB_PASSWORD / DIRECT_URL are updated to match it, so the
three can never drift apart again.

Nothing is ever dropped - keys not recognised below land in a final "OTHER"
section, and the script aborts if the output key count differs from the input.

Usage:
    python scripts/organize-env.py            # rewrite (backs up first)
    python scripts/organize-env.py --dry-run  # show the layout only

Prints key names and section names only - never a value.
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / (".env" + ".local")
BAK = ROOT / (".env" + ".local.organize-bak")

# (section title, blurb lines, [(key, inline comment)])
SECTIONS: list[tuple[str, list[str], list[tuple[str, str]]]] = [
    ("APPLICATION", [
        "Core app identity and CORS. ENVIRONMENT=production turns on the",
        "startup checks in core/security_validation.py.",
    ], [
        ("ENVIRONMENT", "development | production"),
        ("ALLOWED_ORIGINS", "JSON array of allowed CORS origins"),
        ("APP_BASE_URL", "public URL of the frontend, used in outgoing email"),
        ("PROJECT_NAME", ""),
        ("PROJECT_NUMBER", ""),
    ]),

    ("DATABASE  -  SUPABASE POSTGRES", [
        "DATABASE_URL is the only string the app actually connects with.",
        "",
        "Use the IPv4 POOLER host (aws-N-<region>.pooler.supabase.com) with the",
        "username postgres.<project-ref>:",
        "  :5432  session pooler      -> Alembic migrations, psql, restores",
        "  :6543  transaction pooler  -> the running app (set USE_PGBOUNCER=true)",
        "",
        "The direct host db.<ref>.supabase.co is IPv6-ONLY unless you buy the",
        "IPv4 add-on, so it does not resolve from IPv4-only machines.",
    ], [
        ("DATABASE_URL", "source of truth for the DB password"),
        ("DIRECT_URL", "direct endpoint - IPv6 only, unusable without IPv6"),
        ("DATABASE_USE_PGBOUNCER", "true only when DATABASE_URL uses :6543"),
        ("SUPABASE_DB_PASSWORD", "kept in sync with DATABASE_URL by this script"),
    ]),

    ("SUPABASE  -  PROJECT & API KEYS", [
        "Settings > API. Supabase renamed these: anon -> publishable,",
        "service_role -> secret. Both spellings are kept for compatibility.",
        "",
        "WARNING: the secret / service_role key bypasses every RLS policy.",
        "It must never appear in a NEXT_PUBLIC_ variable.",
    ], [
        ("SUPABASE_URL", "https://<project-ref>.supabase.co"),
        ("SUPABASE_DATA_API", "PostgREST base URL"),
        ("SUPABASE_ANON_KEY", "public key - safe to expose ONLY with RLS on"),
        ("SUPABASE_PUBLISHABLE_KEY", "new name for the anon key"),
        ("SUPABASE_SERVICE_ROLE_KEY", "SECRET - bypasses all RLS"),
        ("SUPABASE_SECRET_KEY", "new name for the service_role key"),
    ]),

    ("SUPABASE  -  AUTH / JWT VERIFICATION", [
        "Used to validate Supabase access tokens on the backend.",
        "JWKS is preferred; the shared secret is the legacy HS256 path.",
    ], [
        ("SUPABASE_URL", "Supabase project URL"),
        ("SUPABASE_SERVICE_ROLE_KEY", "SECRET - Supabase service role key"),
        ("SUPABASE_JWKS_URL", "public JWKS endpoint for RS256 verification"),
        ("SUPABASE_JWT_SECRET", "legacy HS256 signing key"),
    ]),

    ("APPLICATION SIGNING SECRETS", [
        "Invented by you, not issued by any provider. Any long random string",
        "works, but they must stay constant or live sessions and pending OTPs",
        "break. Generate with:",
        "    python -c \"import secrets; print(secrets.token_urlsafe(64))\"",
        "",
        "Both are copied to backend AND frontend by scripts/split-env.py and",
        "must match on both sides.",
    ], [
        ("SESSION_COOKIE_SECRET", "HMAC key for the signed session cookie"),
        ("OTP_PEPPER", "pepper for destructive-action confirmation codes"),
    ]),

    ("FRONTEND  -  PUBLIC SETTINGS", [
        "Shipped to the browser.",
    ], [
        ("NEXT_PUBLIC_API_URL", "backend origin behind the /api rewrite"),
        ("NEXT_PUBLIC_GUACAMOLE_URL", "Guacamole origin behind the /remote rewrite"),
        ("NEXT_PUBLIC_SUPABASE_URL", "Supabase public project URL"),
        ("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Supabase public anon key"),
    ]),
        ("NEXT_PUBLIC_DEV_AUTH_BYPASS", "must mirror DEV_AUTH_BYPASS"),
        ("NEXT_PUBLIC_DEV_AUTH_ROLE", "must mirror DEV_AUTH_ROLE"),
    ]),

    ("REDIS  -  RDP CLAIM LOCKING", [
        "Distributed SETNX locks so two workers cannot claim one machine.",
        "Provided by infrastructure/docker-compose.yml.",
    ], [
        ("REDIS_URL", "redis://host:6379/0"),
    ]),

    ("APACHE GUACAMOLE  -  BROWSER RDP GATEWAY", [
        "Browser-based RDP. Runs in infrastructure/docker-compose.yml on :8080.",
    ], [
        ("GUACAMOLE_URL", ""),
        ("GUACAMOLE_USERNAME", ""),
        ("GUACAMOLE_PASSWORD", "change from the guacadmin default before launch"),
    ]),

    ("UPTIME KUMA  -  RDP TCP HEARTBEAT", [
        "Monitors TCP/3389 on each RDP machine and posts status back to",
        "/integrations/uptime-kuma/webhook. Runs on :3001.",
    ], [
        ("UPTIME_KUMA_URL", ""),
        ("UPTIME_KUMA_USERNAME", ""),
        ("UPTIME_KUMA_PASSWORD", ""),
        ("UPTIME_KUMA_WEBHOOK_SECRET", "shared token in the webhook query string"),
    ]),

    ("EMAIL  -  RESEND", [
        "Transactional email: payslips, OTP codes, security alerts.",
    ], [
        ("RESEND_API_KEY", ""),
        ("RESEND_FROM_EMAIL", "verified sender, e.g. Name <noreply@domain>"),
        ("RESEND_WEBHOOK_SECRET", "whsec_... for delivery-event callbacks"),
    ]),

    ("GOOGLE GEMINI  -  OPS BRIEFING", [
        "Optional. Empty means Analytics shows rule-based copy only.",
    ], [
        ("GOOGLE_API_KEY", "Google AI Studio key"),
        ("GEMINI_MODEL", ""),
    ]),
]

BANNER = "# " + "=" * 74


def parse(path: Path) -> list[tuple[str, str]]:
    pairs = []
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        s = raw.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        pairs.append((k.strip(), v.strip()))
    return pairs


def strip_quotes(v: str) -> str:
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def replace_password(url: str, pw: str) -> str:
    """Swap the password in a DSN, leaving everything else untouched."""
    quoted = url[0] in "\"'" and url[-1] == url[0] if len(url) >= 2 else False
    bare = strip_quotes(url)
    p = urlparse(bare)
    if not p.hostname or not p.username:
        return url
    host = p.hostname
    netloc = f"{p.username}:{pw}@{host}"
    if p.port:
        netloc += f":{p.port}"
    out = urlunparse(p._replace(netloc=netloc))
    return f'"{out}"' if quoted else out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not SRC.is_file():
        print("ERROR: root env file not found")
        return 1

    pairs = parse(SRC)
    values = dict(pairs)
    n_in = len(values)

    # ---- reconcile the DB password from DATABASE_URL --------------------
    notes: list[str] = []
    db_url = strip_quotes(values.get("DATABASE_URL", ""))
    db_pw = urlparse(db_url).password if db_url else None

    if db_pw:
        old = strip_quotes(values.get("SUPABASE_DB_PASSWORD", ""))
        if old != db_pw:
            values["SUPABASE_DB_PASSWORD"] = db_pw
            notes.append("SUPABASE_DB_PASSWORD did NOT match DATABASE_URL - corrected")
        else:
            notes.append("SUPABASE_DB_PASSWORD already matched DATABASE_URL")

        if "DIRECT_URL" in values:
            before = values["DIRECT_URL"]
            after = replace_password(before, db_pw)
            if after != before:
                values["DIRECT_URL"] = after
                notes.append("DIRECT_URL password did NOT match - corrected")
            else:
                notes.append("DIRECT_URL password already matched")
    else:
        notes.append("WARNING: could not read a password out of DATABASE_URL")

    # ---- lay out the sections ------------------------------------------
    placed: set[str] = set()
    out: list[str] = [
        BANNER,
        "#  WORKFORCE ALLOCATION PLATFORM  -  combined environment",
        "#",
        "#  This file is the single source. Split it into the two files the",
        "#  apps actually read with:",
        "#      python scripts/split-env.py --force",
        "#",
        "#  Regenerate this layout with:",
        "#      python scripts/organize-env.py",
        "#",
        "#  NEVER COMMIT THIS FILE. It is gitignored.",
        BANNER,
    ]

    layout: list[tuple[str, list[str]]] = []
    for title, blurb, keys in SECTIONS:
        present = [(k, c) for k, c in keys if k in values]
        if not present:
            continue
        out.append("")
        out.append("")
        out.append(BANNER)
        out.append(f"#  {title}")
        if blurb:
            out.append("#")
            for line in blurb:
                out.append(f"#  {line}".rstrip())
        out.append(BANNER)
        for k, comment in present:
            if comment:
                out.append(f"# {comment}")
            out.append(f"{k}={values[k]}")
            placed.add(k)
        layout.append((title, [k for k, _ in present]))

    leftover = [k for k in values if k not in placed]
    if leftover:
        out.append("")
        out.append("")
        out.append(BANNER)
        out.append("#  OTHER  -  not recognised by scripts/organize-env.py")
        out.append("#")
        out.append("#  Add these to SECTIONS in that script to file them properly.")
        out.append(BANNER)
        for k in leftover:
            out.append(f"{k}={values[k]}")
            placed.add(k)
        layout.append(("OTHER", leftover))

    # ---- safety: nothing lost ------------------------------------------
    if len(placed) != n_in:
        print(f"ABORT: {n_in} keys in, {len(placed)} placed. Refusing to write.")
        return 1

    print(f"{n_in} keys, {len(layout)} sections\n")
    for title, keys in layout:
        print(f"  {title}  ({len(keys)})")
        for k in keys:
            print(f"      {k}")
        print()

    print("password reconciliation:")
    for n in notes:
        print(f"  - {n}")

    if args.dry_run:
        print("\nDry run - nothing written.")
        return 0

    shutil.copy2(SRC, BAK)
    SRC.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"\nbackup: {BAK.name}")
    print(f"wrote {SRC.name} ({len(out)} lines)")
    print("\nNow run:  python scripts/split-env.py --force")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
