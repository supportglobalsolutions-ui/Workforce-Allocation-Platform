import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import MachineHealthEnum, MachineHealthType, RdpStatusEnum, RdpStatusType

if TYPE_CHECKING:
    from .allocation import Allocation
    from .client import Client
    from .session import Session
    from .shift import Shift
    from .worker import Worker


class RDPResourceWorker(SQLModel, table=True):
    """Workers an admin has marked as allowed on a machine (claim-board visibility).

    Separate from ``RDPResource.assigned_worker_id``, which says who currently
    holds the seat. A machine may be offered to one or many workers.
    """

    __tablename__ = "rdp_resource_workers"

    rdp_resource_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("rdp_resources.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("workers.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class RDPClaimReservation(SQLModel, table=True):
    """Holds an RDP seat for a worker during a time window (claim schedules)."""

    __tablename__ = "rdp_claim_reservations"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    rdp_resource_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("rdp_resources.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("workers.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    starts_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    ends_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("admin_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    cancelled_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=True),
    )

    rdp_resource: Optional["RDPResource"] = Relationship(back_populates="claim_reservations")
    worker: Optional["Worker"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[RDPClaimReservation.worker_id]"},
    )


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
    # Independent of ownership. Health probes update this only.
    machine_health: MachineHealthEnum = Field(
        default=MachineHealthEnum.unknown,
        sa_column=Column(
            MachineHealthType,
            nullable=False,
            server_default=text("'unknown'"),
        ),
    )
    # Optimistic concurrency for status / assignment writes.
    version: int = Field(
        default=1,
        sa_column=Column(Integer, nullable=False, server_default=text("1")),
    )
    assigned_worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=True),
    )
    guacamole_connection_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    # RDP sign-in for this machine. The password is Fernet-encrypted at rest
    # (see core.crypto) and exists here so the Guacamole connection can be
    # rebuilt automatically on any host — a fresh VPS has an empty Guacamole
    # database, and without these an admin would have to retype every password.
    rdp_username: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    rdp_password_enc: Optional[str] = Field(
        default=None, sa_column=Column(Text, nullable=True)
    )
    rdp_domain: Optional[str] = Field(
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
    # Outlier-style shared daily pool (hours). Admin-configurable per machine.
    daily_limit_hours: Decimal = Field(
        default=Decimal("12"),
        sa_column=Column(Numeric(4, 2), nullable=False, server_default=text("12")),
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
    claim_reservations: list["RDPClaimReservation"] = Relationship(
        back_populates="rdp_resource",
    )
