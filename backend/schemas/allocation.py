from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import ReleaseReasonEnum


class AllocationBase(SQLModel):
    shift_id:        Optional[UUID] = None
    worker_id:       UUID
    rdp_resource_id: UUID


class AllocationCreate(AllocationBase):
    guacamole_token: Optional[str] = None


class AllocationUpdate(SQLModel):
    released_at:     Optional[datetime]         = None
    release_reason:  Optional[ReleaseReasonEnum] = None
    guacamole_token: Optional[str]              = None


class AllocationResponse(AllocationBase):
    model_config = ConfigDict(from_attributes=True)

    id:              UUID
    claimed_at:      datetime
    released_at:     Optional[datetime]
    release_reason:  Optional[ReleaseReasonEnum]
    guacamole_token: Optional[str]
    created_at:      datetime
