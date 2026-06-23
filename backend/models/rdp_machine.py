import uuid
from sqlalchemy import Column, String, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .types import TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import RdpStatusType


class RDPResource(Base):
    __tablename__ = "rdp_resources"

    id                     = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    nickname               = Column(String(64),  unique=True, nullable=False)
    country                = Column(String(64),  nullable=False)
    client_group           = Column(String(128), nullable=False)
    status                 = Column(RdpStatusType, nullable=False)
    assigned_worker_id     = Column(UUID(as_uuid=True), ForeignKey("workers.id"), nullable=True)
    guacamole_connection_id = Column(String(128), nullable=True)
    health_notes           = Column(Text, nullable=True)
    risk_flags             = Column(JSONB, nullable=False, server_default="'[]'")
    last_health_check_at   = Column(TIMESTAMPTZ, nullable=True)
    status_changed_at      = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))

    # Relationships
    assigned_worker = relationship("Worker",     foreign_keys=[assigned_worker_id])
    shifts          = relationship("Shift",      back_populates="rdp_resource",  foreign_keys="Shift.rdp_resource_id")
    allocations     = relationship("Allocation", back_populates="rdp_resource")
    sessions        = relationship("Session",    back_populates="rdp_resource",  foreign_keys="Session.rdp_resource_id")
