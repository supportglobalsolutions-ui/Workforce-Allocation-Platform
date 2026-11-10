"""Income received in a working month: the total income pool.

Each entry is frozen in USD at the rate on the day it is entered. Entries for
a client are that client's revenue for the month.
"""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

INCOME_CATEGORIES = ("client_payout", "gs_account", "other")


class IncomeEntry(SQLModel, table=True):
    __tablename__ = "income_entries"
    __table_args__ = (
        CheckConstraint("category IN ('client_payout', 'gs_account', 'other')", name="ck_income_entries_category"),
        CheckConstraint("amount >= 0", name="ck_income_entries_amount_non_negative"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    category: str = Field(sa_column=Column(String(32), nullable=False))
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(default="USD", sa_column=Column(String(3), nullable=False, server_default="USD"))
    # Units of `currency` per 1 USD when the entry was made.
    fx_rate: Decimal = Field(default=Decimal("1"), sa_column=Column(Numeric(18, 6), nullable=False, server_default="1"))
    amount_usd: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    client_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    received_on: Optional[date] = Field(default=None, sa_column=Column(Date, nullable=True))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
