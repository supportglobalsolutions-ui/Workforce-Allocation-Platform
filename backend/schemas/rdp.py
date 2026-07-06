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
    status:                  RdpStatusEnum
    assigned_worker_id:      Optional[UUID] = None
    guacamole_connection_id: Optional[str]  = None
    health_notes:            Optional[str]  = None
    risk_flags:              list[Any]      = []
    monitor_host:            Optional[str]    = None
    monitor_port:            Optional[int]    = 3389


class RDPResourceCreate(RDPResourceBase):
    pass


class RDPResourceUpdate(SQLModel):
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


class RdpForceReleaseBody(SQLModel):
    reason: str
