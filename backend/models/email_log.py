import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class EmailLog(SQLModel, table=True):
    """Delivery log for all Resend emails (payslips + broadcasts)."""

    __tablename__ = "email_log"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    to_email: str = Field(sa_column=Column(String(255), nullable=False))
    subject: str = Field(sa_column=Column(String(255), nullable=False))
    template: str = Field(sa_column=Column(String(32), nullable=False))  # payslip | broadcast
    status: str = Field(sa_column=Column(String(16), nullable=False))  # sent | failed
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    payroll_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=True),
    )
    worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
