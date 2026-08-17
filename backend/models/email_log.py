import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, SQLModel


class EmailLog(SQLModel, table=True):
    """
    Permanent history of every email the platform sends.

    One row per recipient per send attempt. `status` is our own outcome at
    hand-off (did Resend accept it), while `last_event` is what the provider
    later reported actually happened — delivered, bounced, complained, opened.
    Those two answer different questions and neither replaces the other.
    """

    __tablename__ = "email_log"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    to_email: str = Field(sa_column=Column(String(255), nullable=False))
    from_email: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    subject: str = Field(sa_column=Column(String(255), nullable=False))
    template: str = Field(sa_column=Column(String(32), nullable=False))  # payslip | broadcast | notification
    status: str = Field(sa_column=Column(String(16), nullable=False))  # sent | failed
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    # Provider trace. resend_id is the message id used to pull delivery events,
    # either pushed by the Resend webhook or polled on demand.
    resend_id: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True, index=True))
    last_event: Optional[str] = Field(default=None, sa_column=Column(String(32), nullable=True))
    last_event_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    provider_checked_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    # Append-only [{"type": "delivered", "at": "..."}] timeline, newest last.
    events: Optional[list[dict[str, Any]]] = Field(default=None, sa_column=Column(JSONB, nullable=True))

    email_job_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("email_jobs.id"), nullable=True, index=True),
    )
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
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False, index=True),
    )
