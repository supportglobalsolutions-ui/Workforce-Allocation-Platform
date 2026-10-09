from datetime import datetime
from typing import Literal, Optional
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
    kind:            Literal["shift", "rdp_claim"] = "shift"


class ShiftCreate(ShiftBase):
    pass


class ShiftUpdate(SQLModel):
    scheduled_start:  Optional[datetime]         = None
    scheduled_end:    Optional[datetime]         = None
    rdp_resource_id:  Optional[UUID]            = None
    status:           Optional[ShiftStatusEnum]  = None
    approved_by:      Optional[UUID]            = None
    approved_at:      Optional[datetime]         = None


class ShiftPendingRequest(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:        UUID
    kind:      str
    new_start: Optional[datetime] = None
    new_end:   Optional[datetime] = None


class ShiftResponse(ShiftBase):
    model_config = ConfigDict(from_attributes=True)

    id:               UUID
    approved_by:      Optional[UUID]
    approved_at:      Optional[datetime]
    created_at:       datetime
    pending_request:  Optional[ShiftPendingRequest] = None
    worker_name:      Optional[str] = None
    rdp_nickname:     Optional[str] = None


class ShiftChangeRequestCreate(SQLModel):
    kind:            Literal["edit", "delete"]
    scheduled_start: Optional[datetime] = None
    scheduled_end:   Optional[datetime] = None
    reason:          Optional[str]      = None


class ShiftChangeRequestReview(SQLModel):
    decision:   Literal["approve", "reject"]
    admin_note: Optional[str] = None


class ShiftChangeRequestResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:            UUID
    shift_id:      UUID
    worker_id:     UUID
    kind:          str
    old_start:     datetime
    old_end:       datetime
    new_start:     Optional[datetime] = None
    new_end:       Optional[datetime] = None
    reason:        Optional[str]      = None
    status:        str
    reviewed_by:   Optional[UUID]     = None
    reviewed_at:   Optional[datetime] = None
    admin_note:    Optional[str]      = None
    created_at:    datetime
    worker_name:   Optional[str]      = None
    reviewer_name: Optional[str]      = None
    shift_start:   Optional[datetime] = None
    shift_end:     Optional[datetime] = None
    shift_status:  Optional[str]      = None


class ShiftChangeSummary(SQLModel):
    pending:           int
    flagged_shift_ids: list[UUID]
