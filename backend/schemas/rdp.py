from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import RdpStatusEnum

#: Admin may set any Outlier-style budget in this range (hours).
DAILY_LIMIT_HOURS_MIN = Decimal("0.5")
DAILY_LIMIT_HOURS_MAX = Decimal("24")


def validate_daily_limit_hours(value: Decimal | float | int | str) -> Decimal:
    hours = Decimal(str(value))
    if hours < DAILY_LIMIT_HOURS_MIN or hours > DAILY_LIMIT_HOURS_MAX:
        raise ValueError(
            f"daily_limit_hours must be between {DAILY_LIMIT_HOURS_MIN} and {DAILY_LIMIT_HOURS_MAX}"
        )
    return hours.quantize(Decimal("0.01"))


class RDPResourceBase(SQLModel):
    nickname:                str
    country:                 str
    client_group:            str
    client_id:               Optional[UUID] = None
    status:                  RdpStatusEnum
    assigned_worker_id:      Optional[UUID] = None
    guacamole_connection_id: Optional[str]  = None
    health_notes:            Optional[str]  = None
    risk_flags:              list[Any]      = []
    monitor_host:            Optional[str]    = None
    monitor_port:            Optional[int]    = 3389
    daily_limit_hours:       Decimal = Decimal("12")

    @field_validator("daily_limit_hours", mode="before")
    @classmethod
    def _limit_hours(cls, v):  # noqa: N805
        if v is None:
            return Decimal("12")
        return validate_daily_limit_hours(v)


class GuacamoleCredentials(SQLModel):
    """
    Write-only RDP credentials. Forwarded to Guacamole when provisioning the
    connection; never stored in the app DB and never returned by the API.
    """

    rdp_username: Optional[str] = None
    rdp_password: Optional[str] = None
    rdp_domain:   Optional[str] = None
    # Set false to manage the Guacamole connection by hand.
    auto_provision: bool = True


CREDENTIAL_FIELDS = set(GuacamoleCredentials.model_fields)


class RDPResourceCreate(RDPResourceBase, GuacamoleCredentials):
    # Workers allowed to see and claim this machine on the claim board.
    allowed_worker_ids: Optional[list[UUID]] = None


class RDPResourceUpdate(GuacamoleCredentials):
    nickname:                Optional[str]           = None
    country:                 Optional[str]           = None
    client_group:            Optional[str]           = None
    client_id:               Optional[UUID]          = None
    status:                  Optional[RdpStatusEnum] = None
    assigned_worker_id:      Optional[UUID]          = None
    guacamole_connection_id: Optional[str]           = None
    health_notes:            Optional[str]           = None
    risk_flags:              Optional[list[Any]]     = None
    monitor_host:            Optional[str]           = None
    monitor_port:            Optional[int]           = None
    daily_limit_hours:       Optional[Decimal]       = None
    # Replaces the machine's audience wholesale. None leaves it untouched.
    allowed_worker_ids:      Optional[list[UUID]]    = None

    @field_validator("daily_limit_hours", mode="before")
    @classmethod
    def _limit_hours(cls, v):  # noqa: N805
        if v is None:
            return None
        return validate_daily_limit_hours(v)


class RdpAllowedWorker(SQLModel):
    """Name badge for a worker on a machine's claim-board audience."""

    id:   UUID
    name: str


class RDPResourceResponse(RDPResourceBase):
    model_config = ConfigDict(from_attributes=True)

    id:                   UUID
    last_health_check_at: Optional[datetime]
    status_changed_at:    datetime
    assigned_worker_name: Optional[str] = None
    client_name:          Optional[str] = None
    owner_name:           Optional[str] = None
    owner_type:           Optional[str] = None
    # Admin card display — password never returned, only whether one is stored.
    rdp_username:         Optional[str] = None
    has_rdp_password:     bool = False
    # Admin-only: who this machine is offered to on the claim board.
    allowed_worker_ids:   list[UUID] = []
    allowed_workers:      list[RdpAllowedWorker] = []
    # Outlier-style day budget (reported on-image time in the current EAT window).
    used_minutes_today:      int = 0
    remaining_minutes_today: int = 0
    window_starts_at:        Optional[datetime] = None
    window_ends_at:          Optional[datetime] = None
    # Active reservation locking this machine right now (if any).
    reserved_for_worker_id:   Optional[UUID] = None
    reserved_for_worker_name: Optional[str] = None
    reservation_ends_at:      Optional[datetime] = None


class RdpForceReleaseBody(SQLModel):
    reason: Optional[str] = None


class RdpProvisionBody(GuacamoleCredentials):
    """Explicit (re)provision request for an existing machine."""

    auto_provision: bool = True


class RdpProvisionResult(SQLModel):
    rdp_resource_id:         str
    guacamole_connection_id: Optional[str] = None
    created:                 bool = False
    provisioned:             bool = False
    error:                   Optional[str] = None


class RdpClaimReservationCreate(SQLModel):
    worker_id: UUID
    starts_at: datetime
    ends_at: datetime


class RdpClaimReservationResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rdp_resource_id: UUID
    worker_id: UUID
    worker_name: Optional[str] = None
    rdp_nickname: Optional[str] = None
    starts_at: datetime
    ends_at: datetime
    created_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None


class RdpJoinTicket(SQLModel):
    """
    Everything the browser needs to open the canvas on `guac.` by itself.

    `mode` is the rollout switch. `proxy` means this caller stays on the
    legacy FastAPI ws-tunnel and every other field is null — the viewer
    branches on it rather than treating a disabled gateway as an error.

    `auth_data` is the encrypted guacamole-auth-json blob. It contains the
    machine's RDP credentials, but only Guacamole holds the key, so handing it
    to the browser reveals nothing — and it grants exactly one connection.
    """

    mode:            str  # "direct" | "proxy"
    ticket:          Optional[str] = None
    auth_data:       Optional[str] = None
    guacamole_url:   Optional[str] = None
    gateway_id:      Optional[str] = None
    data_source:     Optional[str] = None
    connection_name: Optional[str] = None
    generation:      Optional[int] = None
    expires_in:      Optional[int] = None
    # Seconds after which the viewer should quietly mint a fresh token. Kept
    # well inside the blob's own lifetime so a long shift never hits an
    # expired session and remounts the canvas.
    refresh_in:      Optional[int] = None
    reason:          Optional[str] = None
