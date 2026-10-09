import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import (
    ClientContractStatusEnum,
    ClientContractStatusType,
    ClientOwnerTypeEnum,
    ClientOwnerTypeType,
)

if TYPE_CHECKING:
    from .partner import PartnerEntity
    from .rdp_machine import RDPResource
    from .session import Session
    from .worker import Worker


class Client(SQLModel, table=True):
    """A managed platform account (Outlier, Alignerr, DataAnnotation, ...)."""

    __tablename__ = "clients"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(255), nullable=False))
    platform: str = Field(sa_column=Column(String(128), nullable=False))
    # Client billing rate in USD per hour (from rate sheets / imports).
    billing_rate_usd: Optional[Decimal] = Field(
        default=None,
        sa_column=Column(Numeric(10, 2), nullable=True),
    )
    account_email: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    account_id: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    login_reference: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    owner_type: ClientOwnerTypeEnum = Field(
        default=ClientOwnerTypeEnum.gs,
        sa_column=Column(ClientOwnerTypeType, nullable=False, server_default="gs"),
    )
    owner_worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=True),
    )
    owner_partner_entity_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=True),
    )
    contract_status: ClientContractStatusEnum = Field(
        default=ClientContractStatusEnum.active,
        sa_column=Column(ClientContractStatusType, nullable=False, server_default="active"),
    )
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    document_urls: list[Any] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    # A client tier's hourly rate replaces billing_rate_usd when set.
    payment_tier_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payment_tiers.id", ondelete="SET NULL"), nullable=True),
    )
    # On: billed hours come from the Hours Log rows on this client's desktops.
    # Off: the admin types the month's billed hours.
    hours_from_desktops: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false"),
    )
    payout_currency: Optional[str] = Field(default=None, sa_column=Column(String(3), nullable=True))
    payout_email: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    payout_method: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    payout_details: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    owner_worker: Optional["Worker"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Client.owner_worker_id]"},
    )
    owner_partner_entity: Optional["PartnerEntity"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[Client.owner_partner_entity_id]"},
    )
    revenue_agreements: list["ClientRevenueAgreement"] = Relationship(back_populates="client")
    period_earnings: list["ClientPeriodEarning"] = Relationship(back_populates="client")
    rdp_resources: list["RDPResource"] = Relationship(back_populates="client")
    sessions: list["Session"] = Relationship(back_populates="client")


class ClientRevenueAgreement(SQLModel, table=True):
    """GS vs account-owner revenue split, applied after worker costs are deducted."""

    __tablename__ = "client_revenue_agreements"
    __table_args__ = (
        CheckConstraint(
            "gs_pct + owner_pct = 100.00",
            name="ck_client_revenue_agreements_splits_sum",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    client_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True),
    )
    gs_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    owner_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    effective_from: date = Field(sa_column=Column(Date, nullable=False))
    effective_to: Optional[date] = Field(default=None, sa_column=Column(Date, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    client: Optional["Client"] = Relationship(back_populates="revenue_agreements")


class ClientPeriodEarning(SQLModel, table=True):
    """One client's billing for one working month, in USD.

    `amount` is what was actually received (null until entered). The other
    figures are written by services.client_billing each time the month is
    worked out, so reports and statements read one consistent row.
    """

    __tablename__ = "client_period_earnings"
    __table_args__ = (
        UniqueConstraint(
            "client_id",
            "payroll_period_id",
            name="uq_client_period_earnings_client_period",
        ),
        CheckConstraint("amount >= 0", name="ck_client_period_earnings_amount_non_negative"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    client_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id"), nullable=False, index=True),
    )
    payroll_period_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=False, index=True),
    )
    amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    received_on: Optional[date] = Field(default=None, sa_column=Column(Date, nullable=True))
    # Typed billed hours, used while the client's desktop-hours switch is off.
    billed_hours_manual: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    # Costs charged to this client this month (taken off the client's share).
    client_costs: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(14, 2), nullable=False, server_default="0"),
    )
    billed_hours: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(10, 2), nullable=True))
    rate_used: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2), nullable=True))
    expected_amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    client_pct_used: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    client_share: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    gs_share: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    client: Optional["Client"] = Relationship(back_populates="period_earnings")
