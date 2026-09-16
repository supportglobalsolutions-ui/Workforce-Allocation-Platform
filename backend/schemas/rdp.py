from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import RdpStatusEnum


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
    pass


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


class RDPResourceResponse(RDPResourceBase):
    model_config = ConfigDict(from_attributes=True)

    id:                   UUID
    last_health_check_at: Optional[datetime]
    status_changed_at:    datetime
    assigned_worker_name: Optional[str] = None
    client_name:          Optional[str] = None
    owner_name:           Optional[str] = None
    owner_type:           Optional[str] = None


class RdpForceReleaseBody(SQLModel):
    reason: str


class RdpProvisionBody(GuacamoleCredentials):
    """Explicit (re)provision request for an existing machine."""

    auto_provision: bool = True


class RdpProvisionResult(SQLModel):
    rdp_resource_id:         str
    guacamole_connection_id: Optional[str] = None
    created:                 bool = False
    provisioned:             bool = False
    error:                   Optional[str] = None


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
