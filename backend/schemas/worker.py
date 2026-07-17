from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import WorkerStatusEnum, WorkerTypeEnum


class WorkerBase(SQLModel):
    worker_type:       WorkerTypeEnum
    partner_entity_id: Optional[UUID] = None
    username:          Optional[str]  = None
    display_name:      str
    country:           str
    pay_tier:          str
    status:            WorkerStatusEnum
    start_date:        date
    admin_user_id:     Optional[UUID] = None
    work_ready:        bool = False


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(SQLModel):
    username:          Optional[str]             = None
    display_name:      Optional[str]             = None
    country:           Optional[str]             = None
    pay_tier:          Optional[str]             = None
    status:            Optional[WorkerStatusEnum] = None
    partner_entity_id: Optional[UUID]            = None


class WorkerAdminUpdate(WorkerUpdate):
    """Admin-only update: every worker field is editable."""
    worker_type: Optional[WorkerTypeEnum] = None
    start_date:  Optional[date]           = None
    work_ready:  Optional[bool]           = None


class WorkerResponse(WorkerBase):
    model_config = ConfigDict(from_attributes=True)

    id:         UUID
    created_at: datetime
    updated_at: datetime
    email:      Optional[str] = None
    partner_entity_name: Optional[str] = None
