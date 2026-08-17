import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class EmailJob(SQLModel, table=True):
    """
    A queued bulk send. The HTTP request only creates this row plus its items;
    the dispatcher loop does the sending, so a 1000-worker run cannot time out
    the request or be lost when the process restarts.
    """

    __tablename__ = "email_jobs"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    kind: str = Field(sa_column=Column(String(16), nullable=False))  # payslip | broadcast
    status: str = Field(
        default="queued",
        sa_column=Column(String(16), nullable=False, server_default="queued"),
    )  # queued | running | completed | cancelled
    subject: str = Field(sa_column=Column(String(255), nullable=False))
    # Broadcast message text. Payslip jobs render their body from the payroll
    # summary at send time, so this stays null for them.
    body: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # Attachments force one API call per recipient; HTML-only sends go 100 at a time.
    attach_pdf: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    payroll_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=True, index=True),
    )
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    total: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    sent: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    failed: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    skipped: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    started_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    finished_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))


class EmailJobItem(SQLModel, table=True):
    """
    One recipient of a job. Items are claimed in chunks with FOR UPDATE SKIP
    LOCKED, so several app workers can drain the same queue without overlapping.
    """

    __tablename__ = "email_job_items"
    __table_args__ = (
        UniqueConstraint("job_id", "worker_id", name="uq_email_job_item_job_worker"),
        Index("ix_email_job_items_status_job", "status", "job_id"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    job_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("email_jobs.id", ondelete="CASCADE"), nullable=False, index=True
        ),
    )
    worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=True),
    )
    payroll_worker_summary_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_worker_summaries.id"), nullable=True),
    )
    to_email: str = Field(sa_column=Column(String(255), nullable=False))
    status: str = Field(
        default="pending",
        sa_column=Column(String(16), nullable=False, server_default="pending"),
    )  # pending | claimed | sent | failed | skipped
    attempts: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    error: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    resend_id: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    claimed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    sent_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
