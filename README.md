Workforce Session Allocation Platform — Full System Architecture Document

Prepared by: Kibiru Kelvin — Lead Software Developer & Systems Architect
For: GlobalSolutions | Luther Rukhairo, CEO
Version: 2.0 — Expanded Scope
Classification: Confidential
Tagline: Remote — Smart — Global

________________________________________
1. Executive Summary
This document defines the complete technical architecture for the GlobalSolutions Workforce Operating Platform — an internal, web-based system that replaces manual coordination with a structured, evidence-based digital infrastructure.
The platform manages the complete operational lifecycle of every GlobalSolutions worker: shift scheduling, RDP allocation, live session tracking, quality scoring, performance leaderboards, payroll bridging, and leadership reporting — all in one controlled system.
It is designed to scale from the current workforce to hundreds of workers across multiple countries without losing operational discipline, security, or management visibility.
________________________________________
2. The Problem Being Solved
GlobalSolutions currently operates through manual coordination:
• Workers submit shift availability via WhatsApp group chat with tables
• RDP machines are allocated manually with no conflict prevention
• There is no live view of which RDP machines are on or in use
• Quality assessment data exists but is not connected to worker records
• Payroll is calculated from a spreadsheet workbook with no session data link
• There is no leaderboard or competitive visibility for workers
• Leadership has no single dashboard to see the state of the organisation
Each of these creates fragility that prevents scale. The platform replaces all of them.
________________________________________
3. System Vision
The platform has three user-facing layers and one infrastructure layer:
Worker Layer — What generalists see and use:
• Submit shift availability and view approved shifts
• See the live RDP board (which machines are available, live, offline)
• Claim their allocated RDP at shift start
• View their own hours, quality score, and leaderboard position
Admin/Operations Layer — What handlers and operations leads use:
• Review and approve submitted shifts
• Assign RDP machines to approved shifts
• Monitor all active sessions in real time
• Force-release, lock, or intervene on any session
• Flag quality issues and apply admin notes
Leadership Layer — What the CEO and country managers see:
• Full organisational dashboard: active workers, RDP utilisation, idle resources
• Worker performance rankings and quality scores
• Payroll export and period summaries
• Audit trail for every action in the system
• Exception flags and risk signals
Infrastructure Layer — What runs underneath:
• Health Monitor watching all RDP machines every 30 seconds
• Uptime Kuma for independent machine monitoring and alerting
• Firebase for real-time state synchronisation across all browsers
• PostgreSQL as the permanent source of truth for all records
________________________________________
4. Updated Technology Stack
4.1 Full Stack Decision Table
Layer	Technology	Reason
Frontend	Next.js (React)	Server-side rendering, fast dashboards, large ecosystem, WebSocket and Firebase SDK support, better than Flutter Web for admin/ops interfaces
Backend API	FastAPI (Python)	Async-native, high performance, automatic OpenAPI docs, handles business logic, session rules, and payroll calculations cleanly
Primary Database	PostgreSQL	Source of truth for all permanent records: workers, sessions, payroll, audit log, quality scores, shift history
Real-Time Layer	Firebase Realtime Database / Firestore	Sub-second state push for live RDP board, active session status, and shift notifications — no polling required
Authentication	Firebase Auth	Handles login, role-based tokens, session management cleanly across web and future mobile
RDP Gateway	Apache Guacamole	Browser-based RDP access, credentials stored server-side only, no client installation required
Machine Monitoring	Uptime Kuma	Self-hosted TCP/ping monitoring for all RDP machines, alerting via email/Slack/Telegram, 90-day uptime history
Health Monitor	Custom Python Worker	Application-layer watchdog — polls all RDP machines every 30 seconds, updates PostgreSQL, pushes state to Firebase
Reverse Proxy	Nginx	Single entry point, SSL termination, routes all traffic, WebSocket proxying
Containerisation	Docker + Docker Compose	All services run in isolated containers, consistent environments, easy deployment

4.2 Why Firebase + PostgreSQL Together
These two databases serve different purposes and do not compete:
PostgreSQL stores everything that must be permanent, auditable, and financially accurate. Payroll records, session history, worker profiles, quality scores, and the full audit log all live here. It is the source of truth. If Firebase were wiped, PostgreSQL would still have the complete operational history of the company.
Firebase handles everything that must be instant. When an RDP machine comes online, every worker's dashboard updates within milliseconds. When an admin approves a shift, the worker sees it immediately without refreshing. Firebase removes the need for complex WebSocket infrastructure for real-time updates — it handles that problem natively.
Firebase Auth provides a clean, secure login layer that issues tokens respected by both the Firebase real-time layer and the FastAPI backend.

4.3 Why Next.js Over Flutter Web
Flutter Web is designed for mobile-ported apps. For an operations dashboard used by workers, admins, and leadership across different devices, Next.js is the correct choice. It renders faster in the browser, integrates natively with Firebase SDK and REST APIs, has a far larger component ecosystem for dashboards and data tables, and is familiar to a much wider pool of developers — reducing future onboarding costs.

4.4 Why Uptime Kuma Over Prometheus and Grafana
Prometheus and Grafana are the right tools for infrastructure teams managing 100+ services with dedicated DevOps staff. For 15–50 RDP machines at this stage, Uptime Kuma deploys in a single Docker command, monitors TCP port 3389 on all machines on a schedule, sends alerts via email, Slack, or Telegram when a machine goes offline, and provides 90-day uptime history per machine — with zero configuration files required. Prometheus can be introduced later when the platform scales beyond 50 machines and a dedicated ops function exists.
________________________________________
5. Full Module Architecture
The system is composed of nine functional modules. Each has its own API routes, database tables, business logic, and frontend views.
Module 1 — Authentication and Roles
Firebase Auth manages all login and session tokens. FastAPI validates Firebase tokens on every API request and enforces role-based permissions.
Roles defined in the system:
Role	Access Level
superadmin	Full system access, user management, all data
leadership	Org dashboard, reporting, payroll export, read all
operations_lead	Shift approval, RDP assignment, session management
country_manager	Country-scoped worker and session view
admin	Worker records, session management, audit log
worker	Own schedule, own RDP, own stats, leaderboard
tech_admin	Infrastructure access, deployment, no payroll access

Module 2 — Worker Records
Stores and manages all worker profiles. Each worker record connects to their shifts, sessions, quality scores, and payroll data.
Fields: Worker ID, full name, country, role, pay tier, hourly rate, currency, status (active/inactive/suspended), start date, country manager, notes, total hours accumulated, quality score.

Module 3 — Shift Scheduling
This is one of the most important modules. It replaces the WhatsApp table submission process entirely.
Worker flow:
1. Worker logs in and opens the Schedule page
2. Worker selects available time slots from a calendar interface — days and hours they can work
3. Worker submits their availability for admin review
4. System records the submission with timestamp
Admin/Operations flow:
1. Admin sees all submitted availabilities in a queue
2. Admin reviews, approves, or modifies the submission
3. Admin assigns an available RDP machine to the approved shift
4. Worker receives a real-time notification (via Firebase) that their shift is confirmed and which RDP they are assigned to
5. At shift start time, the RDP becomes claimable for that worker only
This creates a clean chain: availability submission → admin approval → RDP assignment → shift window → claim → session → release.

Module 4 — RDP / Resource Records
Manages the state and configuration of all RDP machines.
States per machine:
State	Meaning	Colour
OFFLINE	Machine unreachable, powered off	Grey
ONLINE_FREE	Machine on, RDP port open, unassigned	Green
ASSIGNED	Machine allocated to an upcoming approved shift, not yet active	Blue
ACTIVE	Machine in live use by a worker	Red
IDLE	Machine assigned or active but no heartbeat detected	Amber
UNHEALTHY	Machine reachable but RDP port not responding	Orange
ADMIN_LOCKED	Locked by leadership, cannot be claimed	Dark Red
UNDER_REVIEW	Flagged for management attention	Yellow
These states are written to PostgreSQL and mirrored to Firebase in real time. Every connected browser shows the current state within milliseconds of any change.

Module 5 — Claim and Release Engine
This is the core allocation logic. It enforces that only the worker assigned to a shift can claim that RDP during the shift window, and that no two workers can ever hold the same machine simultaneously.
Claim flow:
1. Worker clicks Claim on their assigned RDP at shift start
2. FastAPI receives the claim request with Firebase Auth token
3. FastAPI verifies: is this worker's shift currently active? Is this the correct RDP?
4. FastAPI acquires a distributed lock on that RDP machine ID
5. FastAPI writes the allocation record to PostgreSQL
6. FastAPI updates RDP state to ACTIVE in PostgreSQL and pushes to Firebase
7. FastAPI generates Guacamole session token
8. Worker's browser opens Guacamole iframe — RDP session begins
9. All other connected browsers see the machine flip to Active in real time
Release flow:
1. Worker clicks Release, or heartbeat stops for 10 minutes
2. FastAPI closes the Guacamole session
3. FastAPI writes session end time, duration, and release reason to PostgreSQL
4. FastAPI updates RDP state to ONLINE_FREE or ASSIGNED for next shift
5. Firebase updated — all dashboards reflect the change instantly

Module 6 — Session Tracking and Evidence
Every session is a complete record of a unit of work. This is the foundation of the evidence stack.
Session record fields: Session ID, Worker ID, RDP ID, shift ID, start time, end time, duration (minutes), status, release reason, admin notes, approval state, payroll period link, quality flag.
The heartbeat system runs in the browser — every 60 seconds, the frontend sends a keep-alive ping to FastAPI. If no heartbeat arrives for 10 minutes, the session is marked idle. If no heartbeat arrives for 20 minutes, the session is auto-released, logged, and the RDP returned to available state.

Module 7 — Quality Scoring
This is a hybrid module combining objective assessment data with subjective admin ratings.
Assessment component: Workers complete training assessments on the platform. Each assessment has a score. The system tracks assessment completion, scores, and improvement over time. Assessment performance contributes to a calculated quality component.
Subjective admin component: After sessions or at review intervals, admins and country managers can apply a quality rating to a worker (1–5 scale) with a mandatory reason note. These are logged with timestamp and actor — they cannot be applied anonymously.
Composite quality score: The system calculates a rolling quality score per worker combining:
• Average assessment score (weighted)
• Average admin rating (weighted)
• Consistency bonus (low variance in scores over time)
• Session reliability factor (completed vs. abandoned sessions ratio)
This score is visible to the worker themselves and to leadership. It feeds directly into the leaderboard.

Module 8 — Leaderboard and Performance Dashboard
Visible to all workers when they log in. Designed to be competitive and motivating.
Metrics displayed on the leaderboard:
Metric	Description
Total hours this period	Verified session hours in the current payroll period
Total hours all time	Cumulative verified hours since account creation
Quality score	Composite score from Module 7
Sessions completed	Total sessions with clean release records
Reliability rate	Percentage of shifts claimed and completed vs. abandoned
Streak	Consecutive days with a completed session
Country rank	Position within their country team
Global rank	Position across all active workers
Workers see their own stats prominently and can view the full leaderboard. Leadership sees the full leaderboard with additional filters (by country, by period, by RDP, by tier).

Module 9 — Payroll Bridge
Converts verified session data into payroll-ready output. This module connects to the existing payroll workbook logic by replicating its calculations inside the platform and eventually replacing the manual workbook entirely.
Payroll period flow:
1. Admin opens or creates a payroll period (e.g. 1–31 May)
2. System pulls all approved sessions in that period per worker
3. System applies the worker's hourly rate and pay tier
4. System flags exceptions: sessions missing end times, sessions under review, disputed durations
5. Admin reviews the period, resolves exceptions, and marks sessions as payroll-approved
6. System generates export: CSV or Excel, one row per worker, showing hours, rate, gross pay, deductions, net pay
7. Export feeds into the existing payment process or future payment provider integration
________________________________________
6. Data Architecture
6.1 PostgreSQL — Permanent Tables
workers
├── id, name, email, country, role, pay_tier
├── hourly_rate, currency, status
├── quality_score, total_hours, created_at

shifts
├── id, worker_id, submitted_at, status
├── start_time, end_time, approved_by
├── rdp_id (assigned by admin on approval)

rdp_machines
├── id, name, internal_ip, rdp_port
├── status, guacamole_connection_id
├── country, assigned_shift_id, last_health_check_at

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
________________________________________
10. Repository Structure
/globalsolutions-platform
├── /docs
│   ├── architecture.md
│   ├── api-reference.md
│   ├── data-models.md
│   ├── deployment.md
│   ├── security.md
│   └── payroll-bridge.md
├── /services
│   ├── /backend
│   │   ├── /auth
│   │   ├── /workers
│   │   ├── /shifts
│   │   ├── /rdp
│   │   ├── /allocations
│   │   ├── /sessions
│   │   ├── /quality
│   │   ├── /leaderboard
│   │   ├── /payroll
│   │   ├── /admin
│   │   └── /integrations
│   ├── /frontend
│   │   ├── /pages
│   │   │   ├── /worker
│   │   │   ├── /admin
│   │   │   └── /leadership
│   │   └── /components
│   └── /monitor
├── /nginx
├── docker-compose.yml
├── .env.example
└── README.md
________________________________________
11. Delivery Phases (Aligned to Mandate)
Phase	Window	Primary Output
Phase 0 — Setup	Days 1–7	Data models confirmed, repository live, environment set up, wireframes, sprint plan
Phase 1 — MVP Core	Days 8–30	Auth, worker records, RDP board, shift submission, admin approval, claim/release, session logging
Phase 2 — Payroll Bridge	Days 31–45	Pay rates, session-linked hours, payroll period export, exception flags
Phase 3 — Quality + Leaderboard	Days 46–60	Assessment module, quality scoring, leaderboard, worker performance dashboard
Phase 4 — Security Hardening	Days 61–75	Role enforcement audit, environment hardening, backup plan, deployment documentation
Phase 5 — Leadership Dashboard	Days 76–90	Full org command view, utilisation reporting, export suite, management intelligence
Phase 6 — Scale Layer	After Day 90	Country pods, multi-currency payroll, API integrations, quality automation, mobile-optimised views
________________________________________
Appendix — New Elements Mapping
What You Described	What It Becomes in the System
Workers submit schedules via group chat	Shift Scheduling Module — workers self-submit availability/shifts in advance
Admin accepts and allocates RDP to a shift	Shift Approval + RDP Assignment Flow — admin reviews, approves, RDP becomes available at shift time
Who has done the most hours, competitive metrics	Leaderboard + Performance Dashboard — visible to workers, gamified
Quality rating from training assessments	Quality Score Module — subjective + assessment-data driven score per worker
Workers see which RDPs are live/dead	Live RDP Status Board — already planned, now confirmed as worker-facing too
Leadership manages org culture on the platform	Leadership Command Dashboard — full org view
Payroll integration (currently a workbook)	Payroll Bridge Module — ingests the existing workbook logic
Handling 100s of workers	Scalable multi-tenant architecture
Firebase approved for real-time + notifications	Hybrid DB: Firebase (real-time) + PostgreSQL (source of truth)

Revised Database Strategy
Data	Storage	Why
Users, workers, payroll records, audit log, sessions history	PostgreSQL	ACID compliance, source of truth, financial accuracy
Live RDP states, active sessions, real-time presence	Firebase Realtime DB / Firestore	Sub-second push to all browsers without WebSocket complexity
Shift scheduling, notifications	Firebase	Real-time availability updates
Authentication	Firebase Auth	Handles login, roles, tokens cleanly, integrates with both DBs

End of document.
#   W o r k f o r c e - A l l o c a t i o n - P l a t f o r m  
 