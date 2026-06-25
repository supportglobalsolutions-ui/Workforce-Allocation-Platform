from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import ReleaseReasonEnum, ReleaseReasonType

if TYPE_CHECKING:
    from .rdp_machine import RDPResource
    from .session import Session
    from .shift import Shift
    from .worker import Worker


class Allocation(SQLModel, table=True):
    """
    Atomic RDP claim record. The partial unique index enforces double-claim
    prevention: only one open (released_at IS NULL) allocation per RDP resource.
    """

    __tablename__ = "allocations"
    __table_args__ = (
        Index(
            "uq_allocations_active_rdp",
            "rdp_resource_id",
            unique=True,
            postgresql_where=text("released_at IS NULL"),
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    shift_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True),
        foreign_key="shifts.id",
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
        foreign_key="workers.id",
    )
    rdp_resource_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
        foreign_key="rdp_resources.id",
    )
    claimed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )
    released_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    release_reason: Optional[ReleaseReasonEnum] = Field(
        default=None, sa_column=Column(ReleaseReasonType, nullable=True)
    )
    guacamole_token: Optional[str] = Field(
        default=None, sa_column=Column(String(512), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    shift: Optional[Shift] = Relationship(back_populates="allocation")
    worker: Optional[Worker] = Relationship(back_populates="allocations")
    rdp_resource: Optional[RDPResource] = Relationship(back_populates="allocations")
    session: Optional[Session] = Relationship(back_populates="allocation", uselist=False)
