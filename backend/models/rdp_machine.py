from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, DateTime, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import RdpStatusEnum, RdpStatusType

if TYPE_CHECKING:
    from .allocation import Allocation
    from .session import Session
    from .shift import Shift
    from .worker import Worker


class RDPResource(SQLModel, table=True):
    __tablename__ = "rdp_resources"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    nickname: str = Field(sa_column=Column(String(64), unique=True, nullable=False))
    country: str = Field(sa_column=Column(String(64), nullable=False))
    client_group: str = Field(sa_column=Column(String(128), nullable=False))
    status: RdpStatusEnum = Field(sa_column=Column(RdpStatusType, nullable=False))
    assigned_worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True),
        foreign_key="workers.id",
    )
    guacamole_connection_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    health_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    risk_flags: Optional[list[Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    last_health_check_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    status_changed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    # Relationships
    assigned_worker: Optional[Worker] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RDPResource.assigned_worker_id]"}
    )
    shifts: list[Shift] = Relationship(
        back_populates="rdp_resource",
        sa_relationship_kwargs={"foreign_keys": "[Shift.rdp_resource_id]"},
    )
    allocations: list[Allocation] = Relationship(back_populates="rdp_resource")
    sessions: list[Session] = Relationship(
        back_populates="rdp_resource",
        sa_relationship_kwargs={"foreign_keys": "[Session.rdp_resource_id]"},
    )
