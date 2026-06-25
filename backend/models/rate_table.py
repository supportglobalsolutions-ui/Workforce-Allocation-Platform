from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Column, Date, DateTime, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import RateTypeEnum, RateTypeType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .worker import Worker


class RateTableEntry(SQLModel, table=True):
    __tablename__ = "rate_table_entries"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), nullable=True, index=True),
        foreign_key="workers.id",
    )
    pay_tier: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    rate_type: RateTypeEnum = Field(sa_column=Column(RateTypeType, nullable=False))
    amount: Decimal = Field(sa_column=Column(Numeric(12, 2), nullable=False))
    currency: str = Field(sa_column=Column(String(3), nullable=False))
    effective_from: date = Field(sa_column=Column(Date, nullable=False))
    effective_to: Optional[date] = Field(default=None, sa_column=Column(Date, nullable=True))
    change_reason: str = Field(sa_column=Column(Text, nullable=False))
    approved_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False),
        foreign_key="admin_users.id",
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    worker: Optional[Worker] = Relationship(
        back_populates="rate_entries",
        sa_relationship_kwargs={"foreign_keys": "[RateTableEntry.worker_id]"},
    )
    approver: Optional[AdminUser] = Relationship(
        back_populates="approved_rate_entries",
        sa_relationship_kwargs={"foreign_keys": "[RateTableEntry.approved_by]"},
    )
