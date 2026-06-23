import uuid
from sqlalchemy import Column, String, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID
from .types import TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import ReleaseReasonType
from .mixins import CreatedAtMixin


class Allocation(Base, CreatedAtMixin):
    """
    Atomic RDP claim record. The partial unique index below enforces the
    double-claim prevention rule: only one open (released_at IS NULL) allocation
    per RDP resource at any time.
    """
    __tablename__ = "allocations"
    __table_args__ = (
        # ── CRITICAL: double-claim prevention ──────────────────────────────────
        # Only one open allocation (released_at IS NULL) per rdp_resource at a time.
        # A second concurrent claim will fail here even if the Redis lock is bypassed.
        Index(
            "uq_allocations_active_rdp",
            "rdp_resource_id",
            unique=True,
            postgresql_where=text("released_at IS NULL"),
        ),
    )

    id              = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    shift_id        = Column(UUID(as_uuid=True), ForeignKey("shifts.id"),       nullable=True)
    worker_id       = Column(UUID(as_uuid=True), ForeignKey("workers.id"),      nullable=False, index=True)
    rdp_resource_id = Column(UUID(as_uuid=True), ForeignKey("rdp_resources.id"), nullable=False, index=True)
    claimed_at      = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))
    released_at     = Column(TIMESTAMPTZ, nullable=True)
    release_reason  = Column(ReleaseReasonType, nullable=True)
    guacamole_token = Column(String(512), nullable=True)

    # Relationships
    shift        = relationship("Shift",       back_populates="allocation")
    worker       = relationship("Worker",      back_populates="allocations")
    rdp_resource = relationship("RDPResource", back_populates="allocations")
    session      = relationship("Session",     back_populates="allocation", uselist=False)
