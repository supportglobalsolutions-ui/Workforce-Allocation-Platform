# Security

Security controls, roles, audit logging, and secret management guidance.

---

## Authentication

All API requests (except `GET /health` and `POST /auth/register`) must include a Firebase ID token:

```
Authorization: Bearer <firebase_id_token>
```

`backend/core/security.py` → `get_current_user()` calls the Firebase Admin SDK to verify the token. If the token is invalid or missing, it returns `401 Unauthorized`.

### DEV_AUTH_BYPASS

Set `DEV_AUTH_BYPASS=true` in `backend/.env` to skip Firebase verification in local development. All requests without a valid token are treated as a fixed test user with the role set by `DEV_AUTH_ROLE` (`user` | `admin` | `super_admin`). **Never enable in production.**

---

## Roles and permissions

Three roles are enforced server-side on every request. Firebase custom claims carry the role; `backend/core/permissions.py` checks it.

| Role | Level | What they can do |
|------|-------|-----------------|
| `user` | 1 | Read/write own worker profile, own shifts, own sessions, claim/release RDP, read leaderboard |
| `admin` | 2 | Everything `user` can do + manage all workers, approve/reject shifts, manage RDP machines, manage quality ratings, payroll, audit log |
| `super_admin` | 3 | Everything `admin` can do + create admin/super_admin accounts, assign any role, bootstrap super admin |

### Role assignment rules

- `admin` can only create accounts with role `user`.
- `super_admin` can create accounts with any role.
- Neither role can downgrade or alter their own account.

### Self-registration

`POST /auth/register` is public. It creates a **disabled** Firebase account. The account cannot log in until an admin calls `PATCH /auth/users/{uid}/approve`.

---

## Row-level scoping

Workers can only read/write their own data. The pattern used throughout the routers:

1. `get_worker_for_user(db, current_user)` — resolves the Firebase UID to a `workers` row.
2. The query is filtered by `worker_id = worker.id` before returning data.

Admins and super_admins bypass this filter and see all rows.

---

## RDP claim locking (Redis)

The claim endpoint uses a Redis distributed lock to prevent two workers from claiming the same machine simultaneously:

1. `SETNX lock:rdp:{rdp_id} "1" EX 30` — only one process wins.
2. PostgreSQL transaction verifies `status = online_free` and creates the allocation.
3. A partial unique index on `allocations (rdp_resource_id) WHERE released_at IS NULL` is the hard database-level stop — even if the Redis lock fails, a second claim will fail at the DB constraint.
4. Lock is deleted in a `finally` block whether the claim succeeds or not.

---

## Uptime Kuma webhook secret

The webhook at `POST /integrations/uptime-kuma/webhook` is authenticated by a shared secret:

- Set `UPTIME_KUMA_WEBHOOK_SECRET` in `backend/.env`.
- Pass as `Authorization: Bearer <secret>` header or `?token=<secret>` query param.
- In production, if the secret is not configured the endpoint returns `503 Service Unavailable`.
- In development with no secret set, the webhook is accepted and a warning is logged.

---

## CORS

`ALLOWED_ORIGINS` in `backend/core/config.py` (default: `["http://localhost:3000"]`) controls which origins can call the API. Set this to the production frontend URL in production.

---

## Audit log

Every material admin action should be written to the `audit_log` table via `POST /audit`. The table is **append-only** — no UPDATE or DELETE is allowed at the application level. Fields recorded: `actor_id`, `action`, `target_type`, `target_id`, `previous_value`, `new_value`, `reason_note`, `ip_address`.

---

## Secret management

| Secret | Where set | Notes |
|--------|-----------|-------|
| `DATABASE_URL` | `backend/.env` | Postgres connection string including password |
| `REDIS_URL` | `backend/.env` | Redis connection string |
| `FIREBASE_CREDENTIALS_PATH` | `backend/.env` | Path to Firebase service account JSON |
| `FIREBASE_PROJECT_ID` | `backend/.env` | Firebase project ID |
| `GUACAMOLE_USERNAME` / `GUACAMOLE_PASSWORD` | `backend/.env` | Guacamole admin credentials |
| `UPTIME_KUMA_WEBHOOK_SECRET` | `backend/.env` | Shared secret for webhook auth |
| `NEXT_PUBLIC_FIREBASE_*` | `frontend/.env.local` | Firebase web SDK config (public — no secrets) |

No secrets are committed to the repository. `.env` files are git-ignored. Use `.env.example` files as templates.

