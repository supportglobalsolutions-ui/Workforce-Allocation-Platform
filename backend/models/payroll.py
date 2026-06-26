import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Numeric, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import PayrollPeriodStatus, PayrollPeriodStatusEnum, SessionTypeType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .session import Session
    from .worker import Worker


class PayrollPeriod(SQLModel, table=True):
    __tablename__ = "payroll_periods"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    label: str = Field(sa_column=Column(String(64), nullable=False))
    start_date: date = Field(sa_column=Column(Date, nullable=False))
    end_date: date = Field(sa_column=Column(Date, nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    status: PayrollPeriodStatusEnum = Field(sa_column=Column(PayrollPeriodStatus, nullable=False))
    approved_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    export_generated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    approver: Optional["AdminUser"] = Relationship(
        back_populates="approved_payroll",
        sa_relationship_kwargs={"foreign_keys": "[PayrollPeriod.approved_by]"},
    )
    sessions: list["Session"] = Relationship(back_populates="payroll_period")
    line_items: list["PayrollLineItem"] = Relationship(back_populates="payroll_period")


class PayrollLineItem(SQLModel, table=True):
    __tablename__ = "payroll_line_items"
    __table_args__ = (
        CheckConstraint(
            "worker_pct + gs_pct + partner_pct = 100.00",
            name="ck_payroll_line_items_splits_sum",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=False, index=True),
    )
    session_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    session_type: str = Field(sa_column=Column(SessionTypeType, nullable=False))
    gross_amount: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    worker_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    gs_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    partner_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    worker_net: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    gs_net: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    partner_net: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    exception_flags: Optional[list[Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    payroll_period: Optional["PayrollPeriod"] = Relationship(back_populates="line_items")
    session: Optional["Session"] = Relationship(back_populates="payroll_line_items")
    worker: Optional["Worker"] = Relationship(back_populates="payroll_line_items")
