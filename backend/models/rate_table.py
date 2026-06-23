import uuid
from sqlalchemy import Column, String, Text, Numeric, Date, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from .base import Base
from .enums import RateTypeType
from .mixins import CreatedAtMixin


class RateTableEntry(Base, CreatedAtMixin):
    __tablename__ = "rate_table_entries"

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id      = Column(UUID(as_uuid=True), ForeignKey("workers.id"),      nullable=True, index=True)
    pay_tier       = Column(String(64),  nullable=True)
    rate_type      = Column(RateTypeType, nullable=False)
    amount         = Column(Numeric(12, 2), nullable=False)
    currency       = Column(String(3),   nullable=False)
    effective_from = Column(Date, nullable=False)
    effective_to   = Column(Date, nullable=True)
    change_reason  = Column(Text, nullable=False)
    approved_by    = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False)

    # Relationships
    worker   = relationship("Worker",    back_populates="rate_entries",    foreign_keys=[worker_id])
    approver = relationship("AdminUser", back_populates="approved_rate_entries", foreign_keys=[approved_by])
