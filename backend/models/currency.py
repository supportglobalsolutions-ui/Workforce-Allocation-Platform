import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Column, Date, DateTime, Numeric, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel


class Country(SQLModel, table=True):
    """Admin-managed country → payout currency mapping."""

    __tablename__ = "countries"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(64), unique=True, nullable=False))
    currency_code: str = Field(sa_column=Column(String(3), nullable=False))
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class FxRate(SQLModel, table=True):
    """
    Exchange rate snapshot: 1 unit of base_currency (USD or GBP) = rate units of
    quote_currency. Manual entries always take precedence over API-fetched ones.
    """

    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("base_currency", "quote_currency", "as_of_date", "source", name="uq_fx_rates_day"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    base_currency: str = Field(sa_column=Column(String(3), nullable=False))
    quote_currency: str = Field(sa_column=Column(String(3), nullable=False))
    rate: Decimal = Field(sa_column=Column(Numeric(18, 6), nullable=False))
    source: str = Field(sa_column=Column(String(16), nullable=False))  # "manual" | "api"
    as_of_date: date = Field(sa_column=Column(Date, nullable=False))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
