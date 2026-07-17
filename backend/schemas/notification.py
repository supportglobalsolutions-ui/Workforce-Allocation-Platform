from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel


class NotificationSend(SQLModel):
    title: str
    message: str
    target_type: str  # "all" | "specific"
    channels: str = "in_app"  # "in_app" | "email" | "both"
    category: str = "general"  # "general" | "payment"
    target_username: Optional[str] = None
    target_email: Optional[str] = None
    worker_ids: Optional[list[UUID]] = None
    extra_emails: Optional[list[str]] = None

    @field_validator("extra_emails", mode="before")
    @classmethod
    def _normalize_extra_emails(cls, v):
        if not v:
            return []
        if isinstance(v, str):
            return [v]
        return list(v)


class NotificationResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sender_admin_id: Optional[UUID]
    sender_name: Optional[str]
    title: str
    message: str
    category: str = "general"
    target_type: str
    target_worker_id: Optional[UUID]
    target_worker_name: Optional[str]
    target_worker_username: Optional[str]
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime


class NotificationRecipient(SQLModel):
    id: UUID
    display_name: str
    username: Optional[str] = None
    email: Optional[str] = None


class NotificationSendResult(SQLModel):
    notifications: list[NotificationResponse]
    in_app_count: int
    emailed: int
    skipped_no_email: int
    email_failures: list[str] = []
