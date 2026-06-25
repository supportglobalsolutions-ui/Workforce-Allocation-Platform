from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .admin_users import AdminUser


class AuditLog(SQLModel, table=True):
    """
    Immutable append-only audit trail.

    !! APPLICATION ROLES MUST NOT BE GRANTED UPDATE OR DELETE ON THIS TABLE !!
    Enforce at PostgreSQL level:
        REVOKE UPDATE, DELETE ON audit_log FROM app_role;
    """

    __tablename__ = "audit_log"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    actor_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, index=True),
    )
    action: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    target_type: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    target_id: uuid.UUID = Field(sa_column=Column(PGUUID(as_uuid=True), nullable=False))
    previous_value: Optional[Any] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    new_value: Optional[Any] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    reason_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    ip_address: Optional[str] = Field(default=None, sa_column=Column(INET, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()"), index=True),
    )

    actor: Optional[AdminUser] = Relationship(
        back_populates="audit_entries",
        sa_relationship_kwargs={"foreign_keys": "[AuditLog.actor_id]"},
    )
