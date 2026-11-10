import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, text
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
    account_holder: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
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
    # Off: the admin types the month's billed hours. New clients default on so
    # expected income tracks sessions automatically.
    hours_from_desktops: bool = Field(
        default=True, sa_column=Column(Boolean, nullable=False, server_default="true"),
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
    """GS vs account-owner (and optional third-party) split of the workers' gross."""

    __tablename__ = "client_revenue_agreements"
    __table_args__ = (
        CheckConstraint(
            "gs_pct + owner_pct + third_party_pct = 100.00",
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
    # Optional third party (e.g. a referrer) paid a % of the same gross.
    third_party_name: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True))
    third_party_pct: Decimal = Field(
        default=Decimal("0"), sa_column=Column(Numeric(5, 2), nullable=False, server_default="0"),
    )
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
    third_party_share: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    # Admin's final net per party; when set it replaces the worked-out share and is what is paid.
    client_net_override: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    gs_net_override: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    third_party_net_override: Optional[Decimal] = Field(
        default=None, sa_column=Column(Numeric(14, 2), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    client: Optional["Client"] = Relationship(back_populates="period_earnings")


class Payee(SQLModel, table=True):
    """Someone client money is paid to. Recipients on the client split pick a payee.

    The payee flagged `is_gs` is Global Solutions: its share is kept, not paid out.
    """

    __tablename__ = "payees"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(120), nullable=False, unique=True))
    is_gs: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    payout_currency: Optional[str] = Field(default=None, sa_column=Column(String(3), nullable=True))
    payout_email: Optional[str] = Field(default=None, sa_column=Column(String(255), nullable=True))
    payout_method: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    payout_details: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class ClientSplitRecipient(SQLModel, table=True):
    """One of the payees a client's net distributable is split between, for one month.

    Net distributable = revenue − worker cost − transfer cost − other costs.
    A month with no rows uses the client's most recent earlier month.
    """

    __tablename__ = "client_split_recipients"
    __table_args__ = (
        UniqueConstraint("client_id", "payroll_period_id", "slot", name="uq_client_split_recipients_slot"),
        CheckConstraint("pct >= 0 AND pct <= 100", name="ck_client_split_recipients_pct"),
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
    slot: int = Field(sa_column=Column(Integer, nullable=False))
    payee_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payees.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    name: Optional[str] = Field(default=None, sa_column=Column(String(120), nullable=True))
    pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 2), nullable=False, server_default="0"))
    # Typed amount (USD) replacing net distributable × pct for this month only.
    amount_override: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(14, 2), nullable=True))
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class PayeeClientLink(SQLModel, table=True):
    """A payee's standing share of one client's net distributable.

    Set on the Recipients page. Adding the payee to a client's monthly split
    starts from this %; the month's own % can still be changed there.
    """

    __tablename__ = "payee_client_links"
    __table_args__ = (
        CheckConstraint("pct >= 0 AND pct <= 100", name="ck_payee_client_links_pct"),
    )

    payee_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payees.id", ondelete="CASCADE"), primary_key=True),
    )
    client_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), primary_key=True),
    )
    pct: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(5, 2), nullable=False, server_default="0"))
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )


class ClientWorkerLink(SQLModel, table=True):
    """Direct client assignment, independent of desktop ownership."""
    __tablename__ = "client_worker_links"
    client_id: uuid.UUID = Field(foreign_key="clients.id", primary_key=True, ondelete="CASCADE")
    worker_id: uuid.UUID = Field(foreign_key="workers.id", primary_key=True, ondelete="CASCADE")
