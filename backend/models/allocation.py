import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import (
    AllocationLifecycleEnum,
    AllocationLifecycleType,
    ReleaseReasonEnum,
    ReleaseReasonType,
    TunnelStatusEnum,
    TunnelStatusType,
)

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
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("shifts.id"), nullable=True),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    rdp_resource_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("rdp_resources.id"), nullable=False, index=True),
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
    guacamole_active_connection_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    # Phase 7 — sticky media-plane placement. Reconnects prefer this gateway.
    gateway_id: Optional[str] = Field(
        default=None, sa_column=Column(String(64), nullable=True, index=True)
    )
    # Phase 4 ownership: late kills/tickets must carry generation and no-op if stale.
    connection_generation: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default=text("1")),
    )
    version: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default=text("1")),
    )
    allocation_status: AllocationLifecycleEnum = Field(
        default=AllocationLifecycleEnum.assigned,
        sa_column=Column(
            AllocationLifecycleType,
            nullable=False,
            server_default=text("'assigned'"),
        ),
    )
    tunnel_status: TunnelStatusEnum = Field(
        default=TunnelStatusEnum.none,
        sa_column=Column(
            TunnelStatusType,
            nullable=False,
            server_default=text("'none'"),
        ),
    )
    last_gateway_observation_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    # Phase 8 — why this allocation is held out of service, and since when.
    quarantined_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    quarantine_reason: Optional[str] = Field(
        default=None, sa_column=Column(String(300), nullable=True)
    )
    last_client_heartbeat_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    ended_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    shift: Optional["Shift"] = Relationship(back_populates="allocation")
    worker: Optional["Worker"] = Relationship(back_populates="allocations")
    rdp_resource: Optional["RDPResource"] = Relationship(back_populates="allocations")
    session: Optional["Session"] = Relationship(back_populates="allocation", sa_relationship_kwargs={"uselist": False})
