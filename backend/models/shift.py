from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .worker import Worker
    from .rdp_machine import RDPMachine


class ShiftStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class ShiftBase(SQLModel):
    worker_id: UUID = Field(foreign_key="workers.id", index=True)
    rdp_machine_id: Optional[UUID] = Field(default=None, foreign_key="rdp_machines.id")
    status: ShiftStatus = ShiftStatus.pending
    scheduled_start: datetime
    scheduled_end: datetime
    notes: Optional[str] = Field(default=None, max_length=500)


class Shift(ShiftBase, table=True):
    __tablename__ = "shifts"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    approved_by: Optional[UUID] = Field(default=None, foreign_key="workers.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    worker: Optional["Worker"] = Relationship(
        back_populates="shifts",
        sa_relationship_kwargs={"foreign_keys": "[Shift.worker_id]"},
    )
    rdp_machine: Optional["RDPMachine"] = Relationship(back_populates="shifts")


class ShiftCreate(ShiftBase):
    pass


class ShiftRead(ShiftBase):
    id: UUID
    actual_start: Optional[datetime]
    actual_end: Optional[datetime]
    approved_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime


class ShiftUpdate(SQLModel):
    status: Optional[ShiftStatus] = None
    rdp_machine_id: Optional[UUID] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    approved_by: Optional[UUID] = None
    notes: Optional[str] = None
