from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class AuditLog(SQLModel, table=True):
    """Immutable append-only audit trail. Never update or delete rows."""

    __tablename__ = "audit_log"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    actor_id: Optional[UUID] = Field(default=None, index=True)
    actor_email: str = Field(max_length=255)
    action: str = Field(max_length=120, index=True)
    resource_type: str = Field(max_length=80, index=True)
    resource_id: Optional[str] = Field(default=None, max_length=80)
    ip_address: Optional[str] = Field(default=None, max_length=45)
    metadata: Optional[dict[str, Any]] = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), index=True
    )


class AuditLogCreate(SQLModel):
    actor_id: Optional[UUID] = None
    actor_email: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class AuditLogRead(SQLModel):
    id: UUID
    actor_id: Optional[UUID]
    actor_email: str
    action: str
    resource_type: str
    resource_id: Optional[str]
    ip_address: Optional[str]
    metadata: Optional[dict[str, Any]]
    created_at: datetime
