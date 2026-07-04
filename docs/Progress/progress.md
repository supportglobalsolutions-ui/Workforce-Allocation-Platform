# Project Progress

**Workforce Session Allocation Platform** — GlobalSolutions
Progress of the whole platform, mapped to the Project Charter (v1.0).

_Last updated: 2026-07-04_

**Legend:** Done = built and working · Partial = foundations built, logic/wiring pending · Planned = not started

---

## 1. Executive summary

The platform's foundations are solid and the MVP core is largely functional. The
full data model, three-store architecture (PostgreSQL + Firebase + Redis),
authentication, RDP claim/release, shift flow, session logging, and RDP health
monitoring are all implemented. The remaining work is mostly *business-logic
engines* (quality scoring, payroll calculation/export) and *leadership
aggregation/reporting*, plus wiring the audit log into every action.

| Phase | Charter scope | Status |
|-------|---------------|--------|
| Phase 0 — Setup | Data models, repo, env, wireframes | Done |
| Phase 1 — MVP Core | Auth, RDP board, shift flow, claim/release, sessions | Done (minor gaps) |
| Phase 2 — Payroll Bridge | Rates, session-linked hours, export, exception flags | Partial |
| Phase 3 — Quality + Leaderboard | Assessments, scoring, leaderboard | Partial |
| Phase 4 — Security Hardening | Role audit, hardening, backup, deploy docs | Partial |
| Phase 5 — Leadership Dashboard | Org view, utilisation, export suite | Partial (UI scaffolded) |

---

## 2. Architecture layers

| Layer | Charter audience | Backend | Frontend | Status |
|-------|-----------------|---------|----------|--------|
| Worker | Shifts, RDP board, stats, leaderboard | shifts, rdp, sessions, quality, leaderboard, workers | worker/dashboard, rdp-claim-board, active-session, external-session, session-history, assessments, leaderboard | Done (core) |
| Admin / Ops | Approvals, RDP assignment, live oversight | shifts, rdp, sessions, quality, payroll, audit | admin/dashboard, workers, rdp, live-sessions, quality, assessments, payroll(+calculate/export/receipts), audit-logs, notifications, partners, users, settings | Partial |
| Leadership | Org command, payroll export, audit | leaderboard, audit (no dedicated analytics endpoints yet) | leadership/ceo-command, analytics, utilization, financial | Partial (UI scaffold) |
| Infrastructure | Health monitor, Firebase, PostgreSQL, Uptime Kuma | uptime_kuma webhook, rdp_health, firebase_mirror, mirror_reconcile | — | Done |

---

## 3. Technology stack

| Technology | Charter role | Status |
|-----------|--------------|--------|
| Next.js frontend | SSR dashboards, Firebase SDK | Done — 31 pages across 3 portals |
| FastAPI backend | Async API, business logic | Done — 11 routers |
| PostgreSQL | ACID source of truth | Done — 18 models, migrations applied |
| Firebase (Auth + Firestore) | Real-time sync + login | Done — mirror + reconcile |
| Apache Guacamole | Browser RDP gateway | Done — token fetch on claim |
| Redis | Distributed claim lock + heartbeats | Done — SETNX lock + heartbeat keys |
| Uptime Kuma | RDP TCP monitoring | Done — webhook → rdp_health |

---

## 4. Core system flows

### Shift scheduling — Done
Submit / approve / reject with worker-vs-admin field scoping (`routers/shifts.py`).
Status transitions notify workers via Firestore `shift_notifications`.

### RDP claim / release — Done
- Redis `SETNX` lock (`lock:rdp:{id}`) + partial unique index `uq_allocations_active_rdp` = double-claim prevention at two layers (`routers/rdp.py`, `models/allocation.py`).
- Guacamole token fetched on claim; claim still succeeds if Guacamole is down.
- Gap: admin *force-release with mandatory reason* enum exists but no dedicated endpoint (release currently always records `completed`).

### Health monitor — Done
Uptime Kuma webhook drives RDP state (`services/rdp_health.py`); offline/maintenance
raise `system_alerts`; protected states (`admin_locked`, `maintenance`) respected.

### Payroll export — Partial
Periods and line items have full CRUD and a rate table model, but the
session-linked hours calculation, exception-flag auto-generation, and the actual
export (CSV/xlsx) are not implemented yet. Frontend pages exist as scaffolds.

---

## 5. RDP machine state machine — Done (2 auto-transitions pending)

All 8 charter states exist in `RdpStatusEnum`: `offline`, `online_free`,
`assigned`, `active`, `idle`, `unhealthy`, `admin_locked`, `maintenance`.

- Written to PostgreSQL and mirrored to Firestore on every change. Done.
- Health-driven transitions (offline / unhealthy / maintenance / recovery). Done.
- Claim/release transitions (online_free ↔ assigned). Done.
- Gap: automatic `assigned → active → idle` transitions from session heartbeats are not yet wired.

---

## 6. Quality scoring & leaderboard — Partial

- Quality indicators, indicator ratings (1–5 with reason, attributed), and
  composite score records: full CRUD (`routers/quality.py`). Done.
- Leaderboard read + rank ordering + 5-minute Firestore sync
  (`routers/leaderboard.py`, `services/leaderboard_sync.py`). Done.
- MCQ assessment data model (`models/mcq.py`). Model only.
- Gap: the composite-score **calculation engine** (the 4 weighted inputs:
  assessments, admin ratings, session reliability, consistency bonus) is not
  implemented — scores are currently only stored via manual endpoints.
- Gap: MCQ assessment authoring/taking endpoints (frontend `assessments` pages exist as scaffolds).

---

## 7. Security & deployment — Partial

| Charter pillar | Status |
|----------------|--------|
| Zero credential exposure (RDP creds only in Guacamole) | Done |
| Distributed claim lock | Done (Redis SETNX + DB unique index) |
| Token-enforced API, server-side role checks every request | Done (`core/security.py`, `core/permissions.py`) |
| Firestore locked to read-only clients, backend writes via Admin SDK | Done (`firestore.rules`) |
| Immutable audit log | Partial — table is append-only and has an API, but is **not auto-written** on claim/release/approve/force-release yet |
| Deployment docs (Nginx, Gunicorn, systemd, TLS) | Done (`BACKEND_SETUP.md`) |
| Backup plan | Planned |

---

## 8. Leadership dashboard — Partial

Frontend portal pages exist (`leadership/ceo-command`, `analytics`, `utilization`,
`financial`). Backend read paths cover leaderboard and audit, but dedicated
utilisation/analytics aggregation endpoints and the export suite are not built yet.

---

## 9. Recent hardening (this work)

Robustness fixes to the PostgreSQL → Firestore mirror:

1. **Self-healing reconciliation** — `reconcile_rdp_statuses` / `reconcile_active_sessions` in `services/firebase_mirror.py`, run periodically by `services/mirror_reconcile.py` (interval `MIRROR_RECONCILE_INTERVAL_SECONDS`, default 300s), wired into `main.py`. Firestore now recovers automatically after transient failures.
2. **Off-request mirroring** — RDP/session/shift write endpoints schedule mirror writes via FastAPI `BackgroundTasks` using id-based wrappers, so slow Firestore never adds request latency.
3. **Consistent auth errors** — `routers/auth.py` now uses `http_error_from_firebase` (duplicate email → 409, Firebase unconfigured → 503).

Roles remain intentionally at 3: `user`, `admin`, `super_admin`.

---

## 10. Prioritised next steps

1. **Quality scoring engine** — compute composite scores from the 4 weighted inputs and populate `quality_composite_scores` (feeds the already-working leaderboard).
2. **Payroll calculation + export** — derive hours from completed sessions, auto-generate exception flags, add the CSV/xlsx export endpoint.
3. **Auto audit logging** — write `audit_log` entries inside claim/release, force-release, shift approval, role changes, and payroll actions.
4. **Force-release with reason** — dedicated admin endpoint capturing a mandatory reason (enum already supports it).
5. **RDP active/idle transitions** — drive `assigned → active → idle` from session heartbeats.
6. **Leadership aggregation** — utilisation and financial reporting endpoints behind the existing leadership pages.
7. **MCQ assessment endpoints** — authoring and worker-taking flows.
8. **Backup plan** — document and script PostgreSQL backups (Phase 4).
