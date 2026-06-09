from datetime import datetime
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class AuditLogCreate(BaseModel):
    """Only Create is exposed — audit_log is append-only. No Update or Delete schema."""
    actor_id:       Optional[UUID]    = None
    action:         str
    target_type:    str
    target_id:      UUID
    previous_value: Optional[Any]     = None
    new_value:      Optional[Any]     = None
    reason_note:    Optional[str]     = None
    ip_address:     Optional[str]     = None


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             UUID
    actor_id:       Optional[UUID]
    action:         str
    target_type:    str
    target_id:      UUID
    previous_value: Optional[Any]
    new_value:      Optional[Any]
    reason_note:    Optional[str]
    ip_address:     Optional[str]
    created_at:     datetime
