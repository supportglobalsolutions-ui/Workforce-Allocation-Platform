import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

# A single message is a note to an admin, not an essay. The cap is enforced at
# the API and mirrored in the UI so someone cannot paste a book into support.
MESSAGE_MAX_CHARS = 2000


class ChatThread(SQLModel, table=True):
    """
    One conversation between one signed-in account and the admin team.

    One thread per account, created on their first message. Admins reply into
    the same thread, so the worker sees a single continuous conversation
    rather than disconnected tickets.
    """

    __tablename__ = "chat_threads"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    # The account that started it. Supabase uid, so it works for any role.
    auth_user_id: str = Field(sa_column=Column(String(128), nullable=False, unique=True, index=True))
    admin_user_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )

    # Denormalised so the admin thread list renders without N lookups.
    display_name: str = Field(sa_column=Column(String(255), nullable=False))
    email: str = Field(sa_column=Column(String(254), nullable=False))
    role: str = Field(default="user", sa_column=Column(String(32), nullable=False, server_default="user"))

    subject: Optional[str] = Field(default=None, sa_column=Column(String(160), nullable=True))
    last_message_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False, index=True),
    )
    last_message_preview: Optional[str] = Field(default=None, sa_column=Column(String(200), nullable=True))

    # Counters beat COUNT(*) per thread when rendering the list.
    unread_for_admin: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )
    unread_for_user: int = Field(
        default=0, sa_column=Column(Integer, nullable=False, server_default="0")
    )

    is_archived: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class ChatMessage(SQLModel, table=True):
    """One message in a thread, from either side."""

    __tablename__ = "chat_messages"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    thread_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("chat_threads.id"), nullable=False, index=True),
    )
    # "user" or "admin" — who wrote it, independent of which account replied.
    sender_side: str = Field(sa_column=Column(String(8), nullable=False))
    sender_auth_user_id: str = Field(sa_column=Column(String(128), nullable=False))
    sender_name: str = Field(sa_column=Column(String(255), nullable=False))

    body: str = Field(sa_column=Column(Text, nullable=False))
    read_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False, index=True),
    )
