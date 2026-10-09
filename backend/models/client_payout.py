"""
What a client is owed for one working month, and whether it has been paid.

The share is worked out in USD (billing currency) and paid in the client's
payout currency. The exchange rate is frozen when the month is approved;
nothing changes once the payout is marked paid.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, SQLModel

CLIENT_PAYOUT_STATUSES = ("draft", "sent", "paid")


class ClientPayout(SQLModel, table=True):
    __tablename__ = "client_payouts"
    __table_args__ = (
        UniqueConstraint("client_id", "payroll_period_id", name="uq_client_payouts_client_period"),
        CheckConstraint("status IN ('draft', 'sent', 'paid')", name="ck_client_payouts_status"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    client_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True), ForeignKey("payroll_periods.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
    )
    amount_usd: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    fx_rate: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(18, 6), nullable=True))
    amount_local: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(16, 2), nullable=True))
    status: str = Field(default="draft", sa_column=Column(String(16), nullable=False, server_default="draft"))
    statement_path: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    sent_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    paid_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    reference: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    paid_by: Optional[uuid.UUID] = Field(
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
