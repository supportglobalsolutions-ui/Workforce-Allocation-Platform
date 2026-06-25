from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import ShiftStatusEnum


class ShiftBase(SQLModel):
    worker_id:       UUID
    rdp_resource_id: Optional[UUID] = None
    scheduled_start: datetime
    scheduled_end:   datetime
    status:          ShiftStatusEnum = ShiftStatusEnum.pending


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(SQLModel):
    rdp_resource_id:  Optional[UUID]            = None
    status:           Optional[ShiftStatusEnum]  = None
    approved_by:      Optional[UUID]            = None
    approved_at:      Optional[datetime]         = None
    rejection_reason: Optional[str]             = None


class ShiftResponse(ShiftBase):
    model_config = ConfigDict(from_attributes=True)

    id:               UUID
    approved_by:      Optional[UUID]
    approved_at:      Optional[datetime]
    rejection_reason: Optional[str]
    created_at:       datetime
