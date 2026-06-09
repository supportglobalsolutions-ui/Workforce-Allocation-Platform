from datetime import date, datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, ConfigDict
from models.enums import WorkerTypeEnum, WorkerStatusEnum


class WorkerBase(BaseModel):
    worker_type:       WorkerTypeEnum
    partner_entity_id: Optional[UUID] = None
    display_name:      str
    country:           str
    pay_tier:          str
    status:            WorkerStatusEnum
    start_date:        date
    admin_user_id:     Optional[UUID] = None


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(BaseModel):
    display_name:      Optional[str]              = None
    country:           Optional[str]              = None
    pay_tier:          Optional[str]              = None
    status:            Optional[WorkerStatusEnum]  = None
    partner_entity_id: Optional[UUID]             = None


class WorkerResponse(WorkerBase):
    model_config = ConfigDict(from_attributes=True)

    id:         UUID
    created_at: datetime
    updated_at: datetime
