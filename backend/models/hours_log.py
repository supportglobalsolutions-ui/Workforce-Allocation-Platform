"""
Monthly Hours Log: one row per worker per desktop per working month.

The one source for paid hours. Rows are filled from session screenshot times;
an admin can overwrite any row, and an overwritten row is never refreshed from
sessions again. A null desktop is the "No desktop" row (partner or
third-party work).
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class HoursLogEntry(SQLModel, table=True):
    __tablename__ = "hours_log"
    __table_args__ = (
        CheckConstraint("hours >= 0", name="ck_hours_log_hours_non_negative"),
        Index(
            "uq_hours_log_period_worker_rdp",
            "payroll_period_id", "worker_id", "rdp_resource_id",
            unique=True,
            postgresql_where=text("rdp_resource_id IS NOT NULL"),
        ),
        Index(
            "uq_hours_log_period_worker_no_rdp",
            "payroll_period_id", "worker_id",
            unique=True,
            postgresql_where=text("rdp_resource_id IS NULL"),
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    rdp_resource_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("rdp_resources.id", ondelete="SET NULL"), nullable=True, index=True,
        ),
    )
    hours: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(8, 2), nullable=False, server_default="0"))
    # What the sessions add up to, kept next to a manual figure for comparison.
    session_hours: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(8, 2), nullable=False, server_default="0"),
    )
    is_manual: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    updated_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
