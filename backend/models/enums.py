"""
All PostgreSQL-native enums for the GlobalSolutions platform.
Python enums are used directly with SQLModel/SQLAlchemy sa_column definitions.
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


class MachineHealthEnum(str, enum.Enum):
    """Reachability only — never frees ownership by itself."""
    unknown     = "unknown"
    reachable   = "reachable"
    unreachable = "unreachable"


class AllocationLifecycleEnum(str, enum.Enum):
    """Durable lock state for an allocation row."""
    reserved    = "reserved"
    assigned    = "assigned"
    ending      = "ending"
    ended       = "ended"
    # Closure could not be confirmed within RDP_ENDING_ESCALATE_SECONDS, so the
    # machine is held out of service instead of being released to the next
    # worker on top of a tunnel that may still be live. Needs an admin repair
    # (Phase 8 Action 2) — it is the defined exit from "unknown", not a free.
    quarantined = "quarantined"


class TunnelStatusEnum(str, enum.Enum):
    """Browser ↔ Guacamole tunnel observation."""
    none          = "none"
    connecting    = "connecting"
    connected     = "connected"
    reconnecting  = "reconnecting"
    disconnected  = "disconnected"


# ── shifts ─────────────────────────────────────────────────────────────────────

class ShiftStatusEnum(str, enum.Enum):
    pending   = "pending"
    approved  = "approved"
    rejected  = "rejected"
    cancelled = "cancelled"


# ── absence_reports ────────────────────────────────────────────────────────────

class AbsenceReasonEnum(str, enum.Enum):
    illness          = "illness"
    family_emergency = "family_emergency"
    bereavement      = "bereavement"
    power_outage     = "power_outage"
    internet_outage  = "internet_outage"
    transport        = "transport"
    other            = "other"


class AbsenceStatusEnum(str, enum.Enum):
    pending   = "pending"
    accepted  = "accepted"
    declined  = "declined"
    # Worker cancelled their own report because the emergency resolved —
    # cheaper than an admin having to clear it.
    withdrawn = "withdrawn"


# ── allocations ────────────────────────────────────────────────────────────────

class ReleaseReasonEnum(str, enum.Enum):
    completed      = "completed"
    force_released = "force_released"
    abandoned      = "abandoned"
    timed_out      = "timed_out"


# ── sessions ───────────────────────────────────────────────────────────────────

class SessionTypeEnum(str, enum.Enum):
    gs_rdp               = "gs_rdp"
    partner_multilog     = "partner_multilog"
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


# ── payment_tiers ──────────────────────────────────────────────────────────────

class PaymentTierUnitEnum(str, enum.Enum):
    per_hour  = "per_hour"
    per_day   = "per_day"
    per_week  = "per_week"
    per_month = "per_month"
    per_task  = "per_task"


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


# ── task_assessments ──────────────────────────────────────────────────────────

class TaskResultStatusEnum(str, enum.Enum):
    pending     = "pending"
    in_progress = "in_progress"
    submitted   = "submitted"
    graded      = "graded"


# ── clients ────────────────────────────────────────────────────────────────────

class ClientContractStatusEnum(str, enum.Enum):
    active = "active"
    paused = "paused"
    ended  = "ended"


class ClientOwnerTypeEnum(str, enum.Enum):
    gs             = "gs"
    worker         = "worker"
    partner_entity = "partner_entity"


# ── wallets ────────────────────────────────────────────────────────────────────

class WalletTxTypeEnum(str, enum.Enum):
    payroll_credit = "payroll_credit"
    adjustment     = "adjustment"
    payout         = "payout"


# ── training ───────────────────────────────────────────────────────────────────

class TrainingProgressEnum(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed   = "completed"


# ── SQLAlchemy Enum type objects (used in sa_column definitions) ───────────────

AdminRoleType        = sa.Enum(AdminRoleEnum,          name="admin_role_enum",         create_type=True)
AccountStatusType    = sa.Enum(AccountStatusEnum,      name="account_status_enum",     create_type=True)
WorkerTypeType       = sa.Enum(WorkerTypeEnum,          name="worker_type_enum",        create_type=True)
WorkerStatusType     = sa.Enum(WorkerStatusEnum,        name="worker_status_enum",      create_type=True)
EntityStatusType     = sa.Enum(EntityStatusEnum,        name="entity_status_enum",      create_type=True)
RdpStatusType        = sa.Enum(RdpStatusEnum,           name="rdp_status_enum",         create_type=True)
MachineHealthType    = sa.Enum(MachineHealthEnum,       name="machine_health_enum",     create_type=True)
AllocationLifecycleType = sa.Enum(AllocationLifecycleEnum, name="allocation_lifecycle_enum", create_type=True)
TunnelStatusType     = sa.Enum(TunnelStatusEnum,        name="tunnel_status_enum",      create_type=True)
ShiftStatusType      = sa.Enum(ShiftStatusEnum,         name="shift_status_enum",       create_type=True)
ReleaseReasonType    = sa.Enum(ReleaseReasonEnum,       name="release_reason_enum",     create_type=True)
AbsenceReasonType    = sa.Enum(AbsenceReasonEnum,       name="absence_reason_enum",     create_type=True)
AbsenceStatusType    = sa.Enum(AbsenceStatusEnum,       name="absence_status_enum",     create_type=True)
SessionTypeType      = sa.Enum(SessionTypeEnum,         name="session_type_enum",       create_type=True)
SessionCloseType     = sa.Enum(SessionCloseEnum,        name="session_close_enum",      create_type=True)
PayrollSessionType   = sa.Enum(PayrollSessionEnum,      name="payroll_session_enum",    create_type=True)
RateTypeType         = sa.Enum(RateTypeEnum,            name="rate_type_enum",          create_type=True)
PaymentTierUnitType  = sa.Enum(PaymentTierUnitEnum,     name="payment_tier_unit_enum",  create_type=True)
PayrollPeriodStatus  = sa.Enum(PayrollPeriodStatusEnum, name="payroll_period_enum",     create_type=True)
IndicatorInputType   = sa.Enum(IndicatorInputEnum,      name="indicator_input_enum",    create_type=True)
TicketStatusType     = sa.Enum(TicketStatusEnum,        name="ticket_status_enum",      create_type=True)
TaskResultStatusType = sa.Enum(TaskResultStatusEnum,    name="task_result_status_enum", create_type=True)
ClientContractStatusType = sa.Enum(ClientContractStatusEnum, name="client_contract_status_enum", create_type=True)
ClientOwnerTypeType      = sa.Enum(ClientOwnerTypeEnum,      name="client_owner_type_enum",      create_type=True)
WalletTxTypeType         = sa.Enum(WalletTxTypeEnum,         name="wallet_tx_type_enum",         create_type=True)
TrainingProgressType     = sa.Enum(TrainingProgressEnum,     name="training_progress_enum",      create_type=True)
