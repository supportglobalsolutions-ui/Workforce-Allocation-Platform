import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class AdminOtpChallenge(SQLModel, table=True):
    """
    Short-lived confirmation code for a destructive admin action.

    The plaintext code is never stored — only an HMAC. Challenges expire in
    three minutes and are single-use.
    """

    __tablename__ = "admin_otp_challenges"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    purpose: str = Field(sa_column=Column(String(64), nullable=False, index=True))
    target_id: uuid.UUID = Field(sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True))
    code_hash: str = Field(sa_column=Column(String(64), nullable=False))
    sent_to: str = Field(sa_column=Column(String(255), nullable=False))
    expires_at: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    consumed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    attempts: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
