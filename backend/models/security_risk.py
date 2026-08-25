import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, SQLModel


class SecurityRiskEvent(SQLModel, table=True):
    """Append-only risk events used to compute a per-admin 24h threat score."""

    __tablename__ = "security_risk_events"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    admin_user_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False, index=True),
    )
    event_type: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    points: int = Field(sa_column=Column(Integer, nullable=False, server_default="0"))
    payload: Optional[Any] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()"), index=True),
    )
