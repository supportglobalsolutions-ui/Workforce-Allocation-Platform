from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class McqAssessmentSetBase(BaseModel):
    title:             str
    category:          str
    passing_score_pct: Decimal
    is_active:         bool = True
    created_by:        UUID


class McqAssessmentSetCreate(McqAssessmentSetBase):
    pass


class McqAssessmentSetUpdate(BaseModel):
    title:             Optional[str]     = None
    category:          Optional[str]     = None
    passing_score_pct: Optional[Decimal] = None
    is_active:         Optional[bool]    = None


class McqAssessmentSetResponse(McqAssessmentSetBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


# ── McqQuestion ────────────────────────────────────────────────────────────────

class McqQuestionBase(BaseModel):
    assessment_set_id:  UUID
    prompt:             str
    options:            list[Any]
    correct_option_key: str
    sort_order:         int = 0


class McqQuestionCreate(McqQuestionBase):
    pass


class McqQuestionUpdate(BaseModel):
    prompt:             Optional[str]      = None
    options:            Optional[list[Any]] = None
    correct_option_key: Optional[str]      = None
    sort_order:         Optional[int]      = None


class McqQuestionResponse(McqQuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


# ── McqResult ──────────────────────────────────────────────────────────────────

class McqResultBase(BaseModel):
    worker_id:         UUID
    assessment_set_id: UUID
    score_pct:         Decimal
    passed:            bool


class McqResultCreate(McqResultBase):
    pass


class McqResultResponse(McqResultBase):
    model_config = ConfigDict(from_attributes=True)
    id:           UUID
    completed_at: datetime


# ── McqResultAnswer ────────────────────────────────────────────────────────────

class McqResultAnswerBase(BaseModel):
    mcq_result_id:       UUID
    question_id:         UUID
    selected_option_key: str
    is_correct:          bool


class McqResultAnswerCreate(McqResultAnswerBase):
    pass


class McqResultAnswerResponse(McqResultAnswerBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
