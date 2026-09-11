# Environment files & Supabase migration

## Do I need to split my env file? — Yes, and not just for tidiness

One combined file at the repo root **cannot work**, because nothing reads it:

| Process | Reads | Does **not** read |
|---|---|---|
| Next.js (`next dev`) | `frontend/.env.local` | repo-root `.env.local` |
| FastAPI (pydantic-settings) | `backend/.env` (cwd-relative) | repo-root `.env.local` |
| Alembic | `backend/.env` | repo-root `.env.local` |

Next.js only loads env files from its own project directory, and
`core/config.py` declares `env_file=".env"`, which resolves against the
backend's working directory. A root file is invisible to both. This is exactly
why the backend currently fails Postgres auth and the frontend 500s.

### Keep them separate even though it's more files

Any variable prefixed `NEXT_PUBLIC_` is **inlined into the JavaScript bundle
and shipped to every visitor's browser**. If you paste one combined file into
`frontend/.env.local`, a single typo — one secret accidentally given a
`NEXT_PUBLIC_` prefix — publishes it publicly and permanently.

That is especially dangerous with `SUPABASE_SERVICE_ROLE_KEY`, which bypasses
every Row Level Security policy. Treat it like the database password itself.

**Rule: the frontend file contains only values you'd be happy to print on a
billboard. Everything else lives in `backend/.env`.**

---

## `backend/.env`

```ini
ENVIRONMENT=development
LOG_LEVEL=INFO
ALLOWED_ORIGINS=["http://localhost:3000"]

# ── Supabase Postgres ────────────────────────────────────────
# Use the SESSION pooler (:5432) or DIRECT connection while developing.
# Switch to the TRANSACTION pooler (:6543) in production and set
# DATABASE_USE_PGBOUNCER=true at the same time.
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
DATABASE_USE_PGBOUNCER=false

# Only needed if you start calling Supabase APIs (supabase-js, Storage,
# PostgREST). Not required today — auth/storage/realtime stay on Firebase.
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# ── Firebase Admin ───────────────────────────────────────────
# admin.json already sits at the repo root and is found automatically.
FIREBASE_PROJECT_ID=workforce-allocation-platform

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── Secrets ──────────────────────────────────────────────────
SESSION_COOKIE_SECRET=<long random string>
OTP_PEPPER=<long random string>
RESEND_API_KEY=
GOOGLE_API_KEY=

APP_BASE_URL=http://localhost:3000
```

## `frontend/.env.local`

```ini
NEXT_PUBLIC_FIREBASE_API_KEY=<from Firebase console>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=workforce-allocation-platform.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=workforce-allocation-platform
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=workforce-allocation-platform.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<from Firebase console>
NEXT_PUBLIC_FIREBASE_APP_ID=<from Firebase console>

NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

**No Supabase variables belong here.** The browser never talks to Postgres —
it calls the FastAPI backend through the `/api` rewrite in `next.config.js`,
and only the backend holds a database connection. Adding
`NEXT_PUBLIC_SUPABASE_ANON_KEY` would expose a database endpoint to the public
with no RLS policies written to defend it.

Both files are already covered by `.gitignore`.

---

## Migrating to Supabase

### Your schema is not "starting from scratch"

The schema lives in code: **27 Alembic migrations** under
`backend/migrations/versions/`, covering 30 model modules. `alembic upgrade
head` rebuilds the entire database structure on any empty Postgres, including
Supabase. You never hand-copy schema.

### Check first: which Postgres version?

Supabase runs PG 15 or 17 depending on project age (Dashboard → Settings →
Infrastructure). **This PC runs PG 18.4.** A dump taken from a newer server
will not restore into an older one. Never round-trip an old dump through local
PG 18 on the way to Supabase — go straight from the source machine to Supabase.

### Path A — no existing data (fresh start)

```powershell
cd backend
.\venv\Scripts\activate
alembic upgrade head                       # builds all 27 migrations
psql "<DATABASE_URL>" -f seed_accounts.sql # optional starter accounts
```

### Path B — you have real data on the old PC

Restore the whole dump, then tell Alembic the schema is already current.
Do **not** run `alembic upgrade head` on this path — the dump carries both the
schema and the `alembic_version` row, and running both fights itself.

```bash
# 1. On the OLD PC — dump schema + data
pg_dump -U postgres -Fc -d workforceallocationdb -f workforce.dump

# 2. Restore straight into Supabase
pg_restore -d "<DATABASE_URL>" --no-owner --no-privileges --no-acl workforce.dump

# 3. Confirm Alembic agrees the schema is current
cd backend && alembic current      # should print the latest revision
```

`--no-owner --no-privileges` matter: your local dump references the local
`postgres` role, which does not exist with the same permissions on Supabase.

Use the **direct or session-pooler** connection for the restore, never the
`:6543` transaction pooler.

### Connection strings at a glance

| Endpoint | Port | Network | Use for |
|---|---|---|---|
| Direct `db.<ref>.supabase.co` | 5432 | **IPv6 only** without the paid IPv4 add-on | Alembic, restores — from an IPv6-capable host |
| Session pooler `aws-0-<region>.pooler.supabase.com` | 5432 | IPv4 | Alembic, restores — from IPv4-only hosts |
| Transaction pooler | 6543 | IPv4 | The running app in production |

The IPv6 point is the one that bites on a Hetzner VPS. Hetzner gives you IPv6,
but if you ever pin to IPv4-only, the direct connection silently times out —
use the session pooler there.

When you move `DATABASE_URL` to the `:6543` transaction pooler, also set
`DATABASE_USE_PGBOUNCER=true`. That switches SQLAlchemy to `NullPool`, so it
stops stacking a second connection pool on top of pgbouncer and burning
through your project's connection budget.

### Before going to production

`core/security_validation.py` refuses to boot when `ENVIRONMENT=production`
unless all of these hold:

- `DEV_AUTH_BYPASS=false`
- `DATABASE_URL` set and free of the old `122333` dev password
- `OTP_PEPPER` **or** `RESEND_API_KEY` present
- `SESSION_COOKIE_SECRET` set (else it warns and falls back to `OTP_PEPPER`)
