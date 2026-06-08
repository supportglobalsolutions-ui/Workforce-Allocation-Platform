from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .partner import Partner
    from .worker import Worker
    from .shift import Shift
    from .session import WorkSession


class RDPStatus(str, Enum):
    available = "available"
    claimed = "claimed"
    active = "active"
    idle = "idle"
    maintenance = "maintenance"
    offline = "offline"
    reserved = "reserved"
    decommissioned = "decommissioned"


class RDPMachineBase(SQLModel):
    hostname: str = Field(max_length=120, unique=True, index=True)
    ip_address: str = Field(max_length=45)
    status: RDPStatus = RDPStatus.available
    partner_id: Optional[UUID] = Field(default=None, foreign_key="partners.id")
    current_worker_id: Optional[UUID] = Field(default=None, foreign_key="workers.id")


class RDPMachine(RDPMachineBase, table=True):
    __tablename__ = "rdp_machines"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    last_heartbeat: Optional[datetime] = None
    specs: Optional[dict[str, Any]] = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    partner: Optional["Partner"] = Relationship(back_populates="rdp_machines")
    shifts: list["Shift"] = Relationship(back_populates="rdp_machine")
    sessions: list["WorkSession"] = Relationship(back_populates="rdp_machine")


class RDPMachineCreate(RDPMachineBase):
    specs: Optional[dict[str, Any]] = None


class RDPMachineRead(RDPMachineBase):
    id: UUID
    last_heartbeat: Optional[datetime]
    specs: Optional[dict[str, Any]]
    created_at: datetime


class RDPMachineUpdate(SQLModel):
    status: Optional[RDPStatus] = None
    current_worker_id: Optional[UUID] = None
    last_heartbeat: Optional[datetime] = None
    specs: Optional[dict[str, Any]] = None
