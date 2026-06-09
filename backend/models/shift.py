import uuid
from sqlalchemy import Column, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import ShiftStatusType
from .mixins import CreatedAtMixin


class Shift(Base, CreatedAtMixin):
    __tablename__ = "shifts"

    id               = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id        = Column(UUID(as_uuid=True), ForeignKey("workers.id"),       nullable=False, index=True)
    rdp_resource_id  = Column(UUID(as_uuid=True), ForeignKey("rdp_resources.id"), nullable=True)
    scheduled_start  = Column(TIMESTAMPTZ, nullable=False)
    scheduled_end    = Column(TIMESTAMPTZ, nullable=False)
    status           = Column(ShiftStatusType, nullable=False)
    approved_by      = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"),   nullable=True)
    approved_at      = Column(TIMESTAMPTZ, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    # Relationships
    worker       = relationship("Worker",      back_populates="shifts",    foreign_keys=[worker_id])
    rdp_resource = relationship("RDPResource", back_populates="shifts",    foreign_keys=[rdp_resource_id])
    approver     = relationship("AdminUser",   back_populates="approved_shifts", foreign_keys=[approved_by])
    allocation   = relationship("Allocation",  back_populates="shift",     uselist=False)
