from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, field_validator
from models.enums import PayrollPeriodStatusEnum, SessionTypeEnum


class PayrollPeriodBase(BaseModel):
    label:      str
    start_date: date
    end_date:   date
    currency:   str
    status:     PayrollPeriodStatusEnum = PayrollPeriodStatusEnum.open


class PayrollPeriodCreate(PayrollPeriodBase):
    pass


class PayrollPeriodUpdate(BaseModel):
    status:              Optional[PayrollPeriodStatusEnum] = None
    approved_by:         Optional[UUID]                   = None
    export_generated_at: Optional[datetime]               = None


class PayrollPeriodResponse(PayrollPeriodBase):
    model_config = ConfigDict(from_attributes=True)

    id:                  UUID
    approved_by:         Optional[UUID]
    export_generated_at: Optional[datetime]
    created_at:          datetime


# ── PayrollLineItem ────────────────────────────────────────────────────────────

class PayrollLineItemBase(BaseModel):
    payroll_period_id: UUID
    session_id:        UUID
    worker_id:         UUID
    session_type:      SessionTypeEnum
    gross_amount:      Decimal
    worker_pct:        Decimal
    gs_pct:            Decimal
    partner_pct:       Decimal
    worker_net:        Decimal
    gs_net:            Decimal
    partner_net:       Decimal
    exception_flags:   list[Any] = []

    @field_validator("partner_pct")
    @classmethod
    def splits_must_sum_to_100(cls, v, info):
        data = info.data
        if "worker_pct" in data and "gs_pct" in data:
            total = data["worker_pct"] + data["gs_pct"] + v
            if round(total, 2) != Decimal("100.00"):
                raise ValueError("worker_pct + gs_pct + partner_pct must equal 100.00")
        return v


class PayrollLineItemCreate(PayrollLineItemBase):
    pass


class PayrollLineItemUpdate(BaseModel):
    exception_flags: Optional[list[Any]] = None


class PayrollLineItemResponse(PayrollLineItemBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
