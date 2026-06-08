from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .partner import Partner
    from .shift import Shift
    from .session import WorkSession
    from .payroll import PayrollPeriod
    from .quality import QualityScore


class AuthRole(str, Enum):
    worker = "worker"
    admin = "admin"
    executive = "executive"


class WorkerBase(SQLModel):
    email: str = Field(max_length=255, unique=True, index=True)
    display_name: str = Field(max_length=120)
    auth_role: AuthRole = AuthRole.worker
    country: Optional[str] = Field(default=None, max_length=80)
    is_active: bool = True
    partner_id: Optional[UUID] = Field(default=None, foreign_key="partners.id")


class Worker(WorkerBase, table=True):
    __tablename__ = "workers"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    partner: Optional["Partner"] = Relationship(back_populates="workers")
    shifts: list["Shift"] = Relationship(back_populates="worker")
    sessions: list["WorkSession"] = Relationship(back_populates="worker")
    payroll_periods: list["PayrollPeriod"] = Relationship(back_populates="worker")
    quality_scores: list["QualityScore"] = Relationship(back_populates="worker")


class WorkerCreate(WorkerBase):
    password: str


class WorkerRead(WorkerBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class WorkerUpdate(SQLModel):
    display_name: Optional[str] = None
    country: Optional[str] = None
    is_active: Optional[bool] = None
    partner_id: Optional[UUID] = None
