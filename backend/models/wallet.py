import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, DateTime, ForeignKey, Index, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import WalletTxTypeEnum, WalletTxTypeType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .payroll import PayrollPeriod
    from .worker import Worker


class Wallet(SQLModel, table=True):
    __tablename__ = "wallets"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, unique=True),
    )
    balance: Decimal = Field(
        default=Decimal("0.00"),
        sa_column=Column(Numeric(14, 2), nullable=False, server_default="0.00"),
    )
    currency: str = Field(default="USD", sa_column=Column(String(3), nullable=False, server_default="USD"))
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    worker: Optional["Worker"] = Relationship()
    transactions: list["WalletTransaction"] = Relationship(back_populates="wallet")


class WalletTransaction(SQLModel, table=True):
    __tablename__ = "wallet_transactions"
    __table_args__ = (
        # One payroll credit per worker per period (idempotent period push).
        Index(
            "uq_wallet_tx_payroll_credit",
            "worker_id",
            "payroll_period_id",
            unique=True,
            postgresql_where=text("tx_type = 'payroll_credit'"),
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    wallet_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("wallets.id"), nullable=False, index=True),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    tx_type: WalletTxTypeEnum = Field(sa_column=Column(WalletTxTypeType, nullable=False))
    amount: Decimal = Field(sa_column=Column(Numeric(14, 2), nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    payroll_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=True),
    )
    note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    wallet: Optional["Wallet"] = Relationship(back_populates="transactions")
    payroll_period: Optional["PayrollPeriod"] = Relationship()
    created_by_user: Optional["AdminUser"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[WalletTransaction.created_by]"},
    )
