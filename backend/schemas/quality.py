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

class QualityIndicatorRatingBase(SQLModel):
    worker_id:    UUID
    indicator_id: UUID
    score:        Decimal
    reason_note:  Optional[str] = None
    rated_by:     UUID
    session_id:   Optional[UUID] = None


class QualityIndicatorRatingCreate(QualityIndicatorRatingBase):
    pass


class QualityIndicatorRatingUpdate(SQLModel):
    score:       Optional[Decimal] = None
    reason_note: Optional[str]    = None


class QualityIndicatorRatingResponse(QualityIndicatorRatingBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime


# ── QualityCompositeScore ──────────────────────────────────────────────────────

class QualityCompositeScoreBase(SQLModel):
    worker_id:            UUID
    mcq_component:        Decimal
    subjective_component: Decimal
    composite_score:      Decimal
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
    composite_score:      Decimal
    global_rank:          Optional[int] = None
    country_rank:         Optional[int] = None
    session_streak_days:  Optional[int] = None
    calculated_at:        datetime
