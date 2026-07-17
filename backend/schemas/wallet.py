from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import WalletTxTypeEnum


class WalletResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    worker_id:  UUID
    balance:    Decimal
    currency:   str
    updated_at: datetime
    worker_display_name: Optional[str] = None
    worker_country:      Optional[str] = None


class WalletAdjustmentCreate(SQLModel):
    worker_id: UUID
    amount:    Decimal  # positive = credit, negative = debit
    currency:  Optional[str] = None
    note:      str


class WalletTransactionResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)
    id:                UUID
    wallet_id:         UUID
    worker_id:         UUID
    tx_type:           WalletTxTypeEnum
    amount:            Decimal
    currency:          str
    payroll_period_id: Optional[UUID] = None
    note:              Optional[str]  = None
    created_at:        datetime
    period_label:      Optional[str]  = None
