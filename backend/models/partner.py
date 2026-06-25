from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Column, Date, ForeignKey, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import EntityStatusEnum, EntityStatusType

if TYPE_CHECKING:
    from .session import Session
    from .worker import Worker


class PartnerEntity(SQLModel, table=True):
    __tablename__ = "partner_entities"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    name: str = Field(sa_column=Column(String(255), unique=True, nullable=False))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    status: EntityStatusEnum = Field(sa_column=Column(EntityStatusType, nullable=False))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(Date, nullable=False, server_default=text("now()")),
    )

    arrangements: list[PartnerArrangement] = Relationship(back_populates="partner_entity")
    workers: list[Worker] = Relationship(back_populates="partner_entity")
    sessions: list[Session] = Relationship(
        back_populates="partner_entity",
        sa_relationship_kwargs={"foreign_keys": "[Session.partner_entity_id]"},
    )


class PartnerArrangement(SQLModel, table=True):
    __tablename__ = "partner_arrangements"
    __table_args__ = (
        CheckConstraint(
            "worker_pct + gs_pct + partner_pct = 100.00",
            name="ck_partner_arrangements_splits_sum",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    partner_entity_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=False),
    )
    worker_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    gs_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    partner_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    effective_from: date = Field(sa_column=Column(Date, nullable=False))
    effective_to: Optional[date] = Field(default=None, sa_column=Column(Date, nullable=True))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    partner_entity: Optional[PartnerEntity] = Relationship(back_populates="arrangements")
    client_overrides: list[PartnerClientOverride] = Relationship(back_populates="arrangement")
    sessions: list[Session] = Relationship(
        back_populates="partner_arrangement",
        sa_relationship_kwargs={"foreign_keys": "[Session.partner_arrangement_id]"},
    )


class PartnerClientOverride(SQLModel, table=True):
    __tablename__ = "partner_client_overrides"
    __table_args__ = (
        CheckConstraint(
            "worker_pct + gs_pct + partner_pct = 100.00",
            name="ck_partner_overrides_splits_sum",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    partner_arrangement_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_arrangements.id"), nullable=False),
    )
    client_name: str = Field(sa_column=Column(String(255), nullable=False))
    worker_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    gs_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    partner_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    effective_from: date = Field(sa_column=Column(Date, nullable=False))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))

    arrangement: Optional[PartnerArrangement] = Relationship(back_populates="client_overrides")
