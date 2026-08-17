from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel


class CountryBase(SQLModel):
    name:          str
    currency_code: str
    is_active:     bool = True


class CountryCreate(CountryBase):
    pass


class CountryUpdate(SQLModel):
    name:          Optional[str]  = None
    currency_code: Optional[str]  = None
    is_active:     Optional[bool] = None


class CountryResponse(CountryBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime


class CurrencyBase(SQLModel):
    code:      str
    name:      str
    symbol:    Optional[str] = None
    is_active: bool = True


class CurrencyCreate(CurrencyBase):
    """Optional usd_rate seeds a manual `1 USD = usd_rate CODE` row on create."""
    usd_rate: Optional[Decimal] = None


class CurrencyUpdate(SQLModel):
    name:      Optional[str]  = None
    symbol:    Optional[str]  = None
    is_active: Optional[bool] = None
    usd_rate:  Optional[Decimal] = None


class CurrencyResponse(CurrencyBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
    # Effective rates resolved through fx.get_rate (manual beats API, GBP derived from USD).
    usd_rate:        Optional[Decimal] = None
    usd_rate_source: Optional[str] = None
    gbp_rate:        Optional[Decimal] = None


class FxRateBase(SQLModel):
    base_currency:  str
    quote_currency: str
    rate:           Decimal
    source:         str = "manual"
    as_of_date:     date


class FxRateCreate(FxRateBase):
    pass


class FxRateResponse(FxRateBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
