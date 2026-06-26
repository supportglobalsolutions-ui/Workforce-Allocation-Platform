# post-MVP models — defined so Alembic generates the schema from day one.

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import TicketStatusEnum, TicketStatusType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .session import Session
    from .worker import Worker


class SessionTicket(SQLModel, table=True):
    __tablename__ = "session_tickets"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    session_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    description: str = Field(sa_column=Column(Text, nullable=False))
    status: TicketStatusEnum = Field(
        default=TicketStatusEnum.open,
        sa_column=Column(TicketStatusType, nullable=False, server_default="open"),
    )
    resolved_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    session: Optional["Session"] = Relationship(back_populates="tickets")
    worker: Optional["Worker"] = Relationship(back_populates="session_tickets")


class KnowledgeBaseArticle(SQLModel, table=True):
    __tablename__ = "knowledge_base_articles"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    body: str = Field(sa_column=Column(Text, nullable=False))
    version: int = Field(default=1, sa_column=Column(Integer, nullable=False, default=1))
    published_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    creator: Optional["AdminUser"] = Relationship(back_populates="kb_articles")
