from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import PayrollPeriodStatusEnum, SessionTypeEnum


class PayrollPeriodBase(SQLModel):
    label:      str
    start_date: date
    end_date:   date
    currency:   str
    status:     PayrollPeriodStatusEnum = PayrollPeriodStatusEnum.open


class PayrollPeriodCreate(PayrollPeriodBase):
    pass


class PayrollPeriodUpdate(SQLModel):
    status:              Optional[PayrollPeriodStatusEnum] = None
    approved_by:         Optional[UUID]                   = None
    export_generated_at: Optional[datetime]               = None


class PayrollPeriodResponse(PayrollPeriodBase):
    model_config = ConfigDict(from_attributes=True)

    id:                  UUID
    approved_by:         Optional[UUID]
    export_generated_at: Optional[datetime]
    wallet_pushed_at:    Optional[datetime] = None
    paid_at:             Optional[datetime] = None
    created_at:          datetime


# ── PayrollLineItem ────────────────────────────────────────────────────────────

class PayrollLineItemBase(SQLModel):
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


class PayrollLineItemUpdate(SQLModel):
    exception_flags: Optional[list[Any]] = None


class PayrollLineItemResponse(PayrollLineItemBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime


# ── PayrollWorkerSummary (payslip row) ─────────────────────────────────────────

class PayrollWorkerSummaryResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:                UUID
    payroll_period_id: UUID
    worker_id:         UUID
    hours_logged:      Decimal
    rate_per_hour:     Decimal
    base_pay:          Decimal
    bonus:             Decimal
    gross_earned:      Decimal
    transfer_cost:     Decimal
    external_cost:     Decimal
    total_deductions:  Decimal
    final_net:         Decimal
    local_currency:    str
    fx_rate:           Optional[Decimal] = None
    base_currency:     Optional[str] = None
    base_equivalent:   Optional[Decimal] = None
    exception_flags:   list[Any] = []
    created_at:        datetime
    updated_at:        datetime
    worker_display_name: Optional[str] = None
    worker_country:      Optional[str] = None
    worker_email:        Optional[str] = None
    worker_type:         Optional[str] = None
    period_label:        Optional[str] = None

    @field_validator("exception_flags", mode="before")
    @classmethod
    def _default_flags(cls, v: Any) -> list[Any]:
        return v if isinstance(v, list) else []


class PayrollWorkerSummaryUpdate(SQLModel):
    """Admin cost-evaluation adjustments; nets are recomputed server-side."""
    bonus:         Optional[Decimal] = None
    transfer_cost: Optional[Decimal] = None
    external_cost: Optional[Decimal] = None
    rate_per_hour: Optional[Decimal] = None
    hours_logged:  Optional[Decimal] = None


# ── CountryCostPool ────────────────────────────────────────────────────────────

class CountryCostPoolUpsert(SQLModel):
    country:             str
    transfer_cost_total: Decimal = Decimal("0.00")
    external_cost_total: Decimal = Decimal("0.00")
    note:                Optional[str] = None


class CountryCostPoolResponse(CountryCostPoolUpsert):
    model_config = ConfigDict(from_attributes=True)
    id:                UUID
    payroll_period_id: UUID


# ── Worker payroll overview (wallet / payments page) ───────────────────────────

class WorkerPayrollOverviewResponse(SQLModel):
    pay_tier: str
    rate_per_hour: Optional[Decimal] = None
    rate_currency: Optional[str] = None
    current_period: Optional[PayrollPeriodResponse] = None
    period_summary: Optional[PayrollWorkerSummaryResponse] = None
