from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from models.enums import SessionTypeEnum, SessionCloseEnum, PayrollSessionEnum


class SessionBase(BaseModel):
    worker_id:              UUID
    session_type:           SessionTypeEnum
    allocation_id:          Optional[UUID] = None
    rdp_resource_id:        Optional[UUID] = None
    partner_entity_id:      Optional[UUID] = None
    partner_arrangement_id: Optional[UUID] = None
    start_time:             datetime
    type_specific_fields:   dict[str, Any] = {}


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    end_time:              Optional[datetime]           = None
    duration_minutes:      Optional[int]               = None
    close_status:          Optional[SessionCloseEnum]   = None
    payroll_approval_state: Optional[PayrollSessionEnum] = None
    payroll_period_id:     Optional[UUID]              = None
    admin_notes:           Optional[str]               = None
    type_specific_fields:  Optional[dict[str, Any]]    = None


class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id:                     UUID
    end_time:               Optional[datetime]
    duration_minutes:       Optional[int]
    close_status:           Optional[SessionCloseEnum]
    payroll_approval_state: PayrollSessionEnum
    payroll_period_id:      Optional[UUID]
    admin_notes:            Optional[str]
    created_at:             datetime
    updated_at:             datetime
