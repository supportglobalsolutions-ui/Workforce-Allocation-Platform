import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import IndicatorInputEnum, IndicatorInputType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .session import Session
    from .worker import Worker


class QualityIndicator(SQLModel, table=True):
    __tablename__ = "quality_indicators"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    code: str = Field(sa_column=Column(String(64), unique=True, nullable=False))
    name: str = Field(sa_column=Column(String(128), nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    weight_in_subjective_pool: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    input_mode: IndicatorInputEnum = Field(sa_column=Column(IndicatorInputType, nullable=False))
    scale_min: int = Field(sa_column=Column(SmallInteger, nullable=False))
    scale_max: int = Field(sa_column=Column(SmallInteger, nullable=False))
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True))

    ratings: list["QualityIndicatorRating"] = Relationship(back_populates="indicator")


class QualityIndicatorRating(SQLModel, table=True):
    __tablename__ = "quality_indicator_ratings"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    indicator_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("quality_indicators.id"), nullable=False),
    )
    score: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    reason_note: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    rated_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False),
    )
    session_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("sessions.id"), nullable=True),
    )
    payroll_period_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("payroll_periods.id"), nullable=True, index=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    worker: Optional["Worker"] = Relationship(back_populates="quality_ratings")
    indicator: Optional["QualityIndicator"] = Relationship(back_populates="ratings")
    rated_by_user: Optional["AdminUser"] = Relationship(
        back_populates="quality_ratings",
        sa_relationship_kwargs={"foreign_keys": "[QualityIndicatorRating.rated_by]"},
    )
    session: Optional["Session"] = Relationship(back_populates="quality_ratings")


class QualityCompositeScore(SQLModel, table=True):
    __tablename__ = "quality_composite_scores"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    mcq_component: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    subjective_component: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    composite_score: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    # Confirmed 30/30/25/15 composite inputs (0-100 each).
    assessment_component: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    rating_component: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    reliability_component: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    consistency_component: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    # "calendar" (calendar month) or "payroll" (payroll period) leaderboard view.
    period_type: Optional[str] = Field(default=None, sa_column=Column(String(16), nullable=True))
    period_label: Optional[str] = Field(default=None, sa_column=Column(String(64), nullable=True))
    country_rank: Optional[int] = Field(default=None, sa_column=Column(SmallInteger, nullable=True))
    global_rank: Optional[int] = Field(default=None, sa_column=Column(SmallInteger, nullable=True))
    session_streak_days: Optional[int] = Field(
        default=None, sa_column=Column(SmallInteger, nullable=True)
    )
    calculated_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    worker: Optional["Worker"] = Relationship(back_populates="composite_scores")
