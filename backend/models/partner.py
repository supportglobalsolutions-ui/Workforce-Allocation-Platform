from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .worker import Worker
    from .rdp_machine import RDPMachine
    from .payroll import PayrollPeriod


class PartnerBase(SQLModel):
    name: str = Field(max_length=120, index=True)
    country: str = Field(max_length=80)
    commission_pct: float = Field(ge=0.0, le=100.0, default=0.0)
    is_active: bool = True


class Partner(PartnerBase, table=True):
    __tablename__ = "partners"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    workers: list["Worker"] = Relationship(back_populates="partner")
    rdp_machines: list["RDPMachine"] = Relationship(back_populates="partner")
    payroll_periods: list["PayrollPeriod"] = Relationship(back_populates="partner")


class PartnerCreate(PartnerBase):
    pass


class PartnerRead(PartnerBase):
    id: UUID
    created_at: datetime


class PartnerUpdate(SQLModel):
    name: Optional[str] = None
    country: Optional[str] = None
    commission_pct: Optional[float] = None
    is_active: Optional[bool] = None
