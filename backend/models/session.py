import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import (
    PayrollSessionEnum,
    PayrollSessionType,
    SessionCloseEnum,
    SessionCloseType,
    SessionTypeEnum,
    SessionTypeType,
)

if TYPE_CHECKING:
    from .allocation import Allocation
    from .partner import PartnerArrangement, PartnerEntity
    from .payroll import PayrollLineItem, PayrollPeriod
    from .post_mvp import SessionTicket
    from .quality import QualityIndicatorRating
    from .rdp_machine import RDPResource
    from .worker import Worker


class Session(SQLModel, table=True):
    """
    Unified session record for all three channel types:
      - gs_rdp:               uses allocation_id + rdp_resource_id
      - partner_multilog:     uses partner_entity_id + partner_arrangement_id
      - third_party_platform: type_specific_fields carries platform_name etc.
    """

    __tablename__ = "sessions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    session_type: SessionTypeEnum = Field(sa_column=Column(SessionTypeType, nullable=False))
    allocation_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("allocations.id"), nullable=True),
    )
    rdp_resource_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("rdp_resources.id"), nullable=True),
    )
    partner_entity_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=True),
    )
    partner_arrangement_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_arrangements.id"), nullable=True),
    )
    start_time: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    end_time: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    duration_minutes: Optional[int] = Field(
        default=None, sa_column=Column(Integer, nullable=True)
    )
    close_status: Optional[SessionCloseEnum] = Field(
        default=None, sa_column=Column(SessionCloseType, nullable=True)
    )
    payroll_approval_state: PayrollSessionEnum = Field(
        default=PayrollSessionEnum.pending,
        sa_column=Column(PayrollSessionType, nullable=False, server_default="pending"),
    )
    payroll_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=True),
    )
    admin_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    start_image_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    end_image_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    type_specific_fields: Optional[dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=False, server_default=text("'{}'")),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    worker: Optional["Worker"] = Relationship(back_populates="sessions")
    allocation: Optional["Allocation"] = Relationship(back_populates="session")
    rdp_resource: Optional["RDPResource"] = Relationship(
        back_populates="sessions",
        sa_relationship_kwargs={"foreign_keys": "[Session.rdp_resource_id]"},
    )
    partner_entity: Optional["PartnerEntity"] = Relationship(
        back_populates="sessions",
        sa_relationship_kwargs={"foreign_keys": "[Session.partner_entity_id]"},
    )
    partner_arrangement: Optional["PartnerArrangement"] = Relationship(
        back_populates="sessions",
        sa_relationship_kwargs={"foreign_keys": "[Session.partner_arrangement_id]"},
    )
    payroll_period: Optional["PayrollPeriod"] = Relationship(back_populates="sessions")
    payroll_line_items: list["PayrollLineItem"] = Relationship(back_populates="session")
    quality_ratings: list["QualityIndicatorRating"] = Relationship(back_populates="session")
    tickets: list["SessionTicket"] = Relationship(back_populates="session")
