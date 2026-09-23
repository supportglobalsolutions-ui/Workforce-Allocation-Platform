import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import (
    AbsenceReasonEnum,
    AbsenceReasonType,
    AbsenceStatusEnum,
    AbsenceStatusType,
)

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .shift import Shift
    from .worker import Worker


#: Most files a worker may attach to one report.
MAX_ABSENCE_ATTACHMENTS = 3


class AbsenceReport(SQLModel, table=True):
    """A worker telling us ahead of time that they cannot work.

    Usually tied to one scheduled shift, but ``shift_id`` is nullable so a
    worker can also declare a date range before any shift exists ("I'm out all
    next week"). Evidence is optional — a genuine emergency rarely comes with
    a sick note attached — so only ``reason_text`` is required.
    """

    __tablename__ = "absence_reports"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    # Null for a standalone date-range absence not pinned to one shift.
    shift_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("shifts.id"), nullable=True, index=True),
    )
    absence_start: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    absence_end: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    reason_category: AbsenceReasonEnum = Field(sa_column=Column(AbsenceReasonType, nullable=False))
    reason_text: str = Field(sa_column=Column(Text, nullable=False))
    # Supabase object paths in the private absence-evidence bucket, never URLs
    # — same storage contract as session screenshots.
    attachment_paths: list[str] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    status: AbsenceStatusEnum = Field(
        default=AbsenceStatusEnum.pending,
        sa_column=Column(AbsenceStatusType, nullable=False, server_default="pending"),
    )
    reviewed_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    reviewed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    #: Shown to the worker with the decision — required when declining.
    admin_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    worker: Optional["Worker"] = Relationship(
        back_populates="absence_reports",
        sa_relationship_kwargs={"foreign_keys": "[AbsenceReport.worker_id]"},
    )
    shift: Optional["Shift"] = Relationship(
        back_populates="absence_reports",
        sa_relationship_kwargs={"foreign_keys": "[AbsenceReport.shift_id]"},
    )
    reviewer: Optional["AdminUser"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[AbsenceReport.reviewed_by]"},
    )
