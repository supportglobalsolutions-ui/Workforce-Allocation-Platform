from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import PaymentTierUnitEnum, WorkerTypeEnum

TierScope = Literal["workers", "clients", "both"]


class PaymentTierCreate(SQLModel):
    name: str
    currency: str
    rate: Decimal
    unit: PaymentTierUnitEnum
    description: Optional[str] = None
    is_active: bool = True
    applies_to: TierScope = "workers"


class PaymentTierUpdate(SQLModel):
    name: Optional[str] = None
    currency: Optional[str] = None
    rate: Optional[Decimal] = None
    unit: Optional[PaymentTierUnitEnum] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    applies_to: Optional[TierScope] = None


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
    member_count: int = 0
    applies_to: str = "workers"
    client_count: int = 0
    created_at: datetime
    updated_at: datetime


class PaymentTierClientsRequest(SQLModel):
    client_ids: list[UUID]


class PaymentTierClientsResponse(SQLModel):
    changed: int
    tier_name: str


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


class PaymentTierUnassignResponse(SQLModel):
    removed: int
    tier_name: str
