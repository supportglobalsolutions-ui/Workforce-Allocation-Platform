import uuid
from sqlalchemy import Column, String, Text, Numeric, Date, ForeignKey, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base
from .enums import EntityStatusType
from .mixins import CreatedAtMixin


class PartnerEntity(Base, CreatedAtMixin):
    __tablename__ = "partner_entities"

    id     = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    name   = Column(String(255), unique=True, nullable=False)
    notes  = Column(Text, nullable=True)
    status = Column(EntityStatusType, nullable=False)

    arrangements = relationship("PartnerArrangement", back_populates="partner_entity")
    workers      = relationship("Worker",             back_populates="partner_entity")
    sessions     = relationship("Session",            back_populates="partner_entity", foreign_keys="Session.partner_entity_id")


class PartnerArrangement(Base):
    __tablename__ = "partner_arrangements"
    __table_args__ = (
        CheckConstraint("worker_pct + gs_pct + partner_pct = 100.00", name="ck_partner_arrangements_splits_sum"),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    partner_entity_id = Column(UUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=False)
    worker_pct        = Column(Numeric(5, 2), nullable=False)
    gs_pct            = Column(Numeric(5, 2), nullable=False)
    partner_pct       = Column(Numeric(5, 2), nullable=False)
    effective_from    = Column(Date, nullable=False)
    effective_to      = Column(Date, nullable=True)
    notes             = Column(Text, nullable=True)

    partner_entity   = relationship("PartnerEntity",       back_populates="arrangements")
    client_overrides = relationship("PartnerClientOverride", back_populates="arrangement")
    sessions         = relationship("Session",              back_populates="partner_arrangement", foreign_keys="Session.partner_arrangement_id")


class PartnerClientOverride(Base):
    __tablename__ = "partner_client_overrides"
    __table_args__ = (
        CheckConstraint("worker_pct + gs_pct + partner_pct = 100.00", name="ck_partner_overrides_splits_sum"),
    )

    id                     = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    partner_arrangement_id = Column(UUID(as_uuid=True), ForeignKey("partner_arrangements.id"), nullable=False)
    client_name            = Column(String(255), nullable=False)
    worker_pct             = Column(Numeric(5, 2), nullable=False)
    gs_pct                 = Column(Numeric(5, 2), nullable=False)
    partner_pct            = Column(Numeric(5, 2), nullable=False)
    effective_from         = Column(Date, nullable=False)
    notes                  = Column(Text, nullable=True)

    arrangement = relationship("PartnerArrangement", back_populates="client_overrides")
