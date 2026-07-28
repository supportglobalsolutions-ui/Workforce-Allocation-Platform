from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import PayrollSessionEnum, SessionCloseEnum, SessionTypeEnum


class SessionBase(SQLModel):
    worker_id:              UUID
    session_type:           SessionTypeEnum
    allocation_id:          Optional[UUID] = None
    rdp_resource_id:        Optional[UUID] = None
    partner_entity_id:      Optional[UUID] = None
    partner_arrangement_id: Optional[UUID] = None
    client_id:              Optional[UUID] = None
    start_time:             datetime
    type_specific_fields:   dict[str, Any] = {}


class SessionCreate(SessionBase):
    # Multilog / external sessions are submitted as an already-finished block.
    end_time:         Optional[datetime] = None
    duration_minutes: Optional[int]      = None


class SessionUpdate(SQLModel):
    end_time:               Optional[datetime]            = None
    duration_minutes:       Optional[int]                 = None
    client_id:              Optional[UUID]                = None
    close_status:           Optional[SessionCloseEnum]    = None
    payroll_approval_state: Optional[PayrollSessionEnum]  = None
    payroll_period_id:      Optional[UUID]                = None
    admin_notes:            Optional[str]                 = None
    start_image_url:        Optional[str]                 = None
    end_image_url:          Optional[str]                 = None
    image_start_at:         Optional[datetime]            = None
    image_end_at:           Optional[datetime]            = None
    type_specific_fields:   Optional[dict[str, Any]]      = None


class SessionResponse(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id:                     UUID
    end_time:               Optional[datetime]
    duration_minutes:       Optional[int]
    close_status:           Optional[SessionCloseEnum]
    payroll_approval_state: PayrollSessionEnum
    payroll_period_id:      Optional[UUID]
    admin_notes:            Optional[str]
    start_image_url:        Optional[str]      = None
    end_image_url:          Optional[str]      = None
    image_start_at:         Optional[datetime] = None
    image_end_at:           Optional[datetime] = None
    evidence_complete:      Optional[bool]     = None
    created_at:             Optional[datetime] = None
    updated_at:             Optional[datetime] = None

    @field_validator("type_specific_fields", mode="before")
    @classmethod
    def _default_type_fields(cls, v: Any) -> dict[str, Any]:
        return v if isinstance(v, dict) else {}


class SessionEvidenceUpdate(SQLModel):
    """Worker submits on-image times (and optionally confirms image URLs already uploaded)."""
    image_start_at: Optional[datetime] = None
    image_end_at:   Optional[datetime] = None
    start_image_url: Optional[str] = None
    end_image_url:   Optional[str] = None


class WorkerHoursTotalsResponse(SQLModel):
    total_minutes: int
    total_hours: Decimal
    sessions: list[SessionResponse]
