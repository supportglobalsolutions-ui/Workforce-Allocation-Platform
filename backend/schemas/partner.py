from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, field_validator
from models.enums import EntityStatusEnum


class PartnerEntityBase(BaseModel):
    name:   str
    notes:  Optional[str] = None
    status: EntityStatusEnum


class PartnerEntityCreate(PartnerEntityBase):
    pass


class PartnerEntityUpdate(BaseModel):
    name:   Optional[str]              = None
    notes:  Optional[str]              = None
    status: Optional[EntityStatusEnum]  = None


class PartnerEntityResponse(PartnerEntityBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime


# ── PartnerArrangement ─────────────────────────────────────────────────────────

class PartnerArrangementBase(BaseModel):
    partner_entity_id: UUID
    worker_pct:        Decimal
    gs_pct:            Decimal
    partner_pct:       Decimal
    effective_from:    date
    effective_to:      Optional[date] = None
    notes:             Optional[str]  = None

    @field_validator("partner_pct")
    @classmethod
    def splits_must_sum_to_100(cls, v, info):
        data = info.data
        if "worker_pct" in data and "gs_pct" in data:
            total = data["worker_pct"] + data["gs_pct"] + v
            if round(total, 2) != Decimal("100.00"):
                raise ValueError("worker_pct + gs_pct + partner_pct must equal 100.00")
        return v


class PartnerArrangementCreate(PartnerArrangementBase):
    pass


class PartnerArrangementUpdate(BaseModel):
    worker_pct:     Optional[Decimal] = None
    gs_pct:         Optional[Decimal] = None
    partner_pct:    Optional[Decimal] = None
    effective_to:   Optional[date]    = None
    notes:          Optional[str]     = None


class PartnerArrangementResponse(PartnerArrangementBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


# ── PartnerClientOverride ──────────────────────────────────────────────────────

class PartnerClientOverrideBase(BaseModel):
    partner_arrangement_id: UUID
    client_name:            str
    worker_pct:             Decimal
    gs_pct:                 Decimal
    partner_pct:            Decimal
    effective_from:         date
    notes:                  Optional[str] = None

    @field_validator("partner_pct")
    @classmethod
    def splits_must_sum_to_100(cls, v, info):
        data = info.data
        if "worker_pct" in data and "gs_pct" in data:
            total = data["worker_pct"] + data["gs_pct"] + v
            if round(total, 2) != Decimal("100.00"):
                raise ValueError("worker_pct + gs_pct + partner_pct must equal 100.00")
        return v


class PartnerClientOverrideCreate(PartnerClientOverrideBase):
    pass


class PartnerClientOverrideUpdate(BaseModel):
    client_name:  Optional[str]     = None
    worker_pct:   Optional[Decimal] = None
    gs_pct:       Optional[Decimal] = None
    partner_pct:  Optional[Decimal] = None
    notes:        Optional[str]     = None


class PartnerClientOverrideResponse(PartnerClientOverrideBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
