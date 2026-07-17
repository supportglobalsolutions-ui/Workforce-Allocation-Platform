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
