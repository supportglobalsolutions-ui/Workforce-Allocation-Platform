from datetime import date, datetime
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
    #: Currency derived from the worker's country right now, rather than the
    #: code stored on the row. A wallet created before the profile carried a
    #: country keeps USD on the ledger; the worker should still be shown what
    #: their account says they are paid in.
    local_currency:      Optional[str] = None
    #: Display symbol for ``currency`` — "KSh" rather than "KES".
    currency_symbol:     Optional[str] = None


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
    #: Work dates and payslip figures behind a payroll credit.
    period_start:      Optional[date] = None
    period_end:        Optional[date] = None
    hours_logged:      Optional[Decimal] = None
    rate_per_hour:     Optional[Decimal] = None
    rate_currency:     Optional[str] = None


class PayoutRow(SQLModel):
    worker_id:           UUID
    worker_display_name: str
    worker_country:      Optional[str] = None
    hours_logged:        Decimal
    rate_per_hour:       Decimal
    amount:              Decimal
    currency:            str
    #: When the credit landed in the wallet; None while still to send.
    sent_at:             Optional[datetime] = None


class PayoutPeriod(SQLModel):
    period_id:  UUID
    label:      str
    status:     str
    start_date: date
    end_date:   date
    rows:       list[PayoutRow]


class PayoutSendRequest(SQLModel):
    period_id:  UUID
    #: None sends to everyone in the period who has not been paid yet.
    worker_ids: Optional[list[UUID]] = None


class PayoutSendResponse(SQLModel):
    credited:      int
    skipped:       int
    approved:      bool = False
    skipped_no_fx: list[str] = []
