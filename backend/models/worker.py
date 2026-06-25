from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Column, Date, DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import WorkerStatusEnum, WorkerStatusType, WorkerTypeEnum, WorkerTypeType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .allocation import Allocation
    from .mcq import McqResult
    from .partner import PartnerEntity
    from .payroll import PayrollLineItem
    from .post_mvp import SessionTicket
    from .quality import QualityCompositeScore, QualityIndicatorRating
    from .rate_table import RateTableEntry
    from .session import Session
    from .shift import Shift


class Worker(SQLModel, table=True):
    __tablename__ = "workers"
    __table_args__ = (
        CheckConstraint(
            "(worker_type != 'partner_worker') OR (partner_entity_id IS NOT NULL)",
            name="ck_workers_partner_entity_required",
        ),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    admin_user_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True, unique=True),
    )
    worker_type: WorkerTypeEnum = Field(sa_column=Column(WorkerTypeType, nullable=False))
    partner_entity_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("partner_entities.id"), nullable=True),
    )
    display_name: str = Field(sa_column=Column(String(255), nullable=False))
    country: str = Field(sa_column=Column(String(64), nullable=False))
    pay_tier: str = Field(sa_column=Column(String(64), nullable=False))
    status: WorkerStatusEnum = Field(sa_column=Column(WorkerStatusType, nullable=False))
    start_date: date = Field(sa_column=Column(Date, nullable=False))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    # Relationships
    admin_user: Optional[AdminUser] = Relationship(
        back_populates="workers",
        sa_relationship_kwargs={"foreign_keys": "[Worker.admin_user_id]"},
    )
    partner_entity: Optional[PartnerEntity] = Relationship(back_populates="workers")
    shifts: list[Shift] = Relationship(
        back_populates="worker",
        sa_relationship_kwargs={"foreign_keys": "[Shift.worker_id]"},
    )
    allocations: list[Allocation] = Relationship(back_populates="worker")
    sessions: list[Session] = Relationship(back_populates="worker")
    rate_entries: list[RateTableEntry] = Relationship(
        back_populates="worker",
        sa_relationship_kwargs={"foreign_keys": "[RateTableEntry.worker_id]"},
    )
    payroll_line_items: list[PayrollLineItem] = Relationship(back_populates="worker")
    quality_ratings: list[QualityIndicatorRating] = Relationship(back_populates="worker")
    composite_scores: list[QualityCompositeScore] = Relationship(back_populates="worker")
    mcq_results: list[McqResult] = Relationship(back_populates="worker")
    session_tickets: list[SessionTicket] = Relationship(back_populates="worker")
