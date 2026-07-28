from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import PaymentTierUnitEnum, WorkerTypeEnum


class PaymentTierCreate(SQLModel):
    name: str
    currency: str
    rate: Decimal
    unit: PaymentTierUnitEnum
    description: Optional[str] = None
    is_active: bool = True


class PaymentTierUpdate(SQLModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    rate: Optional[Decimal] = None
    unit: Optional[PaymentTierUnitEnum] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class PaymentTierResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    currency: str
    rate: Decimal
    unit: PaymentTierUnitEnum
    is_active: bool
    description: Optional[str] = None
    hourly_equivalent: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime


class PaymentTierAssignRequest(SQLModel):
    """Assign a tier to workers by explicit IDs and/or type filter."""

    worker_ids: Optional[list[UUID]] = None
    worker_type: Optional[WorkerTypeEnum] = None  # gs_registered | partner_worker
    partner_entity_id: Optional[UUID] = None
    apply_all_active: bool = False
    search: Optional[str] = None


class PaymentTierAssignResponse(SQLModel):
    assigned: int
    tier_name: str
