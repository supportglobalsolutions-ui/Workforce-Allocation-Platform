# Architecture

The repository structure is presented below:

```txt
globalsolutions-platform/
│
├── .env.example                    ← required vars, NO real values
├── .gitignore
├── README.md
├── docker-compose.yml              ← PostgreSQL, Redis, Guacamole, Uptime Kuma
├── ── FRONTEND (Next.js) ──────────────────────────────────
├── frontend/
│   ├── .env.local.example
│   ├── next.config.js
│   ├── middleware.ts                ← role enforcement on every route
│   └── app/
│       ├── (auth)/
│       │   ├── login/page.tsx
│       │   └── register/page.tsx
│       ├── (worker)/               ← role: worker
│       │   ├── layout.tsx          ← guards: role === "worker"
│       │   ├── dashboard/page.tsx
│       │   ├── shifts/
│       │   │   ├── page.tsx        ← shift submission
│       │   │   └── [id]/page.tsx
│       │   ├── rdp/
│       │   │   └── page.tsx        ← RDP claim board (Firebase live)
│       │   ├── sessions/
│       │   │   └── page.tsx        ← session history
│       │   ├── quality/
│       │   │   ├── page.tsx        ← quality score
│       │   │   └── assessment/page.tsx  ← MCQ
│       │   └── leaderboard/page.tsx
│       ├── (admin)/                ← role: admin
│       │   ├── layout.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── shifts/
│       │   │   └── page.tsx        ← shift approval
│       │   ├── rdp/
│       │   │   └── page.tsx        ← RDP assignment + state management
│       │   ├── sessions/
│       │   │   └── page.tsx        ← live sessions monitor
│       │   ├── ratings/
│       │   │   └── page.tsx        ← quality rating input (with reason notes)
│       │   └── payroll/
│       │       └── page.tsx        ← payroll exports
│       ├── (leadership)/           ← role: leadership
│       │   ├── layout.tsx
│       │   ├── dashboard/page.tsx  ← org command view
│       │   ├── performance/page.tsx ← aggregate performance
│       │   ├── payroll/
│       │   │   └── page.tsx        ← payroll export + financial reporting
│       │   └── audit/
│       │       └── page.tsx        ← audit trail
│       ├── components/
│       │   ├── shared/                 ← used across all roles
│       │   │   ├── Navbar.tsx
│       │   │   ├── Sidebar.tsx
│       │   │   └── LoadingSpinner.tsx
│       │   ├── worker/
│       │   ├── admin/
│       │   └── leadership/
│       └── lib/
│           ├── firebase.ts             ← Firebase init (real-time display only)
│           ├── api.ts                  ← axios client → FastAPI
│           └── auth.ts                 ← Firebase Auth token helpers
├── ── BACKEND (FastAPI) ───────────────────────────────────
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── main.py                     ← FastAPI app entry
│   ├── core/
│   │   ├── config.py               ← env var loading
│   │   ├── security.py             ← Firebase token verification
│   │   ├── permissions.py          ← role-based access logic
│   │   └── database.py             ← PostgreSQL connection (SQLAlchemy)
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
│   ├── models/                     ← SQLAlchemy ORM models
│   │   ├── worker.py
│   │   ├── session.py
│   │   ├── rdp_machine.py
│   │   ├── shift.py
│   │   ├── payroll.py
│   │   ├── quality.py
│   │   ├── partner.py
│   │   └── audit_log.py
│   ├── schemas/                    ← Pydantic request/response shapes
│   │   ├── worker.py
│   │   ├── session.py
│   │   ├── rdp.py
│   │   ├── payroll.py
│   │   └── quality.py
│   ├── services/                   ← business logic (not HTTP layer)
│   │   ├── rdp_state_machine.py    ← 8 states, enforced transitions
│   │   ├── payroll_engine.py       ← percentage splits, exception flags
│   │   ├── quality_engine.py       ← 50/50 composite score
│   │   ├── session_engine.py       ← session rules, heartbeat
│   │   ├── audit_service.py        ← write-only audit entries
│   │   └── firebase_mirror.py      ← mirror state to Firebase (PG commit first)
│   └── migrations/                 ← Alembic DB migrations
│       └── versions/
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
└── docs/
    ├── ERD.md                  ← data model diagram
    ├── api.md                  ← FastAPI auto-docs reference
    ├── deployment.md           ← Hetzner VPS setup guide
    ├── security-checklist.md
    └── phase-progress.md       ← weekly update log
```
