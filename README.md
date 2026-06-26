# Workforce Allocation Platform
## GlobalSolutions Operations Command Platform

A full-stack workforce management system for allocating workers to RDP machines, tracking sessions, managing payroll, and monitoring org performance.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | FastAPI (Python), SQLModel, Pydantic v2 |
| Database | PostgreSQL 15 |
| Auth | Firebase Authentication (custom role claims) |
| RDP Gateway | Apache Guacamole (browser-based RDP) |
| Claim Locking | Redis (SETNX distributed locks) |
| Infrastructure | Docker Compose |

---

## Project Structure

```
Workforce-Allocation-Platform/
├── frontend/          Next.js app
├── backend/           FastAPI app
├── infrastructure/    Docker Compose, Guacamole, Redis config
└── docs/              Setup guides and notes
```

---

## All Pages

### Public

| Page | URL | Description |
|------|-----|-------------|
| Landing Page | `/` | Platform overview with login and request access entry points |
| Login | `/login` | Firebase email/password authentication for all user types |
| Sign Up | `/signup` | New worker registration (pending admin approval) |
| Reset Password | `/reset-password` | Password recovery workflow |
| Pages Directory | `/pages` | Searchable sitemap of every page in the platform with roles and features |

---

### Worker Portal

Workers access this after logging in. Role: `user`.

| Page | URL | Description |
|------|-----|-------------|
| Worker Dashboard | `/worker/dashboard` | Home screen — quality score, rank, recent sessions, upcoming shifts, quick actions |
| RDP Claim Board | `/worker/rdp-claim-board` | Live machine grid — see which RDP machines are free, claim one to start working |
| Active Session | `/worker/active-session` | Live view of the current RDP session — timer, heartbeat status, machine details, end session |
| External Session Log | `/worker/external-session` | Log partner multilog or third-party platform sessions (Outlier, Handshake, Prolific) |
| Session History | `/worker/session-history` | Full history of all past sessions — filters by date, machine, type, status |
| Assessment Center | `/worker/assessments` | MCQ assessments that make up 50% of the composite quality score |
| Leaderboard | `/worker/leaderboard` | Global and country rankings based on composite quality scores |

---

### Admin & Operations Portal

Handlers, country managers, and operations leads. Role: `admin` or `super_admin`.

| Page | URL | Description |
|------|-----|-------------|
| Admin Dashboard | `/admin/dashboard` | Operations command center — worker KPIs, session overview, payroll status, system health |
| Worker Management | `/admin/workers` | Create, edit, and deactivate worker profiles. Assign roles and partner entities |
| User Management | `/admin/users` | Manage Firebase user accounts — approve, reject, change roles |
| Partner Management | `/admin/partners` | Manage partner entities, split percentages, client overrides, and revenue breakdowns |
| RDP Management | `/admin/rdp` | Full control of RDP machines — status changes, maintenance mode, lock, force release |
| Live Session Monitor | `/admin/live-sessions` | Real-time feed of all active sessions. Force-end capability. Full audit view |
| Quality Management | `/admin/quality` | Enter subjective quality ratings with mandatory reason notes per worker |
| Assessment Builder | `/admin/assessments` | Manage MCQ question bank, categories, difficulty levels, and assign assessments to workers |
| Payroll Dashboard | `/admin/payroll` | Current payroll period overview — pending reviews and exception alerts |
| Payroll Calculation | `/admin/payroll/calculate` | Per-worker earnings with partner splits, GS revenue share, flags, and approval workflow |
| Payroll Export | `/admin/payroll/export` | Generate CSV/Excel payroll exports with period selector and approval logs |
| Send Payroll Receipts | `/admin/payroll/receipts` | Deliver approved payslips to workers via email and WhatsApp |
| Notification Center | `/admin/notifications` | Hub for payroll, machine, and quality alerts |
| Audit Logs | `/admin/audit-logs` | Append-only log of every material action in the system — actor, entity, old/new values |
| System Settings | `/admin/settings` | Roles, permissions, feature toggles, integrations, and environment settings |

---

### Leadership Portal

CEO and senior management. Role: `super_admin`.

| Page | URL | Description |
|------|-----|-------------|
| CEO Command Center | `/leadership/ceo-command` | Executive dashboard — KPI row, world map, machine status, partner performance, live feed |
| Organization Analytics | `/leadership/analytics` | Cross-dimensional analysis — country, partner, session, quality, and revenue data |
| Utilization Dashboard | `/leadership/utilization` | RDP machine utilization rates, idle time, availability percentage, capacity forecasting |
| Financial Intelligence | `/leadership/financial` | Partner revenue, worker earnings, payroll costs, and profit trend analysis |

---

## Running the Project

See `docs/BACKEND_SETUP.md` for the full step-by-step guide.

**Quick start (every session):**

```powershell
# Terminal 1 — Docker (Redis + Guacamole)
cd infrastructure
docker compose up -d

# Terminal 2 — Backend
cd backend
venv\Scripts\activate
uvicorn main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend
npm run dev
```

Frontend: `http://localhost:3000`
Backend API docs: `http://localhost:8000/docs`
Guacamole admin: `http://localhost:8080/guacamole`

---

## Role System

| Role | Access |
|------|--------|
| `user` | Worker Portal only |
| `admin` | Worker Portal + Admin Portal |
| `super_admin` | Everything including Leadership Portal |

Roles are set as Firebase custom claims. The backend verifies the claim on every request.
