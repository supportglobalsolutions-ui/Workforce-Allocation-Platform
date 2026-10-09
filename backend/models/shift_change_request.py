"""
A worker's request to change or delete a shift that has already been approved.

Pending shifts are edited or cancelled directly; once approved, the worker has
to ask, and an admin approves or rejects. At most one pending request exists
per shift (a partial unique index enforces it).
"""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

SHIFT_REQUEST_KINDS = ("edit", "delete")
SHIFT_REQUEST_STATUSES = ("pending", "approved", "rejected", "cancelled")


class ShiftChangeRequest(SQLModel, table=True):
    __tablename__ = "shift_change_requests"
    __table_args__ = (
        CheckConstraint("kind IN ('edit', 'delete')", name="ck_shift_change_requests_kind"),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'cancelled')",
            name="ck_shift_change_requests_status",
        ),
        CheckConstraint(
            "kind = 'delete' OR (new_start IS NOT NULL AND new_end IS NOT NULL AND new_end > new_start)",
            name="ck_shift_change_requests_edit_times",
        ),
        Index(
            "uq_shift_change_requests_one_pending",
            "shift_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    shift_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    kind: str = Field(sa_column=Column(String(16), nullable=False))
    old_start: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    old_end: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    new_start: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    new_end: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    reason: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    status: str = Field(default="pending", sa_column=Column(String(16), nullable=False, server_default="pending"))
    reviewed_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
    )
    reviewed_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    admin_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
