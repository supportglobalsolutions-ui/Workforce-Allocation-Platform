import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

from .enums import PaymentTierUnitEnum, PaymentTierUnitType


class PaymentTier(SQLModel, table=True):
    """Catalog of named pay rates used for worker assignment and rate-table sync."""

    __tablename__ = "payment_tiers"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(64), nullable=False, unique=True))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    rate: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    unit: PaymentTierUnitEnum = Field(sa_column=Column(PaymentTierUnitType, nullable=False))
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


def hourly_equivalent(rate: Decimal, unit: PaymentTierUnitEnum) -> Decimal:
    """Convert catalog rate+unit to an hourly amount for payroll calc."""
    if unit == PaymentTierUnitEnum.per_hour:
        return rate
    if unit == PaymentTierUnitEnum.per_day:
        return (rate / Decimal("8")).quantize(Decimal("0.01"))
    if unit == PaymentTierUnitEnum.per_week:
        return (rate / Decimal("40")).quantize(Decimal("0.01"))
    if unit == PaymentTierUnitEnum.per_month:
        return (rate / Decimal("160")).quantize(Decimal("0.01"))
    # per_task: store as-is for rate table; GS hour path still needs a number
    return rate
