# Architecture and Tech Stack

> Single source of truth for how the system is put together: every technology, framework, library and tool, where each one lives, and the repository layout.  
> Remote desktop design, topology and redundancy live in [rdp-architecture.md](rdp-architecture.md).

---

## 1. System architecture diagram

```mermaid
graph TD
    subgraph client [Client Layer]
        Browser[Browser / Web Client]
    end

    subgraph edge [Edge - planned]
        Nginx[Nginx reverse proxy + TLS]
    end

    subgraph fe [Frontend - frontend/]
        Next[Next.js 14 App Router]
        SupaSdk[Supabase Client SDK]
    end

    subgraph be [Backend - backend/]
        FastApi[FastAPI + Uvicorn]
        SqlModel[SQLModel / SQLAlchemy ORM]
        PydanticSchemas[Pydantic schemas]
        Alembic[Alembic migrations]
        SupaAuth[Supabase Auth Admin]
    end

    subgraph data [Data stores]
        Postgres[(PostgreSQL)]
        Redis[(Redis)]
    end

    subgraph rdp [RDP access]
        Guac[Guacamole + guacd]
        Kuma[Uptime Kuma]
    end

    Browser --> Nginx --> Next
    Next --> FastApi
    Next --> SupaSdk
    FastApi --> SqlModel --> Postgres
    FastApi --> PydanticSchemas
    Alembic --> Postgres
    FastApi --> SupaAuth
    FastApi --> Redis
    Browser -.iframe.-> Guac
```

---

## 2. Directory-to-stack map

The fastest way to answer "what runs where". Each row maps a folder to the technology it owns.

| Directory / file | Stack | Status | Purpose |
| :--- | :--- | :--- | :--- |
| `frontend/` | Next.js 14, React 18, TypeScript | Implemented | Web application (all three portals) |
| `frontend/app/` | Next.js App Router | Implemented | **Routing: App Router only** — route groups: `worker/`, `admin/`, `leadership/`, `login/`, `reset-password/`; sitemap at `app/pages/page.tsx` (`/pages`) |
| `frontend/components/` | React + Tailwind | Implemented | UI: `platform/`, `navigation/`, `shared/`, `theme/`, `auth/`, `landing/`, `layout/`, `currency/`, `rdp/`, `payroll/` |
| `frontend/lib/` | TypeScript modules | Implemented | `auth/`, `navigation/`, `theme/`, `supabase.ts`, `api.ts`, `rdp.ts`, `errors.ts`, `money.ts`, `pages-registry.ts` |
| `frontend/lib/supabase.ts` | Supabase JS SDK | Implemented | Supabase client initialization |
| `frontend/lib/auth/` | Custom + Supabase | Implemented | Live Supabase session auth (`supabase-auth.ts`, `AuthProvider.tsx`, `session-store.ts`) |
| `frontend/tailwind.config.ts`, `postcss.config.js`, `globals.css` | Tailwind CSS, PostCSS | Implemented | Styling pipeline |
| `backend/` | FastAPI (Python) | Implemented | API service |
| `backend/main.py` | FastAPI + Uvicorn | Implemented | App entry, CORS, `/health`, domain routers |
| `backend/core/config.py` | pydantic-settings | Implemented | Env var loading (`.env`) |
| `backend/core/database.py` | SQLAlchemy engine | Implemented | Engine, `SessionLocal`, `get_db()` dependency |
| `backend/core/supabase_auth.py` | PyJWT / GoTrue admin | Implemented | Token verification (JWKS / secret), user admin |
| `backend/core/permissions.py` | FastAPI deps | Implemented | Role-based access logic |
| `backend/models/` | SQLModel | Implemented | Declarative ORM models (`worker.py`, `session.py`, `rdp_resource.py`, `shift.py`, `payroll.py`, `quality.py`, `partner.py`, `audit_log.py`, …) |
| `backend/migrations/` | Alembic | Implemented | `env.py`, `script.py.mako`, `versions/` with schema migrations |
| `backend/alembic.ini` | Alembic | Implemented | Migration config; points `sqlalchemy.url` at PostgreSQL |
| `backend/routers/` | FastAPI routers | Implemented | `auth.py`, `workers.py`, `shifts.py`, `rdp.py`, `sessions.py`, `payroll.py`, `wallets.py`, `currencies.py`, `quality.py`, `leaderboard.py`, `training.py`, `audit.py`, … |
| `backend/schemas/` | Pydantic | Implemented | Request/response shapes (`*Create`, `*Update`, `*Response`) separate from ORM models |
| `backend/services/` | Python business logic | Implemented | `rdp_health.py` (Uptime Kuma webhook handler), `leaderboard_sync.py` (background loop every 5 min), `payroll_engine.py`, `quality_engine.py`, `fx.py` |
| `infrastructure/nginx/` | Nginx | Planned | Only `README.md` placeholder committed |
| `infrastructure/docker-compose.yml` | Docker Compose | Implemented | Runs Redis, Guacamole (guacd + web + its own Postgres), and Uptime Kuma. |
| `infrastructure/uptime-kuma/` | Uptime Kuma | Implemented | Included in docker-compose; listens on port 3001; sends TCP heartbeat webhooks to the backend |
| `docs/` | Markdown | Implemented | Specs: `architecture.md`, `data-models.md`, `api.md`, `financial.md`, `quality.md`, `rdp-architecture.md`, … |

---

## 3. Frontend stack (`frontend/`)

Confirmed in `frontend/package.json`.

| Technology | Version | Status | Where used | What it does |
| :--- | :--- | :--- | :--- | :--- |
| **Next.js** | 14.2.35 | Implemented | `frontend/app/**`, `next.config.js` | App Router framework; route groups per portal, server/client components |
| **React** | 18.2 | Implemented | `frontend/app/**`, `frontend/components/**` | UI component model |
| **TypeScript** | 5.3 | Implemented | All `.ts`/`.tsx`, `tsconfig.json` | Static typing |
| **Tailwind CSS** | 3.4 | Implemented | `tailwind.config.ts`, `app/globals.css`, every component | Utility-first styling (Deep Emerald & Gold design system) |
| **PostCSS / Autoprefixer** | 8.4 / 10.4 | Implemented | `postcss.config.js` | CSS build pipeline |
| **Framer Motion** | 11.x | Implemented | Components with animation | Transitions, glassmorphism motion |
| **lucide-react** | 0.344 | Implemented | Components | Icon set |
| **clsx + tailwind-merge** | 2.x | Implemented | Components | Conditional / de-duplicated class names |
| **Supabase JS SDK** | 2.x | Implemented | `frontend/lib/supabase.ts`, `auth/supabase-auth.ts` | Supabase client for authentication |

---

## 4. Backend stack (`backend/`)

Confirmed in `backend/requirements.txt`.

| Technology | Version | Status | Where used | What it does |
| :--- | :--- | :--- | :--- | :--- |
| **FastAPI** | 0.111 | Implemented | `backend/main.py`, `core/security.py` | HTTP API framework; CORS, dependency injection, `/health`, auto docs at `/docs` |
| **Uvicorn** | 0.29 | Implemented | run target for `main.py` | ASGI server |
| **SQLModel** | 0.0.21 | Implemented | `backend/models/**`, `migrations/env.py` | ORM layer — combines SQLAlchemy and Pydantic; all entity models inherit from `SQLModel, table=True` |
| **SQLAlchemy** | 2.0.30 | Implemented | `core/database.py`, underlying SQLModel | Engine + session in `database.py`; raw column/type definitions used inside SQLModel fields |
| **Alembic** | 1.13.1 | Implemented | `backend/alembic.ini`, `backend/migrations/env.py`, `migrations/versions/` | Schema migrations; reads `DATABASE_URL` env |
| **psycopg2-binary** | 2.9.9 | Implemented | DB driver for `DATABASE_URL` | PostgreSQL driver used by the engine |
| **pg8000** | 1.31.5+ | Implemented | `core/database.py` fallback | Pure-Python PostgreSQL driver, used automatically when the psycopg2 native library can't load (for example when Windows Smart App Control blocks it) |
| **Pydantic** | 2.7.1 | Implemented | `backend/schemas/**`, `routers/auth.py` | API request/response validation (`*Create`, `*Update`, `*Response`) |
| **pydantic-settings** | 2.2.1 | Implemented | `backend/core/config.py` | Loads settings from `.env` (`DATABASE_URL`, Supabase, CORS, JWT) |
| **email-validator** | 2.1.1 | Implemented | worker email fields | Email format validation |
| **httpx** | 0.27.0 | Implemented | outbound HTTP | Client for external calls (e.g. Guacamole, FX rates, integrations) |
| **PyJWT** | 2.8.0 | Implemented | `core/supabase_auth.py` | Validates RS256/HS256 tokens from Supabase |

---

## 5. Data stores

| Store | Status | Where configured | Role in the system |
| :--- | :--- | :--- | :--- |
| **PostgreSQL** | Implemented | `backend/core/config.py` (`DATABASE_URL`), `core/database.py`, `alembic.ini` | Source of truth — all canonical records (workers, sessions, payroll, audit). |
| **Redis** | Implemented | `backend/core/redis.py`, `backend/core/guacamole.py`, `infrastructure/docker-compose.yml` | Distributed RDP claim locks (`lock:rdp:{id}`, 30s TTL), session heartbeats (`heartbeat:session:{id}`), Guacamole token cache, login verification codes. Runs via docker-compose (port 6379). |

---

## 6. Infrastructure and operations

| Technology | Status | Intended location | Role |
| :--- | :--- | :--- | :--- |
| **Docker Compose** | Implemented | `infrastructure/docker-compose.yml` | Runs Redis, Guacamole (guacd + web + dedicated Postgres), and Uptime Kuma. |
| **Apache Guacamole + guacd** | Implemented | `infrastructure/docker-compose.yml`, `backend/core/guacamole.py` | Browser-based RDP gateway (port 8080). Backend fetches token + builds connection URL. Guacamole uses its own dedicated Postgres (`guac_db`). |
| **Uptime Kuma** | Implemented | `infrastructure/docker-compose.yml`, `backend/routers/uptime_kuma.py`, `backend/services/rdp_health.py` | TCP port 3389 monitoring for RDP machines (port 3001). Sends webhook to backend on up/down events. Match monitors to machines by nickname. |
| **Nginx** | Planned | `infrastructure/nginx/` | Reverse proxy + TLS termination (ports 80/443) |

---

## 7. Tooling and conventions

| Tool | Status | Where | Purpose |
| :--- | :--- | :--- | :--- |
| **npm** | Implemented | `package.json`, `frontend/package.json` | Frontend dependency + script management (`dev`, `build`, `start`, `lint`) |
| **pip / requirements.txt** | Implemented | `backend/requirements.txt` | Backend dependency management |
| **ESLint (next lint)** | Implemented | `frontend` `lint` script | Frontend linting |
| **Git** | Implemented | repo root | Version control |
| **Environment files** | Implemented | `.env.example`, `frontend/.env.local.example`, `backend/.env.example` | Config templates; no secrets committed |

---

## 8. Summary by question

**"Where is SQLModel used?"** — `backend/models/*.py` (all entity ORM models) and `backend/core/database.py` (engine + `get_db()` session dependency). Pydantic API shapes live separately in `backend/schemas/`.

**"Where is Alembic used?"** — `backend/alembic.ini` and `backend/migrations/env.py` (with `script.py.mako`). It targets `SQLModel.metadata` (all models registered via `import models`) and reads `DATABASE_URL`. Initial and subsequent migrations in `migrations/versions/`.

**"Where is Redis used?"** — Distributed RDP claim locks (`lock:rdp:{id}`), session heartbeats, Guacamole token caching and login verification codes.

**"Where is Supabase used?"** — Frontend: `frontend/lib/supabase.ts` and `frontend/lib/auth/supabase-auth.ts`. Backend: `backend/core/supabase_auth.py` for JWT signature verification and GoTrue admin API user management.

**"Where is FastAPI / PostgreSQL used?"** — FastAPI in `backend/main.py` and `backend/core/`; PostgreSQL via `psycopg2-binary` (or the `pg8000` fallback) and `DATABASE_URL` configured in `backend/core/config.py`, `core/database.py`, and `alembic.ini`.

---

## 9. Repository tree

The original planned layout. The directory-to-stack map above reflects what is actually in the repo today.

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
│       │   │   └── page.tsx        ← RDP claim board (real-time live)
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
│           ├── supabase.ts             ← Supabase client init
│           ├── api.ts                  ← axios client → FastAPI
│           └── auth/                   ← Supabase Auth helpers
├── ── BACKEND (FastAPI) ───────────────────────────────────
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── main.py                     ← FastAPI app entry
│   ├── core/
│   │   ├── config.py               ← env var loading
│   │   ├── supabase_auth.py        ← Supabase token verification & admin
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
│   │   ├── payroll_engine.py       ← percentage splits, exception flags
│   │   ├── quality_engine.py       ← composite score (see quality.md)
│   │   └── audit_service.py        ← write-only audit entries
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
    ├── architecture.md         ← this file: tech stack + repository layout
    ├── api.md                  ← FastAPI auto-docs reference
    ├── data-models.md          ← tables and ERD
    ├── financial.md            ← how all the money works (plain language)
    ├── quality.md              ← quality scoring and leaderboard
    ├── rdp-architecture.md     ← all RDP docs (design, topology, redundancy)
    ├── security.md
    ├── deployment.md           ← Hetzner VPS setup guide
    ├── BACKEND_SETUP.md
    └── DESIGN.md
```
