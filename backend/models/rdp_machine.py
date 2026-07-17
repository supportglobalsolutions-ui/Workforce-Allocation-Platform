import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import RdpStatusEnum, RdpStatusType

if TYPE_CHECKING:
    from .allocation import Allocation
    from .client import Client
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
    # The client account this RDP works on (traceability: client + account + worker).
    client_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id"), nullable=True),
    )
    status: RdpStatusEnum = Field(sa_column=Column(RdpStatusType, nullable=False))
    assigned_worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=True),
    )
    guacamole_connection_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    health_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    risk_flags: list[Any] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    last_health_check_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    monitor_host: Optional[str] = Field(
        default=None, sa_column=Column(String(255), nullable=True)
    )
    monitor_port: Optional[int] = Field(
        default=3389, sa_column=Column(Integer, nullable=True)
    )
    status_changed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    # Relationships
    assigned_worker: Optional["Worker"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RDPResource.assigned_worker_id]"}
    )
    client: Optional["Client"] = Relationship(
        back_populates="rdp_resources",
        sa_relationship_kwargs={"foreign_keys": "[RDPResource.client_id]"},
    )
    shifts: list["Shift"] = Relationship(
        back_populates="rdp_resource",
        sa_relationship_kwargs={"foreign_keys": "[Shift.rdp_resource_id]"},
    )
    allocations: list["Allocation"] = Relationship(back_populates="rdp_resource")
    sessions: list["Session"] = Relationship(
        back_populates="rdp_resource",
        sa_relationship_kwargs={"foreign_keys": "[Session.rdp_resource_id]"},
    )
