# post-MVP
# These tables are defined per the charter appendix but will not be wired to
# routers until a future sprint. Models are included so Alembic generates the
# schema from day one and no migration is needed when features ship.

import uuid
from sqlalchemy import Column, String, Text, Integer, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import TicketStatusType
from .mixins import CreatedAtMixin


class SessionTicket(Base, CreatedAtMixin):
    """Worker-reported issue tied to a session for admin triage."""
    __tablename__ = "session_tickets"

    id          = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    session_id  = Column(UUID(as_uuid=True), ForeignKey("sessions.id"),     nullable=False, index=True)
    worker_id   = Column(UUID(as_uuid=True), ForeignKey("workers.id"),      nullable=False, index=True)
    description = Column(Text, nullable=False)
    status      = Column(TicketStatusType, nullable=False, server_default="open")
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True)

    session  = relationship("Session",   back_populates="tickets")
    worker   = relationship("Worker",    back_populates="session_tickets")


class KnowledgeBaseArticle(Base, CreatedAtMixin):
    """Admin-managed SOP and task guidance articles for workers."""
    __tablename__ = "knowledge_base_articles"

    id           = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    title        = Column(String(255), nullable=False)
    body         = Column(Text, nullable=False)
    version      = Column(Integer, nullable=False, default=1)
    published_at = Column(TIMESTAMPTZ, nullable=True)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False)

    creator = relationship("AdminUser", back_populates="kb_articles")
