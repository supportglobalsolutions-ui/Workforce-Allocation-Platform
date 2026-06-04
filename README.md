globalsolutions-platform/
│
├── .env.example                    ← required vars, NO real values
├── .gitignore
├── README.md
├── docker-compose.yml              ← PostgreSQL, Redis, Guacamole, Uptime Kuma
│
├── ── FRONTEND (Next.js) ──────────────────────────────────
├── frontend/
│   ├── .env.local.example
│   ├── next.config.js
│   ├── middleware.ts                ← role enforcement on every route
│   │
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (worker)/               ← role: worker
│   │   │   ├── layout.tsx          ← guards: role === "worker"
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── shifts/
│   │   │   │   ├── page.tsx        ← shift submission
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── rdp/
│   │   │   │   └── page.tsx        ← RDP claim board (Firebase live)
│   │   │   ├── sessions/
│   │   │   │   └── page.tsx        ← session history
│   │   │   ├── quality/
│   │   │   │   ├── page.tsx        ← quality score
│   │   │   │   └── assessment/page.tsx  ← MCQ
│   │   │   └── leaderboard/page.tsx
│   │   │
│   │   ├── (admin)/                ← role: admin
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── shifts/
│   │   │   │   └── page.tsx        ← shift approval
│   │   │   ├── rdp/
│   │   │   │   └── page.tsx        ← RDP assignment + state management
│   │   │   ├── sessions/
│   │   │   │   └── page.tsx        ← live sessions monitor
│   │   │   ├── ratings/
│   │   │   │   └── page.tsx        ← quality rating input (with reason notes)
│   │   │   └── payroll/
│   │   │       └── page.tsx        ← payroll exports
│   │   │
│   │   └── (leadership)/           ← role: leadership
│   │       ├── layout.tsx
│   │       ├── dashboard/page.tsx  ← org command view
│   │       ├── performance/page.tsx ← aggregate performance
│   │       ├── payroll/
│   │       │   └── page.tsx        ← payroll export + financial reporting
│   │       └── audit/
│   │           └── page.tsx        ← audit trail
│   │
│   ├── components/
│   │   ├── shared/                 ← used across all roles
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── worker/
│   │   ├── admin/
│   │   └── leadership/
│   │
│   └── lib/
│       ├── firebase.ts             ← Firebase init (real-time display only)
│       ├── api.ts                  ← axios client → FastAPI
│       └── auth.ts                 ← Firebase Auth token helpers
│
│
├── ── BACKEND (FastAPI) ───────────────────────────────────
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── main.py                     ← FastAPI app entry
│   │
│   ├── core/
│   │   ├── config.py               ← env var loading
│   │   ├── security.py             ← Firebase token verification
│   │   ├── permissions.py          ← role-based access logic
│   │   └── database.py             ← PostgreSQL connection (SQLAlchemy)
│   │
│   ├── routers/
│   │   ├── auth.py                 ← login, token validation
│   │   ├── workers.py              ← worker CRUD
│   │   ├── shifts.py               ← submit, approve
│   │   ├── rdp.py                  ← claim, release, state machine
│   │   ├── sessions.py             ← session lifecycle (all 3 types)
│   │   ├── payroll.py              ← calculation engine, export
│   │   ├── quality.py              ← MCQ, ratings, composite score
│   │   ├── leaderboard.py
│   │   ├── audit.py                ← append-only log reads
│   │   └── whatsapp.py             ← DORMANT module (deferred)
│   │
│   ├── models/                     ← SQLAlchemy ORM models
│   │   ├── worker.py
│   │   ├── session.py
│   │   ├── rdp_machine.py
│   │   ├── shift.py
│   │   ├── payroll.py
│   │   ├── quality.py
│   │   ├── partner.py
│   │   └── audit_log.py
│   │
│   ├── schemas/                    ← Pydantic request/response shapes
│   │   ├── worker.py
│   │   ├── session.py
│   │   ├── rdp.py
│   │   ├── payroll.py
│   │   └── quality.py
│   │
│   ├── services/                   ← business logic (not HTTP layer)
│   │   ├── rdp_state_machine.py    ← 8 states, enforced transitions
│   │   ├── payroll_engine.py       ← percentage splits, exception flags
│   │   ├── quality_engine.py       ← 50/50 composite score
│   │   ├── session_engine.py       ← session rules, heartbeat
│   │   ├── audit_service.py        ← write-only audit entries
│   │   └── firebase_sync.py        ← mirror state to Firebase
│   │
│   └── migrations/                 ← Alembic DB migrations
│       └── versions/
│
│
├── ── INFRASTRUCTURE ──────────────────────────────────────
├── infrastructure/
│   ├── docker-compose.yml
│   ├── guacamole/
│   │   ├── guacamole.properties    ← credentials NEVER in repo
│   │   └── user-mapping.xml.example
│   ├── postgres/
│   │   └── init.sql                ← initial schema seed
│   ├── redis/
│   │   └── redis.conf
│   └── uptime-kuma/                ← TCP ping config for RDP machines
│
│
└── ── DOCS ────────────────────────────────────────────────
    └── docs/
        ├── ERD.md                  ← data model diagram
        ├── api.md                  ← FastAPI auto-docs reference
        ├── deployment.md           ← Hetzner VPS setup guide
        ├── security-checklist.md
        └── phase-progress.md       ← weekly update log

allocations
├── id, shift_id, worker_id, rdp_id
├── claimed_at, released_at
├── release_reason, guacamole_session_token

sessions
├── id, allocation_id, worker_id, rdp_id
├── start_time, end_time, duration_minutes
├── status, payroll_period_id, quality_flag

quality_scores
├── id, worker_id, score_type (assessment/admin)
├── score, rated_by, reason, created_at

assessments
├── id, worker_id, assessment_name
├── score, max_score, completed_at

payroll_periods
├── id, start_date, end_date, status
├── approved_by, export_generated_at

audit_log
├── id, actor_id, action, target_type
├── target_id, metadata (JSONB), created_at

6.2 Firebase — Real-Time Collections
/rdp_status/{rdp_id}
  → status, worker_id, updated_at

/active_sessions/{session_id}
  → worker_id, rdp_id, started_at, heartbeat_at

/shift_notifications/{worker_id}
  → unread notifications (shift approved, RDP assigned)

/leaderboard/current_period
  → ranked worker list, refreshed every 5 minutes

/system_alerts
  → RDP offline alerts, idle session flags
________________________________________
7. Key System Flows
Flow A — Worker Submits Shift Availability
Worker logs in → opens Schedule page
→ selects available days/hours on calendar
→ submits availability
→ PostgreSQL records submission (status: PENDING)
→ Firebase notifies admin of new submission
→ Admin opens approval queue
→ Admin approves and assigns RDP machine
→ PostgreSQL updates shift (status: APPROVED, rdp_id: assigned)
→ Firebase pushes notification to worker's browser
→ Worker sees: "Your shift on [date/time] is confirmed — RDP-07 assigned"

Flow B — Worker Claims RDP at Shift Start
Worker logs in at shift time
→ Dashboard shows assigned RDP as claimable (shift window active)
→ Worker clicks Claim
→ FastAPI verifies shift window + worker identity
→ Distributed lock acquired on RDP
→ Allocation written to PostgreSQL
→ RDP status updated → ACTIVE in PostgreSQL + Firebase
→ All dashboards update in real time
→ Guacamole session token issued
→ Worker's browser opens Guacamole iframe
→ Session begins, heartbeat starts

Flow C — Real-Time Machine State Update
Health Monitor polls RDP-09 every 30 seconds
→ ICMP ping fails
→ TCP port 3389 check fails
→ PostgreSQL updated: rdp_machines.status = OFFLINE
→ Firebase updated: /rdp_status/rdp-09 = OFFLINE
→ All connected browsers receive Firebase push
→ RDP-09 card flips to grey (OFFLINE) on every dashboard simultaneously
→ Uptime Kuma independently detects the same outage
→ Alert sent via email/Telegram to operations lead

Flow D — Leadership Views Org Dashboard
Leadership logs in → routed to Command Dashboard
→ Sees: 15 RDP cards with live state
→ Sees: active sessions with worker name, RDP, duration
→ Sees: idle machines and idle sessions flagged
→ Sees: today's total verified hours across org
→ Sees: top 5 workers by hours this period (leaderboard preview)
→ Sees: exception flags (abandoned sessions, unhealthy machines)
→ Can click any worker → full profile with sessions, quality score, history
→ Can click any RDP → machine history, current state, assigned shifts
→ Can export payroll period summary in one click
________________________________________
8. Security Architecture
Threat	Mitigation
RDP credential exposure	Stored only in Guacamole, never sent to browser or logged
Unauthorized API access	Every FastAPI endpoint validates Firebase Auth token
Role violation	Backend enforces role on every request regardless of frontend state
Double-claiming	Distributed lock on every claim operation before PostgreSQL write
Session hijacking	Firebase Auth tokens expire, HTTPS enforced everywhere
Idle resource hogging	Heartbeat system auto-releases after 20 minutes of no activity
Data leakage in code	Environment variables only, no secrets in repository
Unaccountable actions	Every system action written to immutable audit log with actor, timestamp, reason
Worker accessing another's RDP	Claim endpoint verifies worker ID matches shift assignment
________________________________________
9. Deployment Architecture
All services run as Docker containers on a single server (sufficient for current scale). As the platform grows beyond 50 workers, backend services can be separated and scaled independently.
docker-compose.yml
├── nginx              — reverse proxy, SSL, port 80/443
├── frontend           — Next.js, internal port 3000
├── backend            — FastAPI, internal port 8000
├── guacamole          — RDP gateway, internal port 8080
├── guacd              — Guacamole daemon
├── postgres           — primary database, internal port 5432
├── health-monitor     — Python worker, no exposed port
└── uptime-kuma        — machine monitoring, port 3001
Firebase is a managed cloud service — no container required. It communicates with the frontend via Firebase SDK and with the backend via Firebase Admin SDK.
Only Nginx (443) and Uptime Kuma (3001) are exposed externally. All other services communicate on a private Docker network.
_________________________
11. Delivery Phases (Aligned to Mandate)

| Phase | Window | Primary Output |
| :--- | :--- | :--- |
| **Phase 0 — Setup** | Days 1–7 | Data models confirmed, repository live, environment set up, wireframes, sprint plan |
| **Phase 1 — MVP Core** | Days 8–30 | Auth, worker records, RDP board, shift submission, admin approval, claim/release, session logging |
| **Phase 2 — Payroll Bridge** | Days 31–45 | Pay rates, session-linked hours, payroll period export, exception flags |
| **Phase 3 — Quality + Leaderboard** | Days 46–60 | Assessment module, quality scoring, leaderboard, worker performance dashboard |
| **Phase 4 — Security Hardening** | Days 61–75 | Role enforcement audit, environment hardening, backup plan, deployment documentation |
| **Phase 5 — Leadership Dashboard** | Days 76–90 | Full org command view, utilisation reporting, export suite, management intelligence |
| **Phase 6 — Scale Layer** | After Day 90 | Country pods, multi-currency payroll, API integrations, quality automation, mobile-optimised views |

________________________________________
Appendix — New Elements Mapping

| What You Described | What It Becomes in the System | 
| :--- | :--- |
| Workers submit schedules via group chat | **Shift Scheduling Module** — workers self-submit availability/shifts in advance |
| Admin accepts and allocates RDP to a shift | **Shift Approval + RDP Assignment Flow** — admin reviews, approves, RDP becomes available at shift time |
| Who has done the most hours, competitive metrics | **Leaderboard + Performance Dashboard** — visible to workers, gamified |
| Quality rating from training assessments | **Quality Score Module** — subjective + assessment-data driven score per worker |
| Workers see which RDPs are live/dead | **Live RDP Status Board** — already planned, now confirmed as worker-facing too |
| Leadership manages org culture on the platform | **Leadership Command Dashboard** — full org view |
| Payroll integration (currently a workbook) | **Payroll Bridge Module** — ingests the existing workbook logic |
| Handling 100s of workers | Scalable multi-tenant architecture |
| Firebase approved for real-time + notifications | Hybrid DB: Firebase (real-time) + PostgreSQL (source of truth) |

### Revised Database Strategy

| Data | Storage | Why |
| :--- | :--- | :--- |
| Users, workers, payroll records, audit log, sessions history | **PostgreSQL** | ACID compliance, source of truth, financial accuracy |
| Live RDP states, active sessions, real-time presence | **Firebase Realtime DB / Firestore** | Sub-second push to all browsers without WebSocket complexity |
| Shift scheduling, notifications | **Firebase** | Real-time availability updates |
| Authentication | **Firebase Auth** | Handles login, roles, tokens cleanly, integrates with both DBs |

________________________________________
Appendix B — Project Charter V2.0 Amendments & Change Log Version 1.1

1. Extended Worker & Multi-Platform Session Model
• Worker Categories: GlobalSolutions registered workers (full access) and partner workers (linked to a partner entity).
• Multi-Platform Logging: Sessions now track three environments: GlobalSolutions RDP (Guacamole), Partner Channel Multilog Clients (manually logged), and Third-party platforms (e.g., Handshake, Outlier, Prolific).

2. RDP State Machine & Connectivity Updates
• Valid RDP States: Offline, Online Free, Assigned, Active, Idle, Unhealthy, Admin Locked, Maintenance.
• Connection Method: Browser-based RDP via Apache Guacamole confirmed for one-click seamless access.
• Idle Auto-Disconnect: A configurable idle threshold will transition unresponsive machines via IDLE to AUTO-LOCKED state and forcibly close the connection, notifying the worker and logging the event in the audit trail.

3. Payroll Engine V2.0
• Variable Percentages: Supports arrangement-specific splits (worker / GlobalSolutions / partner share) with client overrides.
• Multi-Currency & Adjustments: Enforces base currencies, tracks exchange rates into audit logs, and allows line-item cost additions, fines, and bonuses (with mandatory admin reasoning and approval).
• Smart Distribution: One-click formatted PDF payslip generation and distribution via Email and (deferred integration) WhatsApp Business API.

4. Quality Scoring Engine V2.0
• Composite Score Weighting: 50% Technical Knowledge (via integrated MCQ Assessment Engine) + 50% Subjective Indicators (auto-calculated organisation score + 1-5 admin communication score).

5. Worker Support & Governance
• Tasking Guidance Hub: An admin-managed, version-controlled knowledge base accessible by workers for task guidelines and SOPs.
• Session Issue Ticketing System: Allows workers to log time-stamped issues tied to specific sessions, which route to admins for triage (Open, Under Review, Resolved) to protect their quality score context.

6. Organisational Intelligence Layer (Leadership Dashboard V2.0)
• Core Philosophy: "What Does the Data Tell Us?" The leadership dashboard shifts from passive metrics to answering structural questions natively (e.g., lowest reliability trends, costs per session, knowledge gaps) in real-time.

End of document.
# Workforce-Allocation-Platform