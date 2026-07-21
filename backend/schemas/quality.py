from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import IndicatorInputEnum


class QualityIndicatorBase(SQLModel):
    code:                      str
    name:                      str
    description:               Optional[str]      = None
    weight_in_subjective_pool: Decimal
    input_mode:                IndicatorInputEnum
    scale_min:                 int
    scale_max:                 int
    is_active:                 bool = True


class QualityIndicatorCreate(QualityIndicatorBase):
    pass


class QualityIndicatorUpdate(SQLModel):
    name:                      Optional[str]     = None
    description:               Optional[str]     = None
    weight_in_subjective_pool: Optional[Decimal] = None
    is_active:                 Optional[bool]    = None


class QualityIndicatorResponse(QualityIndicatorBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


# ── QualityIndicatorRating ─────────────────────────────────────────────────────

class QualityIndicatorRatingCreate(SQLModel):
    worker_id: UUID
    indicator_id: UUID
    score: Decimal
    reason_note: Optional[str] = None
    session_id: Optional[UUID] = None
    payroll_period_id: Optional[UUID] = None


class QualityIndicatorRatingUpdate(SQLModel):
    score:       Optional[Decimal] = None
    reason_note: Optional[str]    = None


class QualityIndicatorRatingResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:         UUID
    worker_id:  UUID
    indicator_id: UUID
    score:      Decimal
    reason_note: Optional[str] = None
    rated_by:   UUID
    session_id: Optional[UUID] = None
    payroll_period_id: Optional[UUID] = None
    created_at: datetime


class PendingRatingWorker(SQLModel):
    worker_id:    UUID
    display_name: str
    country:      str
    worker_type:  str


class PendingRatingsResponse(SQLModel):
    payroll_period_id: UUID
    period_label: str
    pending: list[PendingRatingWorker]
    rated_count: int
    total_workers: int


# ── QualityCompositeScore ──────────────────────────────────────────────────────

class QualityCompositeScoreBase(SQLModel):
    worker_id:            UUID
    mcq_component:        Decimal
    subjective_component: Decimal
    composite_score:      Decimal
    assessment_component:  Optional[Decimal] = None
    rating_component:      Optional[Decimal] = None
    reliability_component: Optional[Decimal] = None
    consistency_component: Optional[Decimal] = None
    period_type:          Optional[str] = None
    period_label:         Optional[str] = None
    country_rank:         Optional[int] = None
    global_rank:          Optional[int] = None
    session_streak_days:  Optional[int] = None


class QualityCompositeScoreCreate(QualityCompositeScoreBase):
    pass


class QualityCompositeScoreResponse(QualityCompositeScoreBase):
    model_config = ConfigDict(from_attributes=True)
    id:            UUID
    calculated_at: datetime


# ── Leaderboard (enriched with worker info) ────────────────────────────────────

class LeaderboardResponse(SQLModel):
    id:                   UUID
    worker_id:            UUID
    worker_display_name:  str
    worker_country:       str
    worker_type:          Optional[str] = None
    composite_score:      Decimal
    assessment_component:  Optional[Decimal] = None
    rating_component:      Optional[Decimal] = None
    reliability_component: Optional[Decimal] = None
    consistency_component: Optional[Decimal] = None
    period_type:          Optional[str] = None
    period_label:         Optional[str] = None
    global_rank:          Optional[int] = None
    country_rank:         Optional[int] = None
    session_streak_days:  Optional[int] = None
    calculated_at:        datetime
