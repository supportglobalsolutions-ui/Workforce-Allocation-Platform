from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .worker import Worker
    from .partner import Partner


class PayrollStatus(str, Enum):
    draft = "draft"
    calculated = "calculated"
    approved = "approved"
    paid = "paid"
    disputed = "disputed"


class PayrollPeriodBase(SQLModel):
    worker_id: UUID = Field(foreign_key="workers.id", index=True)
    partner_id: Optional[UUID] = Field(default=None, foreign_key="partners.id")
    period_start: datetime
    period_end: datetime
    gross_amount: float = Field(ge=0)
    commission_pct: float = Field(ge=0, le=100)
    net_amount: float = Field(ge=0)
    currency: str = Field(default="USD", max_length=3)
    status: PayrollStatus = PayrollStatus.draft


class PayrollPeriod(PayrollPeriodBase, table=True):
    __tablename__ = "payroll_periods"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    approved_by: Optional[UUID] = Field(default=None, foreign_key="workers.id")
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    worker: Optional["Worker"] = Relationship(
        back_populates="payroll_periods",
        sa_relationship_kwargs={"foreign_keys": "[PayrollPeriod.worker_id]"},
    )
    partner: Optional["Partner"] = Relationship(back_populates="payroll_periods")


class PayrollPeriodCreate(PayrollPeriodBase):
    pass


class PayrollPeriodRead(PayrollPeriodBase):
    id: UUID
    approved_by: Optional[UUID]
    approved_at: Optional[datetime]
    paid_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class PayrollPeriodUpdate(SQLModel):
    status: Optional[PayrollStatus] = None
    approved_by: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    notes: Optional[str] = None
