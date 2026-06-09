from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from models.enums import IndicatorInputEnum


class QualityIndicatorBase(BaseModel):
    code:                      str
    name:                      str
    description:               Optional[str]  = None
    weight_in_subjective_pool: Decimal
    input_mode:                IndicatorInputEnum
    scale_min:                 int
    scale_max:                 int
    is_active:                 bool = True


class QualityIndicatorCreate(QualityIndicatorBase):
    pass


class QualityIndicatorUpdate(BaseModel):
    name:                      Optional[str]              = None
    description:               Optional[str]              = None
    weight_in_subjective_pool: Optional[Decimal]          = None
    is_active:                 Optional[bool]             = None


class QualityIndicatorResponse(QualityIndicatorBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


# ── QualityIndicatorRating ─────────────────────────────────────────────────────

class QualityIndicatorRatingBase(BaseModel):
    worker_id:    UUID
    indicator_id: UUID
    score:        Decimal
    reason_note:  Optional[str] = None  # mandatory for manual ratings at app layer
    rated_by:     UUID
    session_id:   Optional[UUID] = None


class QualityIndicatorRatingCreate(QualityIndicatorRatingBase):
    pass


class QualityIndicatorRatingUpdate(BaseModel):
    score:       Optional[Decimal] = None
    reason_note: Optional[str]    = None


class QualityIndicatorRatingResponse(QualityIndicatorRatingBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime


# ── QualityCompositeScore ──────────────────────────────────────────────────────

class QualityCompositeScoreBase(BaseModel):
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
