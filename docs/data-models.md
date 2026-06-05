
**Document:** Phase 0 canonical database specification  
**Version:** 1.0  
**Status:** Requirements lock — pending GlobalSolutions approval  
**Charter reference:** Project Charter V2.0 (90-Day Delivery Plan)
Document: Phase 0 canonical database specification
Version: 1.0
Status: Requirements lock — pending GlobalSolutions approval
Charter reference: Project Charter V2.0 (90-Day Delivery Plan)

What is a data model?
A data model is the formal blueprint for how information is stored, related, and constrained in the platform. It answers:

What entities exist? (workers, sessions, RDP machines, payroll periods, etc.)
What fields does each entity carry? (name, type, timestamps, status)
How do entities relate? (a session belongs to one worker; a partner worker belongs to one partner entity)
What rules must always hold? (no double RDP claims, audit log is append-only, split percentages must sum to 100%)
For GlobalSolutions, the data model is the contract between business requirements and the PostgreSQL schema that FastAPI will implement. Every session allocation, payroll calculation, and quality score ultimately reads from or writes to these structures.

What is an ERD?
An Entity-Relationship Diagram (ERD) is a visual map of the data model. Boxes represent entities (tables). Lines represent relationships (foreign keys). Cardinality markers show whether one worker has many sessions, one RDP machine has one active session, and so on.

Phase 0 requires a confirmed ERD before production build begins so that session allocation, double-claim prevention, and payroll accuracy are designed correctly from day one — not retrofitted after code is written.

Storage strategy
Layer	Technology	Role
Source of truth	PostgreSQL	Permanent, auditable, financially accurate records
Real-time display	Firebase	Live RDP board, active sessions, notifications, leaderboard
Distributed locking	Redis	Atomic RDP claim locks, session heartbeat state
PostgreSQL holds the canonical record. Firebase mirrors live state written by the FastAPI backend. If Firebase is unavailable, historical data remains intact; if PostgreSQL is unavailable, new actions are rejected to protect integrity.

High-level ERD


























































































































































































































































Session-centric detail (core of the platform)
Every productive hour — whether on a GlobalSolutions RDP machine, a partner multilog client, or a third-party platform — is recorded as a session. This unified model powers leadership dashboards, payroll, and quality scoring.





















Session type extensions (type_specific_fields JSONB)
Session type	Additional persisted fields
GS RDP	guacamole_connection_token, machine_health_at_start, machine_health_at_end, last_heartbeat_at
Partner multilog	multilog_client_name, partner_reference_id
Third-party platform	platform_name (Handshake, Outlier, Prolific), task_or_batch_reference, self_reported_duration_minutes, optional_reported_earnings
PostgreSQL table definitions
1. admin_users
Platform operators authenticated via Firebase Auth. Roles are enforced server-side on every API call.

Column	Type	Constraints	Description
id	UUID	PK, default gen_random_uuid()	Internal primary key
firebase_uid	VARCHAR(128)	UNIQUE, NOT NULL	Firebase Auth UID
email	VARCHAR(255)	UNIQUE, NOT NULL	Login email
role	admin_role_enum	NOT NULL	See roles below
display_name	VARCHAR(255)	NOT NULL	Shown in audit log and UI
country_scope	VARCHAR(64)	NULL	Set for country managers; NULL = global
status	account_status_enum	NOT NULL, default active	active, deactivated
created_at	TIMESTAMPTZ	NOT NULL, default now()	Account creation
updated_at	TIMESTAMPTZ	NOT NULL, default now()	Last profile update
Roles (admin_role_enum): ceo_leadership, operations_lead, country_manager, technical_admin

Workers authenticate through the same Firebase project but are stored in workers, linked optionally via admin_user_id.

2. workers
Both GlobalSolutions registered workers and partner workers.

Column	Type	Constraints	Description
id	UUID	PK	Worker record ID
admin_user_id	UUID	FK → admin_users.id, UNIQUE, NULL	Auth link when worker has login
worker_type	worker_type_enum	NOT NULL	gs_registered, partner_worker
partner_entity_id	UUID	FK → partner_entities.id, NULL	Required when worker_type = partner_worker
display_name	VARCHAR(255)	NOT NULL	Full name
country	VARCHAR(64)	NOT NULL	Country team assignment
pay_tier	VARCHAR(64)	NOT NULL	Rate tier label
status	worker_status_enum	NOT NULL	active, inactive, suspended
start_date	DATE	NOT NULL	Onboarding date
created_at	TIMESTAMPTZ	NOT NULL	Record created
updated_at	TIMESTAMPTZ	NOT NULL	Last update
Check constraint: partner_entity_id IS NOT NULL when worker_type = 'partner_worker'.

Frontend alignment: Mock workers in frontend/lib/mock-data.ts use type: 'GS Registered' | 'Partner Worker' and optional partner name — maps directly to worker_type + partner_entity_id.

3. partner_entities
Organisations through which outsourced workers operate.

Column	Type	Constraints	Description
id	UUID	PK	Partner ID
name	VARCHAR(255)	UNIQUE, NOT NULL	Partner organisation name
notes	TEXT	NULL	Relationship notes
status	entity_status_enum	NOT NULL	active, inactive
created_at	TIMESTAMPTZ	NOT NULL	Record created
4. partner_arrangements
Default revenue-split structure per partner.

Column	Type	Constraints	Description
id	UUID	PK	Arrangement ID
partner_entity_id	UUID	FK, NOT NULL	Partner this arrangement belongs to
worker_pct	NUMERIC(5,2)	NOT NULL	Worker share (e.g. 70.00)
gs_pct	NUMERIC(5,2)	NOT NULL	GlobalSolutions share
partner_pct	NUMERIC(5,2)	NOT NULL	Partner share
effective_from	DATE	NOT NULL	Start of arrangement
effective_to	DATE	NULL	End date; NULL = current
notes	TEXT	NULL	Commercial terms
Check constraint: worker_pct + gs_pct + partner_pct = 100.00

5. partner_client_overrides
Client-specific percentage overrides within a partner arrangement.

Column	Type	Constraints	Description
id	UUID	PK	Override ID
partner_arrangement_id	UUID	FK, NOT NULL	Parent arrangement
client_name	VARCHAR(255)	NOT NULL	Client or account holder
worker_pct	NUMERIC(5,2)	NOT NULL	Override worker share
gs_pct	NUMERIC(5,2)	NOT NULL	Override GS share
partner_pct	NUMERIC(5,2)	NOT NULL	Override partner share
effective_from	DATE	NOT NULL	Override start
notes	TEXT	NULL	Reason for override
6. rdp_resources
GlobalSolutions RDP machines managed through the 8-state machine.

Column	Type	Constraints	Description
id	UUID	PK	Internal machine ID
nickname	VARCHAR(64)	UNIQUE, NOT NULL	Display ID (e.g. RDP-KE-001)
country	VARCHAR(64)	NOT NULL	Geographic grouping
client_group	VARCHAR(128)	NOT NULL	Client/account grouping
status	rdp_status_enum	NOT NULL	Current state (see below)
assigned_worker_id	UUID	FK → workers.id, NULL	Worker with current claim
guacamole_connection_id	VARCHAR(128)	NULL	Server-side Guacamole reference
health_notes	TEXT	NULL	Admin/ops notes
risk_flags	JSONB	default '[]'	Structured risk markers
last_health_check_at	TIMESTAMPTZ	NULL	Last Uptime Kuma / port check
status_changed_at	TIMESTAMPTZ	NOT NULL	Last state transition
RDP status enum (rdp_status_enum):

Value	Meaning
offline	Unreachable or powered off
online_free	Available for claiming
assigned	Allocated; session not yet active
active	Live worker session
idle	Session open; heartbeat exceeded threshold
unhealthy	Reachable but port/health check failing
admin_locked	Manually locked by leadership
maintenance	Under maintenance
Frontend alignment: frontend/lib/mock-data.ts → machines[] with status values map 1:1 to this enum.

7. shifts
Worker availability submissions and admin-approved schedules.

Column	Type	Constraints	Description
id	UUID	PK	Shift ID
worker_id	UUID	FK, NOT NULL	Submitting worker
rdp_resource_id	UUID	FK, NULL	Assigned machine after approval
scheduled_start	TIMESTAMPTZ	NOT NULL	Planned start
scheduled_end	TIMESTAMPTZ	NOT NULL	Planned end
status	shift_status_enum	NOT NULL	pending, approved, rejected, cancelled
approved_by	UUID	FK → admin_users.id, NULL	Approving admin
approved_at	TIMESTAMPTZ	NULL	Approval timestamp
rejection_reason	TEXT	NULL	Required when rejected
created_at	TIMESTAMPTZ	NOT NULL	Submission time
8. allocations
Atomic claim records linking a worker to an RDP at a point in time. Central to double-claim prevention.

Column	Type	Constraints	Description
id	UUID	PK	Allocation ID
shift_id	UUID	FK → shifts.id, NULL	Originating approved shift
worker_id	UUID	FK, NOT NULL	Claiming worker
rdp_resource_id	UUID	FK, NOT NULL	Claimed machine
claimed_at	TIMESTAMPTZ	NOT NULL	Claim timestamp
released_at	TIMESTAMPTZ	NULL	Release timestamp
release_reason	release_reason_enum	NULL	Why session ended
guacamole_token	VARCHAR(512)	NULL	Short-lived connection token
created_at	TIMESTAMPTZ	NOT NULL	Record created
Critical constraint: Partial unique index on rdp_resource_id WHERE released_at IS NULL — only one open allocation per machine at any time.

Claim flow (Phase 1 acceptance):

Redis distributed lock acquired on rdp:{id}
PostgreSQL transaction: verify rdp_resources.status = online_free
Update status → assigned, insert allocations row, write audit_log
Mirror to Firebase; commit transaction
Second concurrent claim fails at step 2 or unique index
9. sessions
Unified session log for all three session types.

Column	Type	Constraints	Description
id	UUID	PK	Session ID
worker_id	UUID	FK, NOT NULL	Worker who performed the work
session_type	session_type_enum	NOT NULL	See session types
allocation_id	UUID	FK → allocations.id, NULL	Set for GS RDP sessions
rdp_resource_id	UUID	FK, NULL	Set for GS RDP sessions
partner_entity_id	UUID	FK, NULL	Set for partner / some third-party sessions
partner_arrangement_id	UUID	FK, NULL	Arrangement used for payroll split
start_time	TIMESTAMPTZ	NOT NULL	Session start
end_time	TIMESTAMPTZ	NULL	Session end
duration_minutes	INTEGER	NULL	Calculated on close
close_status	session_close_enum	NULL	How session ended
payroll_approval_state	payroll_session_enum	NOT NULL, default pending	Payroll review state
payroll_period_id	UUID	FK, NULL	Assigned after period close
admin_notes	TEXT	NULL	Admin corrections / context
type_specific_fields	JSONB	NOT NULL, default '{}'	Type-specific payload
created_at	TIMESTAMPTZ	NOT NULL	Record created
updated_at	TIMESTAMPTZ	NOT NULL	Last update
Session type enum: gs_rdp, partner_multilog, third_party_platform

Close status enum: completed, force_released, abandoned, timed_out

10. rate_table_entries
Worker or tier base rates for payroll calculation.

Column	Type	Constraints	Description
id	UUID	PK	Rate entry ID
worker_id	UUID	FK, NULL	Worker-specific rate
pay_tier	VARCHAR(64)	NULL	Tier-level rate when worker_id NULL
rate_type	rate_type_enum	NOT NULL	hourly, per_task
amount	NUMERIC(12,2)	NOT NULL	Base rate amount
currency	CHAR(3)	NOT NULL	ISO currency code
effective_from	DATE	NOT NULL	Rate start date
effective_to	DATE	NULL	Rate end date
change_reason	TEXT	NOT NULL	Why rate changed
approved_by	UUID	FK → admin_users.id, NOT NULL	Approving admin
created_at	TIMESTAMPTZ	NOT NULL	Record created
11. payroll_periods
Bounded windows for payroll export and approval.

Column	Type	Constraints	Description
id	UUID	PK	Period ID
label	VARCHAR(64)	NOT NULL	e.g. 2026-05
start_date	DATE	NOT NULL	Period start (inclusive)
end_date	DATE	NOT NULL	Period end (inclusive)
currency	CHAR(3)	NOT NULL	Base currency for export
status	payroll_period_enum	NOT NULL	open, calculated, approved, paid
approved_by	UUID	FK, NULL	Leadership approver
export_generated_at	TIMESTAMPTZ	NULL	Last export timestamp
created_at	TIMESTAMPTZ	NOT NULL	Period opened
12. payroll_line_items
Per-worker, per-session payroll calculation output.

Column	Type	Constraints	Description
id	UUID	PK	Line item ID
payroll_period_id	UUID	FK, NOT NULL	Parent period
session_id	UUID	FK, NOT NULL	Source session
worker_id	UUID	FK, NOT NULL	Paid worker
session_type	session_type_enum	NOT NULL	Channel type
gross_amount	NUMERIC(12,2)	NOT NULL	Before splits
worker_pct	NUMERIC(5,2)	NOT NULL	Applied worker %
gs_pct	NUMERIC(5,2)	NOT NULL	Applied GS %
partner_pct	NUMERIC(5,2)	NOT NULL	Applied partner %
worker_net	NUMERIC(12,2)	NOT NULL	Net to worker
gs_net	NUMERIC(12,2)	NOT NULL	Net to GS
partner_net	NUMERIC(12,2)	NOT NULL	Net to partner
exception_flags	JSONB	default '[]'	Auto-generated flags
created_at	TIMESTAMPTZ	NOT NULL	Calculated at
Auto exception flags: missing required fields, force-released without reason, hours deviation from shift, percentages ≠ 100%.

13. Quality scoring tables
quality_indicators
Generic indicator definitions — extensible without schema changes.

Column	Type	Description
id	UUID	PK
code	VARCHAR(64)	UNIQUE — e.g. organisation, communication
name	VARCHAR(128)	Display name
description	TEXT	What it measures
weight_in_subjective_pool	NUMERIC(5,2)	Share of the 50% subjective half
input_mode	indicator_input_enum	auto, manual
scale_min	SMALLINT	e.g. 1
scale_max	SMALLINT	e.g. 5
is_active	BOOLEAN	Whether included in composite
Confirmed indicators at MVP:

Code	Weight (of 50% subjective)	Input
mcq_assessment	50% of total score (separate pool)	Auto from MCQ results
organisation	Configurable share of subjective 50%	Auto from session punctuality
communication	Configurable share of subjective 50%	Manual admin rating + mandatory reason
quality_indicator_ratings
Column	Type	Description
id	UUID	PK
worker_id	UUID	FK → workers
indicator_id	UUID	FK → quality_indicators
score	NUMERIC(5,2)	Rating value
reason_note	TEXT	Mandatory for manual ratings
rated_by	UUID	FK → admin_users
session_id	UUID	FK, NULL — optional context link
created_at	TIMESTAMPTZ	Rating timestamp
quality_composite_scores
Column	Type	Description
id	UUID	PK
worker_id	UUID	FK
mcq_component	NUMERIC(5,2)	50% weighted MCQ score
subjective_component	NUMERIC(5,2)	50% weighted subjective score
composite_score	NUMERIC(5,2)	Final score
country_rank	INTEGER	Rank within country
global_rank	INTEGER	Organisation-wide rank
session_streak_days	INTEGER	Consecutive days with completed session
calculated_at	TIMESTAMPTZ	Snapshot time
14. MCQ assessment tables
mcq_assessment_sets
Column	Type	Description
id	UUID	PK
title	VARCHAR(255)	Assessment name
category	VARCHAR(128)	e.g. Technical, Compliance
passing_score_pct	NUMERIC(5,2)	Minimum pass threshold
is_active	BOOLEAN	Available for assignment
created_by	UUID	FK → admin_users
mcq_questions
Column	Type	Description
id	UUID	PK
assessment_set_id	UUID	FK
prompt	TEXT	Question text
options	JSONB	Array of answer options
correct_option_key	VARCHAR(8)	Key of correct answer
sort_order	INTEGER	Display order
mcq_results
Column	Type	Description
id	UUID	PK
worker_id	UUID	FK
assessment_set_id	UUID	FK
score_pct	NUMERIC(5,2)	Achieved score
passed	BOOLEAN	Met passing threshold
completed_at	TIMESTAMPTZ	Completion time
mcq_result_answers
Column	Type	Description
id	UUID	PK
mcq_result_id	UUID	FK
question_id	UUID	FK
selected_option_key	VARCHAR(8)	Worker's answer
is_correct	BOOLEAN	Graded result
15. audit_log (append-only)
Every material action is permanently attributable.

Column	Type	Constraints	Description
id	UUID	PK	Log entry ID
actor_id	UUID	FK, NULL	Admin or worker user ID
action	VARCHAR(64)	NOT NULL	e.g. CLAIM, FORCE_RELEASE, PAYROLL_APPROVE
target_type	VARCHAR(64)	NOT NULL	e.g. rdp_resource, session, worker
target_id	UUID	NOT NULL	Entity affected
previous_value	JSONB	NULL	State before
new_value	JSONB	NULL	State after
reason_note	TEXT	NULL	Required for overrides
ip_address	INET	NULL	Client IP when available
created_at	TIMESTAMPTZ	NOT NULL	Immutable timestamp
Rule: No UPDATE or DELETE privileges on this table for application roles.

16. Supporting tables (post-MVP / charter appendix)
session_tickets
Worker-reported issues tied to a session for admin triage.

Column	Type	Description
id	UUID	PK
session_id	UUID	FK
worker_id	UUID	FK
description	TEXT	Issue detail
status	ticket_status_enum	open, under_review, resolved
resolved_by	UUID	FK, NULL
created_at	TIMESTAMPTZ	Submitted
knowledge_base_articles
Admin-managed SOP and task guidance for workers.

Column	Type	Description
id	UUID	PK
title	VARCHAR(255)	Article title
body	TEXT	Markdown content
version	INTEGER	Version number
published_at	TIMESTAMPTZ	When live
created_by	UUID	FK → admin_users
Firebase real-time collections
Firebase is not the source of truth. FastAPI writes here after every PostgreSQL commit for live UI updates.

Path	Document shape	Updated when
/rdp_status/{rdp_id}	{ status, worker_id, updated_at }	RDP state machine transition
/active_sessions/{session_id}	{ worker_id, rdp_id, started_at, heartbeat_at }	Session start, heartbeat, end
/shift_notifications/{worker_id}/{notif_id}	{ type, title, body, read, created_at }	Shift approved/rejected, RDP assigned
/leaderboard/current_period	{ workers: [{ id, score, country_rank, global_rank, streak }], refreshed_at }	Every 5 minutes
/system_alerts/{alert_id}	{ type, severity, message, entity_ref, created_at }	Machine offline, idle session, payroll exception
Redis keys
Key pattern	Purpose	TTL
lock:rdp:{rdp_id}	Distributed claim lock	30 seconds (renewed during claim txn)
heartbeat:session:{session_id}	Last heartbeat timestamp	Session duration + buffer
rate:claim:{worker_id}	Claim attempt rate limiting	60 seconds
User roles → data access
Role	PostgreSQL scope	Typical operations
CEO / Leadership	Global read; payroll export	Organisation command, financial reports, audit read
Operations lead	Global read/write ops	Shift approval, RDP assign/lock, force-release, quality ratings
Country manager	Country-scoped workers/sessions	View and limited admin within country_scope
GS registered worker	Own worker row + own sessions	Claim RDP, log GS RDP sessions, assessments, leaderboard
Partner worker	Own worker row + own sessions	Log multilog / third-party sessions, assessments, leaderboard
Technical admin	Infrastructure metadata only	RDP health config; no payroll or PII by default
Phase 0 deliverable checklist
Item	Status in repo
Repository structure defined	✅ README.md folder layout
Data model documented (this file)	✅ docs/data-models.md
ERD produced	✅ Mermaid diagrams above
User roles defined	✅ Charter + frontend/lib/auth/config.ts (demo roles)
Wireframes for major screens	✅ Implemented as Next.js pages under frontend/app/
Sprint plan for remaining 83 days	⬜ To be added in docs/phase-progress.md
GlobalSolutions approval	⬜ Pending review
Implementation notes
Backend models not yet coded — backend/ is scaffolded in README; SQLAlchemy models in backend/models/ are planned but not committed. This document is the build reference.
Frontend uses mock data — frontend/lib/mock-data.ts reflects the entities above for UI development ahead of API wiring.
Migrations — Alembic migrations will be generated from these definitions during Phase 1 Week 2.
Charter amendments included — Extended worker model, three session types, variable payroll percentages, 50/50 quality weighting, deferred WhatsApp, and Claude AI placeholder are all reflected in schema design.
Prepared for GlobalSolutions Phase 0 — Requirements Lock. Confidential.
---

## What is a data model?

A **data model** is the formal blueprint for how information is stored, related, and constrained in the platform. It answers:

- **What entities exist?** (workers, sessions, RDP machines, payroll periods, etc.)
- **What fields does each entity carry?** (name, type, timestamps, status)
- **How do entities relate?** (a session belongs to one worker; a partner worker belongs to one partner entity)
- **What rules must always hold?** (no double RDP claims, audit log is append-only, split percentages must sum to 100%)

For GlobalSolutions, the data model is the contract between business requirements and the PostgreSQL schema that FastAPI will implement. Every session allocation, payroll calculation, and quality score ultimately reads from or writes to these structures.

## What is an ERD?

An **Entity-Relationship Diagram (ERD)** is a visual map of the data model. Boxes represent **entities** (tables). Lines represent **relationships** (foreign keys). Cardinality markers show whether one worker has many sessions, one RDP machine has one active session, and so on.

Phase 0 requires a confirmed ERD before production build begins so that session allocation, double-claim prevention, and payroll accuracy are designed correctly from day one — not retrofitted after code is written.

---

## Storage strategy

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Source of truth** | PostgreSQL | Permanent, auditable, financially accurate records |
| **Real-time display** | Firebase | Live RDP board, active sessions, notifications, leaderboard |
| **Distributed locking** | Redis | Atomic RDP claim locks, session heartbeat state |

PostgreSQL holds the canonical record. Firebase mirrors live state written by the FastAPI backend. If Firebase is unavailable, historical data remains intact; if PostgreSQL is unavailable, new actions are rejected to protect integrity.

---

## High-level ERD

```mermaid
erDiagram
    ADMIN_USERS ||--o{ AUDIT_LOG : performs
    ADMIN_USERS ||--o{ QUALITY_INDICATOR_RATINGS : rates
    ADMIN_USERS ||--o{ SHIFTS : approves

    PARTNER_ENTITIES ||--o{ WORKERS : employs
    PARTNER_ENTITIES ||--o{ PARTNER_ARRANGEMENTS : defines
    PARTNER_ARRANGEMENTS ||--o{ PARTNER_CLIENT_OVERRIDES : overrides

    WORKERS ||--o{ SHIFTS : submits
    WORKERS ||--o{ SESSIONS : opens
    WORKERS ||--o{ RATE_TABLE_ENTRIES : has
    WORKERS ||--o{ MCQ_RESULTS : completes
    WORKERS ||--o{ QUALITY_COMPOSITE_SCORES : receives
    WORKERS ||--o{ SESSION_TICKETS : raises

    RDP_RESOURCES ||--o{ SHIFTS : assigned_to
    RDP_RESOURCES ||--o{ ALLOCATIONS : claimed_via
    RDP_RESOURCES ||--o{ SESSIONS : hosts

    SHIFTS ||--o| ALLOCATIONS : may_produce
    ALLOCATIONS ||--o| SESSIONS : starts

    PAYROLL_PERIODS ||--o{ SESSIONS : contains
    PAYROLL_PERIODS ||--o{ PAYROLL_LINE_ITEMS : generates

    SESSIONS ||--o{ PAYROLL_LINE_ITEMS : calculates
    PARTNER_ARRANGEMENTS ||--o{ SESSIONS : governs_split

    MCQ_ASSESSMENT_SETS ||--o{ MCQ_QUESTIONS : contains
    MCQ_ASSESSMENT_SETS ||--o{ MCQ_RESULTS : produces
    MCQ_RESULTS ||--o{ MCQ_RESULT_ANSWERS : stores

    QUALITY_INDICATORS ||--o{ QUALITY_INDICATOR_RATINGS : typed_by
    WORKERS ||--o{ QUALITY_INDICATOR_RATINGS : rated

    ADMIN_USERS {
        uuid id PK
        string firebase_uid UK
        string email UK
        enum role
        string display_name
        string country_scope
        enum status
        timestamptz created_at
    }

    WORKERS {
        uuid id PK
        uuid admin_user_id FK
        enum worker_type
        uuid partner_entity_id FK
        string display_name
        string country
        string pay_tier
        enum status
        date start_date
        timestamptz created_at
    }

    PARTNER_ENTITIES {
        uuid id PK
        string name UK
        text notes
        enum status
        timestamptz created_at
    }

    PARTNER_ARRANGEMENTS {
        uuid id PK
        uuid partner_entity_id FK
        decimal worker_pct
        decimal gs_pct
        decimal partner_pct
        date effective_from
        date effective_to
        text notes
    }

    RDP_RESOURCES {
        uuid id PK
        string nickname UK
        string country
        string client_group
        enum status
        uuid assigned_worker_id FK
        text health_notes
        jsonb risk_flags
        timestamptz status_changed_at
    }

    SHIFTS {
        uuid id PK
        uuid worker_id FK
        uuid rdp_resource_id FK
        timestamptz scheduled_start
        timestamptz scheduled_end
        enum status
        uuid approved_by FK
        timestamptz approved_at
    }

    ALLOCATIONS {
        uuid id PK
        uuid shift_id FK
        uuid worker_id FK
        uuid rdp_resource_id FK
        timestamptz claimed_at
        timestamptz released_at
        enum release_reason
        string guacamole_token
    }

    SESSIONS {
        uuid id PK
        uuid worker_id FK
        enum session_type
        uuid allocation_id FK
        uuid rdp_resource_id FK
        uuid partner_entity_id FK
        timestamptz start_time
        timestamptz end_time
        int duration_minutes
        enum close_status
        enum payroll_approval_state
        uuid payroll_period_id FK
        text admin_notes
        jsonb type_specific_fields
    }

    PAYROLL_PERIODS {
        uuid id PK
        date start_date
        date end_date
        string currency
        enum status
        uuid approved_by FK
        timestamptz export_generated_at
    }

    AUDIT_LOG {
        uuid id PK
        uuid actor_id FK
        string action
        string target_type
        uuid target_id
        jsonb previous_value
        jsonb new_value
        string ip_address
        timestamptz created_at
    }
```

---

## Session-centric detail (core of the platform)

Every productive hour — whether on a GlobalSolutions RDP machine, a partner multilog client, or a third-party platform — is recorded as a **session**. This unified model powers leadership dashboards, payroll, and quality scoring.

```mermaid
erDiagram
    SESSIONS }o--|| WORKERS : worker_id
    SESSIONS }o--o| RDP_RESOURCES : rdp_resource_id
    SESSIONS }o--o| PARTNER_ENTITIES : partner_entity_id
    SESSIONS }o--o| ALLOCATIONS : allocation_id
    SESSIONS }o--o| PAYROLL_PERIODS : payroll_period_id

    SESSIONS {
        enum session_type "gs_rdp | partner_multilog | third_party_platform"
        enum close_status "completed | force_released | abandoned | timed_out"
        enum payroll_approval_state "pending | approved | flagged | excluded"
    }
```

### Session type extensions (`type_specific_fields` JSONB)

| Session type | Additional persisted fields |
| :--- | :--- |
| **GS RDP** | `guacamole_connection_token`, `machine_health_at_start`, `machine_health_at_end`, `last_heartbeat_at` |
| **Partner multilog** | `multilog_client_name`, `partner_reference_id` |
| **Third-party platform** | `platform_name` (Handshake, Outlier, Prolific), `task_or_batch_reference`, `self_reported_duration_minutes`, `optional_reported_earnings` |

---

## PostgreSQL table definitions

### 1. `admin_users`

Platform operators authenticated via Firebase Auth. Roles are enforced server-side on every API call.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK, default `gen_random_uuid()` | Internal primary key |
| `firebase_uid` | `VARCHAR(128)` | UNIQUE, NOT NULL | Firebase Auth UID |
| `email` | `VARCHAR(255)` | UNIQUE, NOT NULL | Login email |
| `role` | `admin_role_enum` | NOT NULL | See roles below |
| `display_name` | `VARCHAR(255)` | NOT NULL | Shown in audit log and UI |
| `country_scope` | `VARCHAR(64)` | NULL | Set for country managers; NULL = global |
| `status` | `account_status_enum` | NOT NULL, default `active` | `active`, `deactivated` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` | Account creation |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, default `now()` | Last profile update |

**Roles (`admin_role_enum`):** `ceo_leadership`, `operations_lead`, `country_manager`, `technical_admin`

> Workers authenticate through the same Firebase project but are stored in `workers`, linked optionally via `admin_user_id`.

---

### 2. `workers`

Both GlobalSolutions registered workers and partner workers.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Worker record ID |
| `admin_user_id` | `UUID` | FK → `admin_users.id`, UNIQUE, NULL | Auth link when worker has login |
| `worker_type` | `worker_type_enum` | NOT NULL | `gs_registered`, `partner_worker` |
| `partner_entity_id` | `UUID` | FK → `partner_entities.id`, NULL | Required when `worker_type = partner_worker` |
| `display_name` | `VARCHAR(255)` | NOT NULL | Full name |
| `country` | `VARCHAR(64)` | NOT NULL | Country team assignment |
| `pay_tier` | `VARCHAR(64)` | NOT NULL | Rate tier label |
| `status` | `worker_status_enum` | NOT NULL | `active`, `inactive`, `suspended` |
| `start_date` | `DATE` | NOT NULL | Onboarding date |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Record created |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Last update |

**Check constraint:** `partner_entity_id IS NOT NULL` when `worker_type = 'partner_worker'`.

**Frontend alignment:** Mock workers in `frontend/lib/mock-data.ts` use `type: 'GS Registered' | 'Partner Worker'` and optional `partner` name — maps directly to `worker_type` + `partner_entity_id`.

---

### 3. `partner_entities`

Organisations through which outsourced workers operate.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Partner ID |
| `name` | `VARCHAR(255)` | UNIQUE, NOT NULL | Partner organisation name |
| `notes` | `TEXT` | NULL | Relationship notes |
| `status` | `entity_status_enum` | NOT NULL | `active`, `inactive` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Record created |

---

### 4. `partner_arrangements`

Default revenue-split structure per partner.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Arrangement ID |
| `partner_entity_id` | `UUID` | FK, NOT NULL | Partner this arrangement belongs to |
| `worker_pct` | `NUMERIC(5,2)` | NOT NULL | Worker share (e.g. 70.00) |
| `gs_pct` | `NUMERIC(5,2)` | NOT NULL | GlobalSolutions share |
| `partner_pct` | `NUMERIC(5,2)` | NOT NULL | Partner share |
| `effective_from` | `DATE` | NOT NULL | Start of arrangement |
| `effective_to` | `DATE` | NULL | End date; NULL = current |
| `notes` | `TEXT` | NULL | Commercial terms |

**Check constraint:** `worker_pct + gs_pct + partner_pct = 100.00`

---

### 5. `partner_client_overrides`

Client-specific percentage overrides within a partner arrangement.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Override ID |
| `partner_arrangement_id` | `UUID` | FK, NOT NULL | Parent arrangement |
| `client_name` | `VARCHAR(255)` | NOT NULL | Client or account holder |
| `worker_pct` | `NUMERIC(5,2)` | NOT NULL | Override worker share |
| `gs_pct` | `NUMERIC(5,2)` | NOT NULL | Override GS share |
| `partner_pct` | `NUMERIC(5,2)` | NOT NULL | Override partner share |
| `effective_from` | `DATE` | NOT NULL | Override start |
| `notes` | `TEXT` | NULL | Reason for override |

---

### 6. `rdp_resources`

GlobalSolutions RDP machines managed through the 8-state machine.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Internal machine ID |
| `nickname` | `VARCHAR(64)` | UNIQUE, NOT NULL | Display ID (e.g. `RDP-KE-001`) |
| `country` | `VARCHAR(64)` | NOT NULL | Geographic grouping |
| `client_group` | `VARCHAR(128)` | NOT NULL | Client/account grouping |
| `status` | `rdp_status_enum` | NOT NULL | Current state (see below) |
| `assigned_worker_id` | `UUID` | FK → `workers.id`, NULL | Worker with current claim |
| `guacamole_connection_id` | `VARCHAR(128)` | NULL | Server-side Guacamole reference |
| `health_notes` | `TEXT` | NULL | Admin/ops notes |
| `risk_flags` | `JSONB` | default `'[]'` | Structured risk markers |
| `last_health_check_at` | `TIMESTAMPTZ` | NULL | Last Uptime Kuma / port check |
| `status_changed_at` | `TIMESTAMPTZ` | NOT NULL | Last state transition |

**RDP status enum (`rdp_status_enum`):**

| Value | Meaning |
| :--- | :--- |
| `offline` | Unreachable or powered off |
| `online_free` | Available for claiming |
| `assigned` | Allocated; session not yet active |
| `active` | Live worker session |
| `idle` | Session open; heartbeat exceeded threshold |
| `unhealthy` | Reachable but port/health check failing |
| `admin_locked` | Manually locked by leadership |
| `maintenance` | Under maintenance |

**Frontend alignment:** `frontend/lib/mock-data.ts` → `machines[]` with `status` values map 1:1 to this enum.

---

### 7. `shifts`

Worker availability submissions and admin-approved schedules.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Shift ID |
| `worker_id` | `UUID` | FK, NOT NULL | Submitting worker |
| `rdp_resource_id` | `UUID` | FK, NULL | Assigned machine after approval |
| `scheduled_start` | `TIMESTAMPTZ` | NOT NULL | Planned start |
| `scheduled_end` | `TIMESTAMPTZ` | NOT NULL | Planned end |
| `status` | `shift_status_enum` | NOT NULL | `pending`, `approved`, `rejected`, `cancelled` |
| `approved_by` | `UUID` | FK → `admin_users.id`, NULL | Approving admin |
| `approved_at` | `TIMESTAMPTZ` | NULL | Approval timestamp |
| `rejection_reason` | `TEXT` | NULL | Required when rejected |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Submission time |

---

### 8. `allocations`

Atomic claim records linking a worker to an RDP at a point in time. Central to **double-claim prevention**.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Allocation ID |
| `shift_id` | `UUID` | FK → `shifts.id`, NULL | Originating approved shift |
| `worker_id` | `UUID` | FK, NOT NULL | Claiming worker |
| `rdp_resource_id` | `UUID` | FK, NOT NULL | Claimed machine |
| `claimed_at` | `TIMESTAMPTZ` | NOT NULL | Claim timestamp |
| `released_at` | `TIMESTAMPTZ` | NULL | Release timestamp |
| `release_reason` | `release_reason_enum` | NULL | Why session ended |
| `guacamole_token` | `VARCHAR(512)` | NULL | Short-lived connection token |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Record created |

**Critical constraint:** Partial unique index on `rdp_resource_id WHERE released_at IS NULL` — only one open allocation per machine at any time.

**Claim flow (Phase 1 acceptance):**
1. Redis distributed lock acquired on `rdp:{id}`
2. PostgreSQL transaction: verify `rdp_resources.status = online_free`
3. Update status → `assigned`, insert `allocations` row, write `audit_log`
4. Mirror to Firebase; commit transaction
5. Second concurrent claim fails at step 2 or unique index

---

### 9. `sessions`

Unified session log for all three session types.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Session ID |
| `worker_id` | `UUID` | FK, NOT NULL | Worker who performed the work |
| `session_type` | `session_type_enum` | NOT NULL | See session types |
| `allocation_id` | `UUID` | FK → `allocations.id`, NULL | Set for GS RDP sessions |
| `rdp_resource_id` | `UUID` | FK, NULL | Set for GS RDP sessions |
| `partner_entity_id` | `UUID` | FK, NULL | Set for partner / some third-party sessions |
| `partner_arrangement_id` | `UUID` | FK, NULL | Arrangement used for payroll split |
| `start_time` | `TIMESTAMPTZ` | NOT NULL | Session start |
| `end_time` | `TIMESTAMPTZ` | NULL | Session end |
| `duration_minutes` | `INTEGER` | NULL | Calculated on close |
| `close_status` | `session_close_enum` | NULL | How session ended |
| `payroll_approval_state` | `payroll_session_enum` | NOT NULL, default `pending` | Payroll review state |
| `payroll_period_id` | `UUID` | FK, NULL | Assigned after period close |
| `admin_notes` | `TEXT` | NULL | Admin corrections / context |
| `type_specific_fields` | `JSONB` | NOT NULL, default `'{}'` | Type-specific payload |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Record created |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | Last update |

**Session type enum:** `gs_rdp`, `partner_multilog`, `third_party_platform`

**Close status enum:** `completed`, `force_released`, `abandoned`, `timed_out`

---

### 10. `rate_table_entries`

Worker or tier base rates for payroll calculation.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Rate entry ID |
| `worker_id` | `UUID` | FK, NULL | Worker-specific rate |
| `pay_tier` | `VARCHAR(64)` | NULL | Tier-level rate when worker_id NULL |
| `rate_type` | `rate_type_enum` | NOT NULL | `hourly`, `per_task` |
| `amount` | `NUMERIC(12,2)` | NOT NULL | Base rate amount |
| `currency` | `CHAR(3)` | NOT NULL | ISO currency code |
| `effective_from` | `DATE` | NOT NULL | Rate start date |
| `effective_to` | `DATE` | NULL | Rate end date |
| `change_reason` | `TEXT` | NOT NULL | Why rate changed |
| `approved_by` | `UUID` | FK → `admin_users.id`, NOT NULL | Approving admin |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Record created |

---

### 11. `payroll_periods`

Bounded windows for payroll export and approval.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Period ID |
| `label` | `VARCHAR(64)` | NOT NULL | e.g. `2026-05` |
| `start_date` | `DATE` | NOT NULL | Period start (inclusive) |
| `end_date` | `DATE` | NOT NULL | Period end (inclusive) |
| `currency` | `CHAR(3)` | NOT NULL | Base currency for export |
| `status` | `payroll_period_enum` | NOT NULL | `open`, `calculated`, `approved`, `paid` |
| `approved_by` | `UUID` | FK, NULL | Leadership approver |
| `export_generated_at` | `TIMESTAMPTZ` | NULL | Last export timestamp |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Period opened |

---

### 12. `payroll_line_items`

Per-worker, per-session payroll calculation output.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Line item ID |
| `payroll_period_id` | `UUID` | FK, NOT NULL | Parent period |
| `session_id` | `UUID` | FK, NOT NULL | Source session |
| `worker_id` | `UUID` | FK, NOT NULL | Paid worker |
| `session_type` | `session_type_enum` | NOT NULL | Channel type |
| `gross_amount` | `NUMERIC(12,2)` | NOT NULL | Before splits |
| `worker_pct` | `NUMERIC(5,2)` | NOT NULL | Applied worker % |
| `gs_pct` | `NUMERIC(5,2)` | NOT NULL | Applied GS % |
| `partner_pct` | `NUMERIC(5,2)` | NOT NULL | Applied partner % |
| `worker_net` | `NUMERIC(12,2)` | NOT NULL | Net to worker |
| `gs_net` | `NUMERIC(12,2)` | NOT NULL | Net to GS |
| `partner_net` | `NUMERIC(12,2)` | NOT NULL | Net to partner |
| `exception_flags` | `JSONB` | default `'[]'` | Auto-generated flags |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Calculated at |

**Auto exception flags:** missing required fields, force-released without reason, hours deviation from shift, percentages ≠ 100%.

---

### 13. Quality scoring tables

#### `quality_indicators`

Generic indicator definitions — extensible without schema changes.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `code` | `VARCHAR(64)` | UNIQUE — e.g. `organisation`, `communication` |
| `name` | `VARCHAR(128)` | Display name |
| `description` | `TEXT` | What it measures |
| `weight_in_subjective_pool` | `NUMERIC(5,2)` | Share of the 50% subjective half |
| `input_mode` | `indicator_input_enum` | `auto`, `manual` |
| `scale_min` | `SMALLINT` | e.g. 1 |
| `scale_max` | `SMALLINT` | e.g. 5 |
| `is_active` | `BOOLEAN` | Whether included in composite |

**Confirmed indicators at MVP:**

| Code | Weight (of 50% subjective) | Input |
| :--- | :--- | :--- |
| `mcq_assessment` | 50% of **total** score (separate pool) | Auto from MCQ results |
| `organisation` | Configurable share of subjective 50% | Auto from session punctuality |
| `communication` | Configurable share of subjective 50% | Manual admin rating + mandatory reason |

#### `quality_indicator_ratings`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `worker_id` | `UUID` | FK → workers |
| `indicator_id` | `UUID` | FK → quality_indicators |
| `score` | `NUMERIC(5,2)` | Rating value |
| `reason_note` | `TEXT` | Mandatory for manual ratings |
| `rated_by` | `UUID` | FK → admin_users |
| `session_id` | `UUID` | FK, NULL — optional context link |
| `created_at` | `TIMESTAMPTZ` | Rating timestamp |

#### `quality_composite_scores`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `worker_id` | `UUID` | FK |
| `mcq_component` | `NUMERIC(5,2)` | 50% weighted MCQ score |
| `subjective_component` | `NUMERIC(5,2)` | 50% weighted subjective score |
| `composite_score` | `NUMERIC(5,2)` | Final score |
| `country_rank` | `INTEGER` | Rank within country |
| `global_rank` | `INTEGER` | Organisation-wide rank |
| `session_streak_days` | `INTEGER` | Consecutive days with completed session |
| `calculated_at` | `TIMESTAMPTZ` | Snapshot time |

---

### 14. MCQ assessment tables

#### `mcq_assessment_sets`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `title` | `VARCHAR(255)` | Assessment name |
| `category` | `VARCHAR(128)` | e.g. Technical, Compliance |
| `passing_score_pct` | `NUMERIC(5,2)` | Minimum pass threshold |
| `is_active` | `BOOLEAN` | Available for assignment |
| `created_by` | `UUID` | FK → admin_users |

#### `mcq_questions`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `assessment_set_id` | `UUID` | FK |
| `prompt` | `TEXT` | Question text |
| `options` | `JSONB` | Array of answer options |
| `correct_option_key` | `VARCHAR(8)` | Key of correct answer |
| `sort_order` | `INTEGER` | Display order |

#### `mcq_results`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `worker_id` | `UUID` | FK |
| `assessment_set_id` | `UUID` | FK |
| `score_pct` | `NUMERIC(5,2)` | Achieved score |
| `passed` | `BOOLEAN` | Met passing threshold |
| `completed_at` | `TIMESTAMPTZ` | Completion time |

#### `mcq_result_answers`

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `mcq_result_id` | `UUID` | FK |
| `question_id` | `UUID` | FK |
| `selected_option_key` | `VARCHAR(8)` | Worker's answer |
| `is_correct` | `BOOLEAN` | Graded result |

---

### 15. `audit_log` (append-only)

Every material action is permanently attributable.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PK | Log entry ID |
| `actor_id` | `UUID` | FK, NULL | Admin or worker user ID |
| `action` | `VARCHAR(64)` | NOT NULL | e.g. `CLAIM`, `FORCE_RELEASE`, `PAYROLL_APPROVE` |
| `target_type` | `VARCHAR(64)` | NOT NULL | e.g. `rdp_resource`, `session`, `worker` |
| `target_id` | `UUID` | NOT NULL | Entity affected |
| `previous_value` | `JSONB` | NULL | State before |
| `new_value` | `JSONB` | NULL | State after |
| `reason_note` | `TEXT` | NULL | Required for overrides |
| `ip_address` | `INET` | NULL | Client IP when available |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | Immutable timestamp |

**Rule:** No UPDATE or DELETE privileges on this table for application roles.

---

### 16. Supporting tables (post-MVP / charter appendix)

#### `session_tickets`

Worker-reported issues tied to a session for admin triage.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `session_id` | `UUID` | FK |
| `worker_id` | `UUID` | FK |
| `description` | `TEXT` | Issue detail |
| `status` | `ticket_status_enum` | `open`, `under_review`, `resolved` |
| `resolved_by` | `UUID` | FK, NULL |
| `created_at` | `TIMESTAMPTZ` | Submitted |

#### `knowledge_base_articles`

Admin-managed SOP and task guidance for workers.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID` | PK |
| `title` | `VARCHAR(255)` | Article title |
| `body` | `TEXT` | Markdown content |
| `version` | `INTEGER` | Version number |
| `published_at` | `TIMESTAMPTZ` | When live |
| `created_by` | `UUID` | FK → admin_users |

---

## Firebase real-time collections

Firebase is **not** the source of truth. FastAPI writes here after every PostgreSQL commit for live UI updates.

| Path | Document shape | Updated when |
| :--- | :--- | :--- |
| `/rdp_status/{rdp_id}` | `{ status, worker_id, updated_at }` | RDP state machine transition |
| `/active_sessions/{session_id}` | `{ worker_id, rdp_id, started_at, heartbeat_at }` | Session start, heartbeat, end |
| `/shift_notifications/{worker_id}/{notif_id}` | `{ type, title, body, read, created_at }` | Shift approved/rejected, RDP assigned |
| `/leaderboard/current_period` | `{ workers: [{ id, score, country_rank, global_rank, streak }], refreshed_at }` | Every 5 minutes |
| `/system_alerts/{alert_id}` | `{ type, severity, message, entity_ref, created_at }` | Machine offline, idle session, payroll exception |

---

## Redis keys

| Key pattern | Purpose | TTL |
| :--- | :--- | :--- |
| `lock:rdp:{rdp_id}` | Distributed claim lock | 30 seconds (renewed during claim txn) |
| `heartbeat:session:{session_id}` | Last heartbeat timestamp | Session duration + buffer |
| `rate:claim:{worker_id}` | Claim attempt rate limiting | 60 seconds |

---

## User roles → data access

| Role | PostgreSQL scope | Typical operations |
| :--- | :--- | :--- |
| **CEO / Leadership** | Global read; payroll export | Organisation command, financial reports, audit read |
| **Operations lead** | Global read/write ops | Shift approval, RDP assign/lock, force-release, quality ratings |
| **Country manager** | Country-scoped workers/sessions | View and limited admin within `country_scope` |
| **GS registered worker** | Own worker row + own sessions | Claim RDP, log GS RDP sessions, assessments, leaderboard |
| **Partner worker** | Own worker row + own sessions | Log multilog / third-party sessions, assessments, leaderboard |
| **Technical admin** | Infrastructure metadata only | RDP health config; no payroll or PII by default |

---

## Phase 0 deliverable checklist

| Item | Status in repo |
| :--- | :--- |
| Repository structure defined | ✅ `README.md` folder layout |
| Data model documented (this file) | ✅ `docs/data-models.md` |
| ERD produced | ✅ Mermaid diagrams above |
| User roles defined | ✅ Charter + `frontend/lib/auth/config.ts` (demo roles) |
| Wireframes for major screens | ✅ Implemented as Next.js pages under `frontend/app/` |
| Sprint plan for remaining 83 days | ⬜ To be added in `docs/phase-progress.md` |
| GlobalSolutions approval | ⬜ Pending review |

---

## Implementation notes

1. **Backend models not yet coded** — `backend/` is scaffolded in README; SQLAlchemy models in `backend/models/` are planned but not committed. This document is the build reference.
2. **Frontend uses mock data** — `frontend/lib/mock-data.ts` reflects the entities above for UI development ahead of API wiring.
3. **Migrations** — Alembic migrations will be generated from these definitions during Phase 1 Week 2.
4. **Charter amendments included** — Extended worker model, three session types, variable payroll percentages, 50/50 quality weighting, deferred WhatsApp, and Claude AI placeholder are all reflected in schema design.

---

*Prepared for GlobalSolutions Phase 0 — Requirements Lock. Confidential.*
