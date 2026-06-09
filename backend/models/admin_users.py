import uuid
from sqlalchemy import Column, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base
from .enums import AdminRoleType, AccountStatusType
from .mixins import TimestampMixin


class AdminUser(Base, TimestampMixin):
    __tablename__ = "admin_users"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    firebase_uid  = Column(String(128), unique=True, nullable=False)
    email         = Column(String(255), unique=True, nullable=False)
    role          = Column(AdminRoleType, nullable=False)
    display_name  = Column(String(255), nullable=False)
    country_scope = Column(String(64),  nullable=True)
    status        = Column(AccountStatusType, nullable=False, server_default="active")

    # Relationships
    workers              = relationship("Worker",                back_populates="admin_user",  foreign_keys="Worker.admin_user_id")
    approved_shifts      = relationship("Shift",                 back_populates="approver",    foreign_keys="Shift.approved_by")
    quality_ratings      = relationship("QualityIndicatorRating", back_populates="rated_by_user")
    approved_rate_entries = relationship("RateTableEntry",        back_populates="approver",    foreign_keys="RateTableEntry.approved_by")
    approved_payroll     = relationship("PayrollPeriod",          back_populates="approver",    foreign_keys="PayrollPeriod.approved_by")
    created_assessments  = relationship("McqAssessmentSet",       back_populates="creator")
    audit_entries        = relationship("AuditLog",               back_populates="actor",       foreign_keys="AuditLog.actor_id")
    kb_articles          = relationship("KnowledgeBaseArticle",   back_populates="creator")
