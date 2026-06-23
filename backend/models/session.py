import uuid
from sqlalchemy import Column, Integer, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .types import TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import SessionTypeType, SessionCloseType, PayrollSessionType
from .mixins import TimestampMixin


class Session(Base, TimestampMixin):
    """
    Unified session record for all three channel types:
      - gs_rdp:               uses allocation_id + rdp_resource_id; type_specific_fields carries
                              guacamole_connection_token, machine_health_at_start/end, last_heartbeat_at
      - partner_multilog:     uses partner_entity_id; fields carry multilog_client_name, partner_reference_id
      - third_party_platform: fields carry platform_name, task_or_batch_reference,
                              self_reported_duration_minutes, optional_reported_earnings
    """
    __tablename__ = "sessions"

    id                     = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id              = Column(UUID(as_uuid=True), ForeignKey("workers.id"),              nullable=False, index=True)
    session_type           = Column(SessionTypeType,    nullable=False)
    allocation_id          = Column(UUID(as_uuid=True), ForeignKey("allocations.id"),          nullable=True)
    rdp_resource_id        = Column(UUID(as_uuid=True), ForeignKey("rdp_resources.id"),        nullable=True)
    partner_entity_id      = Column(UUID(as_uuid=True), ForeignKey("partner_entities.id"),     nullable=True)
    partner_arrangement_id = Column(UUID(as_uuid=True), ForeignKey("partner_arrangements.id"), nullable=True)
    start_time             = Column(TIMESTAMPTZ, nullable=False)
    end_time               = Column(TIMESTAMPTZ, nullable=True)
    duration_minutes       = Column(Integer, nullable=True)
    close_status           = Column(SessionCloseType,   nullable=True)
    payroll_approval_state = Column(PayrollSessionType, nullable=False, server_default="pending")
    payroll_period_id      = Column(UUID(as_uuid=True), ForeignKey("payroll_periods.id"),      nullable=True)
    admin_notes            = Column(Text, nullable=True)
    type_specific_fields   = Column(JSONB, nullable=False, server_default="'{}'")

    # Relationships
    worker             = relationship("Worker",            back_populates="sessions")
    allocation         = relationship("Allocation",        back_populates="session")
    rdp_resource       = relationship("RDPResource",       back_populates="sessions",           foreign_keys=[rdp_resource_id])
    partner_entity     = relationship("PartnerEntity",     back_populates="sessions",           foreign_keys=[partner_entity_id])
    partner_arrangement = relationship("PartnerArrangement", back_populates="sessions",         foreign_keys=[partner_arrangement_id])
    payroll_period     = relationship("PayrollPeriod",     back_populates="sessions")
    payroll_line_items = relationship("PayrollLineItem",   back_populates="session")
    quality_ratings    = relationship("QualityIndicatorRating", back_populates="session")
    tickets            = relationship("SessionTicket",     back_populates="session")
