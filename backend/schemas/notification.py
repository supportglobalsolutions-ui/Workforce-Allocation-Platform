from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel


class NotificationSend(SQLModel):
    title: str
    message: str
    target_type: str  # "all" | "specific"
    target_username: Optional[str] = None
    target_email: Optional[str] = None


class NotificationResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sender_admin_id: Optional[UUID]
    sender_name: Optional[str]
    title: str
    message: str
    target_type: str
    target_worker_id: Optional[UUID]
    target_worker_name: Optional[str]
    target_worker_username: Optional[str]
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime
