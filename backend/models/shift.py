from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import ShiftStatusEnum, ShiftStatusType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .allocation import Allocation
    from .rdp_machine import RDPResource
    from .worker import Worker


class Shift(SQLModel, table=True):
    __tablename__ = "shifts"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
        foreign_key="workers.id",
    )
    rdp_resource_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True),
        foreign_key="rdp_resources.id",
    )
    scheduled_start: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    scheduled_end: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    status: ShiftStatusEnum = Field(sa_column=Column(ShiftStatusType, nullable=False))
    approved_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True),
        foreign_key="admin_users.id",
    )
    approved_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    rejection_reason: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    worker: Optional[Worker] = Relationship(
        back_populates="shifts",
        sa_relationship_kwargs={"foreign_keys": "[Shift.worker_id]"},
    )
    rdp_resource: Optional[RDPResource] = Relationship(
        back_populates="shifts",
        sa_relationship_kwargs={"foreign_keys": "[Shift.rdp_resource_id]"},
    )
    approver: Optional[AdminUser] = Relationship(
        back_populates="approved_shifts",
        sa_relationship_kwargs={"foreign_keys": "[Shift.approved_by]"},
    )
    allocation: Optional[Allocation] = Relationship(back_populates="shift", uselist=False)
