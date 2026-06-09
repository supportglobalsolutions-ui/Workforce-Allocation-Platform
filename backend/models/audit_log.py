import uuid
from sqlalchemy import Column, String, Text, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET, TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base


class AuditLog(Base):
    """
    Immutable append-only audit trail.

    !! APPLICATION ROLES MUST NOT BE GRANTED UPDATE OR DELETE ON THIS TABLE !!
    Enforce at the PostgreSQL level:
        REVOKE UPDATE, DELETE ON audit_log FROM app_role;
    The FastAPI application must only ever INSERT rows via AuditService.
    All material actions (claims, force-releases, payroll approval, etc.) must
    write an entry here before the transaction commits.
    """
    __tablename__ = "audit_log"

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    actor_id       = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True)
    action         = Column(String(64),  nullable=False, index=True)
    target_type    = Column(String(64),  nullable=False, index=True)
    target_id      = Column(UUID(as_uuid=True), nullable=False)
    previous_value = Column(JSONB, nullable=True)
    new_value      = Column(JSONB, nullable=True)
    reason_note    = Column(Text, nullable=True)
    ip_address     = Column(INET, nullable=True)
    created_at     = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"), index=True)

    actor = relationship("AdminUser", back_populates="audit_entries", foreign_keys=[actor_id])
