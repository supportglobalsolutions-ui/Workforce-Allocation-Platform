import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

# One-row table. The seed migration inserts this id so GET never has to create it.
PLATFORM_SETTINGS_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
DEFAULT_ALERT_EMAIL = "peterkelvinkibiru1532@gmail.com"


class PlatformSettings(SQLModel, table=True):
    """
    Singleton ops settings. The alert email receives irreversible-action codes
    (currently work-period deletion). Changing it does not take effect for those
    codes until 24 hours later — the previous address keeps receiving them, so
    swapping the inbox cannot immediately authorize a delete.
    """

    __tablename__ = "platform_settings"

    id: uuid.UUID = Field(
        default=PLATFORM_SETTINGS_ID,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True),
    )
    alert_email: str = Field(sa_column=Column(String(255), nullable=False))
    alert_email_previous: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    alert_email_changed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
