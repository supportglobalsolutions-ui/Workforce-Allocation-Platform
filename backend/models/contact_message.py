import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class ContactMessage(SQLModel, table=True):
    """
    An enquiry sent from the public contact form.

    Deliberately standalone rather than a Notification: the sender is not a
    platform account (they are usually locked out, which is why they are
    writing), so there is no worker or admin row to hang it off.
    """

    __tablename__ = "contact_messages"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(120), nullable=False))
    email: str = Field(sa_column=Column(String(254), nullable=False, index=True))
    subject: str = Field(sa_column=Column(String(160), nullable=False))
    message: str = Field(sa_column=Column(Text, nullable=False))

    # "new" | "read" | "archived"
    status: str = Field(
        default="new",
        sa_column=Column(String(16), nullable=False, server_default="new", index=True),
    )
    # Which admin has dealt with it, and when.
    handled_by_auth_user_id: Optional[str] = Field(
        default=None, sa_column=Column(String(128), nullable=True)
    )
    handled_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    # Kept for abuse investigation — the form is public and unauthenticated.
    ip_address: Optional[str] = Field(default=None, sa_column=Column(String(45), nullable=True))
    user_agent: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))

    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False, index=True),
    )
