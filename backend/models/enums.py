"""
All PostgreSQL-native enums for the GlobalSolutions platform.
Each Python enum is paired with a SQLAlchemy Enum type for use in Column definitions.
"""
import enum
import sqlalchemy as sa


# ── admin_users ────────────────────────────────────────────────────────────────

class AdminRoleEnum(str, enum.Enum):
    ceo_leadership   = "ceo_leadership"
    operations_lead  = "operations_lead"
    country_manager  = "country_manager"
    technical_admin  = "technical_admin"


class AccountStatusEnum(str, enum.Enum):
    active      = "active"
    deactivated = "deactivated"


# ── workers ────────────────────────────────────────────────────────────────────

class WorkerTypeEnum(str, enum.Enum):
    gs_registered  = "gs_registered"
    partner_worker = "partner_worker"


class WorkerStatusEnum(str, enum.Enum):
    active    = "active"
    inactive  = "inactive"
    suspended = "suspended"


# ── partner_entities ───────────────────────────────────────────────────────────

class EntityStatusEnum(str, enum.Enum):
    active   = "active"
    inactive = "inactive"


# ── rdp_resources ──────────────────────────────────────────────────────────────

class RdpStatusEnum(str, enum.Enum):
    offline      = "offline"
    online_free  = "online_free"
    assigned     = "assigned"
    active       = "active"
    idle         = "idle"
    unhealthy    = "unhealthy"
    admin_locked = "admin_locked"
    maintenance  = "maintenance"


# ── shifts ─────────────────────────────────────────────────────────────────────

class ShiftStatusEnum(str, enum.Enum):
    pending   = "pending"
    approved  = "approved"
    rejected  = "rejected"
    cancelled = "cancelled"


# ── allocations ────────────────────────────────────────────────────────────────

class ReleaseReasonEnum(str, enum.Enum):
    completed          = "completed"
    force_released     = "force_released"
    abandoned          = "abandoned"
    timed_out          = "timed_out"


# ── sessions ───────────────────────────────────────────────────────────────────

class SessionTypeEnum(str, enum.Enum):
    gs_rdp              = "gs_rdp"
    partner_multilog    = "partner_multilog"
    third_party_platform = "third_party_platform"


class SessionCloseEnum(str, enum.Enum):
    completed      = "completed"
    force_released = "force_released"
    abandoned      = "abandoned"
    timed_out      = "timed_out"


class PayrollSessionEnum(str, enum.Enum):
    pending  = "pending"
    approved = "approved"
    flagged  = "flagged"
    excluded = "excluded"


# ── rate_table_entries ─────────────────────────────────────────────────────────

class RateTypeEnum(str, enum.Enum):
    hourly   = "hourly"
    per_task = "per_task"


# ── payroll_periods ────────────────────────────────────────────────────────────

class PayrollPeriodStatusEnum(str, enum.Enum):
    open       = "open"
    calculated = "calculated"
    approved   = "approved"
    paid       = "paid"


# ── quality_indicators ─────────────────────────────────────────────────────────

class IndicatorInputEnum(str, enum.Enum):
    auto   = "auto"
    manual = "manual"


# ── session_tickets (post-MVP) ─────────────────────────────────────────────────

class TicketStatusEnum(str, enum.Enum):
    open         = "open"
    under_review = "under_review"
    resolved     = "resolved"


# ── SQLAlchemy Enum type objects ───────────────────────────────────────────────
# Reuse these in Column() definitions to avoid re-declaring names.

AdminRoleType        = sa.Enum(AdminRoleEnum,        name="admin_role_enum",         create_type=True)
AccountStatusType    = sa.Enum(AccountStatusEnum,    name="account_status_enum",     create_type=True)
WorkerTypeType       = sa.Enum(WorkerTypeEnum,        name="worker_type_enum",        create_type=True)
WorkerStatusType     = sa.Enum(WorkerStatusEnum,      name="worker_status_enum",      create_type=True)
EntityStatusType     = sa.Enum(EntityStatusEnum,      name="entity_status_enum",      create_type=True)
RdpStatusType        = sa.Enum(RdpStatusEnum,         name="rdp_status_enum",         create_type=True)
ShiftStatusType      = sa.Enum(ShiftStatusEnum,       name="shift_status_enum",       create_type=True)
ReleaseReasonType    = sa.Enum(ReleaseReasonEnum,     name="release_reason_enum",     create_type=True)
SessionTypeType      = sa.Enum(SessionTypeEnum,       name="session_type_enum",       create_type=True)
SessionCloseType     = sa.Enum(SessionCloseEnum,      name="session_close_enum",      create_type=True)
PayrollSessionType   = sa.Enum(PayrollSessionEnum,    name="payroll_session_enum",    create_type=True)
RateTypeType         = sa.Enum(RateTypeEnum,          name="rate_type_enum",          create_type=True)
PayrollPeriodStatus  = sa.Enum(PayrollPeriodStatusEnum, name="payroll_period_enum",   create_type=True)
IndicatorInputType   = sa.Enum(IndicatorInputEnum,    name="indicator_input_enum",    create_type=True)
TicketStatusType     = sa.Enum(TicketStatusEnum,      name="ticket_status_enum",      create_type=True)
