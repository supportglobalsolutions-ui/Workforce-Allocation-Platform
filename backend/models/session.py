from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .worker import Worker
    from .rdp_machine import RDPMachine


class SessionType(str, Enum):
    gs_rdp = "gs_rdp"
    partner_channel = "partner_channel"
    third_party = "third_party"


class SessionStatus(str, Enum):
    active = "active"
    paused = "paused"
    completed = "completed"
    abandoned = "abandoned"


class WorkSessionBase(SQLModel):
    worker_id: UUID = Field(foreign_key="workers.id", index=True)
    rdp_machine_id: Optional[UUID] = Field(default=None, foreign_key="rdp_machines.id")
    session_type: SessionType
    status: SessionStatus = SessionStatus.active
    currency: str = Field(default="USD", max_length=3)


class WorkSession(WorkSessionBase, table=True):
    __tablename__ = "sessions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ended_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    earnings_amount: Optional[float] = Field(default=None, ge=0)
    metadata: Optional[dict[str, Any]] = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    worker: Optional["Worker"] = Relationship(back_populates="sessions")
    rdp_machine: Optional["RDPMachine"] = Relationship(back_populates="sessions")


class WorkSessionCreate(WorkSessionBase):
    metadata: Optional[dict[str, Any]] = None


class WorkSessionRead(WorkSessionBase):
    id: UUID
    started_at: datetime
    ended_at: Optional[datetime]
    duration_minutes: Optional[int]
    earnings_amount: Optional[float]
    metadata: Optional[dict[str, Any]]
    created_at: datetime


class WorkSessionUpdate(SQLModel):
    status: Optional[SessionStatus] = None
    ended_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    earnings_amount: Optional[float] = None
    metadata: Optional[dict[str, Any]] = None
