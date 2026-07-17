from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import ClientContractStatusEnum, ClientOwnerTypeEnum


class ClientBase(SQLModel):
    name:                    str
    platform:                str
    account_email:           Optional[str] = None
    account_id:              Optional[str] = None
    login_reference:         Optional[str] = None
    owner_type:              ClientOwnerTypeEnum = ClientOwnerTypeEnum.gs
    owner_worker_id:         Optional[UUID] = None
    owner_partner_entity_id: Optional[UUID] = None
    contract_status:         ClientContractStatusEnum = ClientContractStatusEnum.active
    notes:                   Optional[str] = None
    document_urls:           list[Any] = []


class ClientCreate(ClientBase):
    pass


class ClientUpdate(SQLModel):
    name:                    Optional[str] = None
    platform:                Optional[str] = None
    account_email:           Optional[str] = None
    account_id:              Optional[str] = None
    login_reference:         Optional[str] = None
    owner_type:              Optional[ClientOwnerTypeEnum] = None
    owner_worker_id:         Optional[UUID] = None
    owner_partner_entity_id: Optional[UUID] = None
    contract_status:         Optional[ClientContractStatusEnum] = None
    notes:                   Optional[str] = None
    document_urls:           Optional[list[Any]] = None


class ClientResponse(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
    updated_at: datetime
    owner_name: Optional[str] = None
    rdp_count:  Optional[int] = None

    @field_validator("document_urls", mode="before")
    @classmethod
    def _default_docs(cls, v: Any) -> list[Any]:
        return v if isinstance(v, list) else []


# ── ClientRevenueAgreement ─────────────────────────────────────────────────────

class ClientRevenueAgreementBase(SQLModel):
    client_id:      UUID
    gs_pct:         Decimal
    owner_pct:      Decimal
    effective_from: date
    effective_to:   Optional[date] = None
    notes:          Optional[str] = None

    @field_validator("owner_pct")
    @classmethod
    def splits_must_sum_to_100(cls, v, info):
        data = info.data
        if "gs_pct" in data:
            if round(data["gs_pct"] + v, 2) != Decimal("100.00"):
                raise ValueError("gs_pct + owner_pct must equal 100.00")
        return v


class ClientRevenueAgreementCreate(ClientRevenueAgreementBase):
    pass


class ClientRevenueAgreementUpdate(SQLModel):
    gs_pct:       Optional[Decimal] = None
    owner_pct:    Optional[Decimal] = None
    effective_to: Optional[date]    = None
    notes:        Optional[str]     = None


class ClientRevenueAgreementResponse(ClientRevenueAgreementBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
