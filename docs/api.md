# API Reference

Base URL (local dev): `http://localhost:8000`

Interactive docs (dev only): `http://localhost:8000/docs`

All routes except `GET /health` and `POST /auth/register` require a Firebase ID token in the `Authorization: Bearer <token>` header.

**Role levels:** `user` < `admin` < `super_admin`

---

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Returns `{"status": "ok"}`. Used by uptime checks. |

---

## Auth — `/auth`

Manages Firebase user accounts. Passwords and display names are stored in Firebase Auth, not PostgreSQL.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | None | Self-register. Creates a **disabled** Firebase account pending admin approval. Body: `{email, password, displayName}` |
| GET | `/auth/users` | admin+ | List all Firebase users. |
| POST | `/auth/users` | admin+ | Create a new Firebase user with a role. Admins can only create `user` accounts; super_admin can create any role. Body: `{email, password, displayName, role}` |
| PATCH | `/auth/users/{uid}/approve` | admin+ | Enable a pending account so the user can sign in. |
| PATCH | `/auth/users/{uid}/reject` | admin+ | Disable/reject a pending account. |
| PATCH | `/auth/users/{uid}/role` | admin+ | Change a user's role. Admins cannot elevate; only super_admin can assign admin or super_admin. Body: `{role}` |
| POST | `/auth/bootstrap-super-admin` | super_admin | Idempotent — ensures the configured super_admin email has the claim. Run once after Firebase setup. |

---

## Workers — `/workers`

Workers are the PostgreSQL `workers` table — separate from Firebase Auth users.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/workers/me` | user+ | Get the caller's own worker profile. |
| PATCH | `/workers/me` | user+ | Update the caller's own worker profile. |
| GET | `/workers` | admin+ | List all workers, ordered by display name. |
| GET | `/workers/{worker_id}` | user+ | Get a specific worker. Workers can only fetch their own; admins can fetch any. |
| POST | `/workers` | admin+ | Create a worker record. Body: `WorkerCreate` schema. |
| PATCH | `/workers/{worker_id}` | admin+ | Update any worker. Body: `WorkerUpdate` schema. |

---

## Shifts — `/shifts`

Workers submit shift availability; admins approve or reject.

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/shifts` | user+ | `status`, `upcoming=true` | List shifts. Workers see own; admins see all. Filter by status or upcoming only. |
| GET | `/shifts/{shift_id}` | user+ | — | Get one shift. Workers can only fetch their own. |
| POST | `/shifts` | user+ | — | Submit a shift. Workers may only create shifts for themselves. Body: `ShiftCreate`. |
| PATCH | `/shifts/{shift_id}` | user+ | — | Update a shift. Workers cannot touch `status`, `approved_by`, `approved_at`, or `rejection_reason` — those are admin-only fields. |

---

## RDP Resources — `/rdp`

RDP machines with an 8-state status enum: `offline`, `online_free`, `assigned`, `active`, `idle`, `unhealthy`, `admin_locked`, `maintenance`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/rdp` | user+ | List all RDP machines ordered by nickname. |
| GET | `/rdp/{rdp_id}` | user+ | Get one machine. |
| POST | `/rdp` | admin+ | Add a new RDP machine. Body: `RDPResourceCreate`. |
| PATCH | `/rdp/{rdp_id}` | admin+ | Update a machine (status, health notes, etc.). Body: `RDPResourceUpdate`. |
| POST | `/rdp/{rdp_id}/claim` | user+ | Claim an `online_free` machine. Uses a Redis lock to prevent race conditions. Returns a Guacamole session URL if configured. Query param: `shift_id` (optional). |
| POST | `/rdp/{rdp_id}/release` | user+ | Release a claimed machine — closes the open allocation and sets status back to `online_free`. |

**Claim flow:** Redis SETNX lock (30s TTL) → verify `status = online_free` → create allocation → fetch Guacamole token → update status to `assigned` → mirror to Firebase → release lock. Claim succeeds even if Guacamole is down.

---

## Sessions — `/sessions`

Unified session log for all three channel types: `gs_rdp`, `partner_multilog`, `third_party_platform`.

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/sessions` | user+ | `type`, `limit` (1–200, default 50) | List sessions. Workers see own; admins see all. |
| GET | `/sessions/{session_id}` | user+ | — | Get one session. Workers can only fetch their own. |
| POST | `/sessions` | user+ | — | Create a session. Workers may only create for themselves. Active sessions (no `end_time`) are mirrored to Firestore. |
| PATCH | `/sessions/{session_id}` | user+ | — | Update a session. Workers cannot change `payroll_approval_state`, `payroll_period_id`, or `admin_notes`. When `end_time` is set the session is removed from the Firestore active mirror. |
| POST | `/sessions/{session_id}/heartbeat` | user+ | — | Stamps `last_heartbeat_at` into `type_specific_fields`, writes heartbeat key to Redis (`ex=3600`), and refreshes the Firestore active session mirror. |

---

## Payroll — `/payroll`

Admin-only. Manages payroll periods and per-session line items.

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/payroll/periods` | admin+ | — | List payroll periods, newest first. |
| GET | `/payroll/periods/{period_id}` | admin+ | — | Get one period. |
| POST | `/payroll/periods` | admin+ | — | Create a period. Body: `PayrollPeriodCreate`. |
| PATCH | `/payroll/periods/{period_id}` | admin+ | — | Update a period (status, approval, etc.). |
| GET | `/payroll/line-items` | admin+ | `payroll_period_id`, `worker_id` | List line items. Filter by period or worker. |
| POST | `/payroll/line-items` | admin+ | — | Create a line item. Splits (`worker_pct + gs_pct + partner_pct`) must equal 100. |
| PATCH | `/payroll/line-items/{item_id}` | admin+ | — | Update a line item. |

---

## Quality — `/quality`

Tracks quality indicators, manual ratings, and composite scores.

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/quality/me` | user+ | — | Get the caller's own latest composite score. |
| GET | `/quality/indicators` | user+ | — | List all quality indicator definitions. |
| POST | `/quality/indicators` | admin+ | — | Create a quality indicator. Body: `QualityIndicatorCreate`. |
| PATCH | `/quality/indicators/{indicator_id}` | admin+ | — | Update an indicator. |
| GET | `/quality/ratings` | user+ | `worker_id` | List ratings. Workers see own; admins can filter by worker. |
| POST | `/quality/ratings` | admin+ | — | Submit a manual quality rating. Body: `QualityIndicatorRatingCreate`. |
| PATCH | `/quality/ratings/{rating_id}` | admin+ | — | Update a rating. |
| GET | `/quality/scores` | admin+ | `worker_id` | List composite score snapshots. Filter by worker. |

---

## Leaderboard — `/leaderboard`

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/leaderboard` | user+ | `country`, `limit` (1–200, default 50) | Returns ranked workers joined with their latest quality composite score. Filter by country. |

---

## Audit Log — `/audit`

Admin-only, append-only log of material platform actions.

| Method | Path | Auth | Query params | Description |
|--------|------|------|--------------|-------------|
| GET | `/audit` | admin+ | `action`, `target_type`, `limit` (1–500, default 100) | List audit entries, newest first. |
| GET | `/audit/{entry_id}` | admin+ | — | Get one audit entry. |
| POST | `/audit` | admin+ | — | Write an audit entry. Body: `AuditLogCreate`. |

---

## Integrations — `/integrations/uptime-kuma`

Uptime Kuma webhook receiver for RDP TCP health events.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/integrations/uptime-kuma/webhook` | Webhook secret | Receives monitor up/down events. Authenticate via `Authorization: Bearer <secret>` header or `?token=<secret>` query param. Matches event to RDP machine by monitor name = `rdp_resources.nickname`. In dev with no secret set, the webhook is accepted without auth. |
| GET | `/integrations/uptime-kuma/status` | admin+ | Returns integration config: webhook path, whether secret is configured, Uptime Kuma UI URL, and monitor naming convention. |

Configure in Uptime Kuma → Notifications → Webhook:
`http://host.docker.internal:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET`

---

## Backend directory layout

| Path | What it does |
|------|-------------|
| `main.py` | App entry — mounts all routers, CORS, global error handler, lifespan (Firebase init + leaderboard sync loop) |
| `core/config.py` | All env vars via pydantic-settings (`DATABASE_URL`, `REDIS_URL`, `GUACAMOLE_*`, `FIREBASE_*`, `UPTIME_KUMA_*`, `DEV_AUTH_BYPASS`) |
| `core/database.py` | SQLAlchemy engine, `SessionLocal`, `get_db()` dependency |
| `core/firebase_admin.py` | Firebase Admin SDK init, user CRUD helpers (create, approve, reject, list, role assignment) |
| `core/guacamole.py` | `GuacamoleClient` — fetches auth token and builds connection URL; caches token in Redis |
| `core/permissions.py` | `require_user`, `require_admin`, `require_super_admin` FastAPI dependencies |
| `core/redis.py` | Redis client init, `get_redis()` dependency |
| `core/security.py` | `get_current_user()` — verifies Firebase ID token; supports `DEV_AUTH_BYPASS` for local dev without Firebase |
| `models/` | SQLModel ORM table definitions (one file per entity) |
| `schemas/` | Pydantic `*Create`, `*Update`, `*Response` shapes — separate from ORM models |
| `routers/` | One file per URL prefix; thin HTTP layer that calls services or ORM directly |
| `routers/deps.py` | `apply_update()` (generic PATCH helper), `get_worker_for_user()` (Firebase UID → Worker row) |
| `services/firebase_mirror.py` | Writes RDP status and active sessions to Firestore after every PostgreSQL commit |
| `services/rdp_health.py` | Processes Uptime Kuma webhook — maps monitor name to RDP machine, updates health fields |
| `services/leaderboard_sync.py` | Background async loop — recalculates leaderboard from PostgreSQL, pushes to Firestore every 5 minutes |
| `migrations/` | Alembic versions — run `alembic upgrade head` inside `backend/` to apply |
