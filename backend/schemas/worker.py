from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import WorkerStatusEnum, WorkerTypeEnum


class WorkerBase(SQLModel):
    worker_type:       WorkerTypeEnum
    partner_entity_id: Optional[UUID] = None
    username:          Optional[str]  = None
    display_name:      str
    country:           str
    pay_tier:          str
    pay_amount:        Optional[Decimal] = None
    pay_frequency:     Optional[str] = None  # per_month | per_task
    status:            WorkerStatusEnum
    start_date:        date
    admin_user_id:     Optional[UUID] = None
    work_ready:        bool = False


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(SQLModel):
    """Worker self-service: identity fields only."""
    username:     Optional[str] = None
    display_name: Optional[str] = None
    country:      Optional[str] = None


class WorkerAdminUpdate(SQLModel):
    """Admin: personal, payment, designation, readiness, and optional RDP assignment."""
    display_name:      Optional[str]              = None
    username:          Optional[str]              = None
    country:           Optional[str]              = None
    pay_tier:          Optional[str]              = None
    pay_amount:        Optional[Decimal]          = None
    pay_frequency:     Optional[str]              = None
    status:            Optional[WorkerStatusEnum] = None
    partner_entity_id: Optional[UUID]             = None
    worker_type:       Optional[WorkerTypeEnum]   = None
    start_date:        Optional[date]             = None
    work_ready:        Optional[bool]             = None
    # Not a Worker column — handled in the router to update rdp_resources.
    assigned_rdp_id:   Optional[UUID]             = None

    @field_validator("pay_frequency")
    @classmethod
    def validate_pay_frequency(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        if v not in {"per_month", "per_task"}:
            raise ValueError("pay_frequency must be per_month or per_task")
        return v


class WorkerResponse(WorkerBase):
    model_config = ConfigDict(from_attributes=True)

    id:         UUID
    created_at: datetime
    updated_at: datetime
    email:      Optional[str] = None
    partner_entity_name: Optional[str] = None
    partner_entity_is_self: Optional[bool] = None
    assigned_rdp_id: Optional[UUID] = None
    assigned_rdp_nickname: Optional[str] = None
