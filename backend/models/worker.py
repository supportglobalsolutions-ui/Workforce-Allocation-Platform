import uuid
from sqlalchemy import Column, String, Date, ForeignKey, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base
from .enums import WorkerTypeType, WorkerStatusType
from .mixins import TimestampMixin


class Worker(Base, TimestampMixin):
    __tablename__ = "workers"
    __table_args__ = (
        # Partner workers must have a partner_entity_id
        CheckConstraint(
            "(worker_type != 'partner_worker') OR (partner_entity_id IS NOT NULL)",
            name="ck_workers_partner_entity_required",
        ),
    )

    id                = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    admin_user_id     = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), unique=True, nullable=True)
    worker_type       = Column(WorkerTypeType,   nullable=False)
    partner_entity_id = Column(UUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=True)
    display_name      = Column(String(255), nullable=False)
    country           = Column(String(64),  nullable=False)
    pay_tier          = Column(String(64),  nullable=False)
    status            = Column(WorkerStatusType, nullable=False)
    start_date        = Column(Date, nullable=False)

    # Relationships
    admin_user         = relationship("AdminUser",              back_populates="workers",           foreign_keys=[admin_user_id])
    partner_entity     = relationship("PartnerEntity",          back_populates="workers")
    shifts             = relationship("Shift",                  back_populates="worker",            foreign_keys="Shift.worker_id")
    allocations        = relationship("Allocation",             back_populates="worker")
    sessions           = relationship("Session",                back_populates="worker")
    rate_entries       = relationship("RateTableEntry",         back_populates="worker",            foreign_keys="RateTableEntry.worker_id")
    payroll_line_items = relationship("PayrollLineItem",        back_populates="worker")
    quality_ratings    = relationship("QualityIndicatorRating", back_populates="worker")
    composite_scores   = relationship("QualityCompositeScore",  back_populates="worker")
    mcq_results        = relationship("McqResult",              back_populates="worker")
    session_tickets    = relationship("SessionTicket",          back_populates="worker")
