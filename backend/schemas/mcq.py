from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel


class McqAssessmentSetBase(SQLModel):
    title:             str
    category:          str
    passing_score_pct: Decimal
    is_active:         bool = True
    allow_retakes:     bool = False
    max_attempts:      int = 1
    created_by:        UUID


class McqAssessmentSetCreate(McqAssessmentSetBase):
    pass


class McqAssessmentSetUpdate(SQLModel):
    title:             Optional[str]     = None
    category:          Optional[str]     = None
    passing_score_pct: Optional[Decimal] = None
    is_active:         Optional[bool]    = None
    allow_retakes:     Optional[bool]    = None
    max_attempts:      Optional[int]     = None


class McqAssessmentSetResponse(McqAssessmentSetBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class McqQuestionBase(SQLModel):
    assessment_set_id:  UUID
    prompt:             str
    options:            list[Any]
    correct_option_key: str
    sort_order:         int = 0
    marks:              Decimal = Decimal("0")


class McqQuestionCreate(McqQuestionBase):
    pass


class McqQuestionUpdate(SQLModel):
    prompt:             Optional[str]       = None
    options:            Optional[list[Any]] = None
    correct_option_key: Optional[str]       = None
    sort_order:         Optional[int]       = None
    marks:              Optional[Decimal]   = None


class McqQuestionResponse(McqQuestionBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID


class McqResultBase(SQLModel):
    worker_id:         UUID
    assessment_set_id: Optional[UUID] = None
    source_id:         UUID
    title_snapshot:    str = ""
    score_pct:         Decimal
    passed:            bool


class McqResultCreate(McqResultBase):
    pass


class McqResultResponse(McqResultBase):
    model_config = ConfigDict(from_attributes=True)
    id:           UUID
    completed_at: datetime


class McqResultAnswerBase(SQLModel):
    mcq_result_id:       UUID
    question_id:         Optional[UUID] = None
    selected_option_key: str
    is_correct:          bool


class McqResultAnswerCreate(McqResultAnswerBase):
    pass


class McqResultAnswerResponse(McqResultAnswerBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
