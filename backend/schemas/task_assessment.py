from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict
from sqlmodel import SQLModel

from models.enums import TaskResultStatusEnum


class TaskAssessmentCreate(SQLModel):
    title:               str
    category:            str
    description:         str
    instructions:        str
    media_urls:          list[Any]          = []
    is_timed:            bool               = False
    time_limit_minutes:  Optional[int]      = None
    passing_score_pct:   Decimal            = Decimal("70.00")
    is_active:           bool               = True


class TaskAssessmentUpdate(SQLModel):
    title:               Optional[str]      = None
    category:            Optional[str]      = None
    description:         Optional[str]      = None
    instructions:        Optional[str]      = None
    media_urls:          Optional[list[Any]] = None
    is_timed:            Optional[bool]     = None
    time_limit_minutes:  Optional[int]      = None
    passing_score_pct:   Optional[Decimal]  = None
    is_active:           Optional[bool]     = None


class TaskAssessmentResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:                  UUID
    title:               str
    category:            str
    description:         str
    instructions:        str
    media_urls:          list[Any]
    is_timed:            bool
    time_limit_minutes:  Optional[int]
    passing_score_pct:   Decimal
    is_active:           bool
    created_by:          UUID
    created_at:          Optional[datetime]


class TaskAssessmentWithStats(TaskAssessmentResponse):
    result_count: int = 0


# ── Results ────────────────────────────────────────────────────────────────────

class TaskResultGrade(SQLModel):
    score_pct:    Decimal
    passed:       bool
    grader_notes: Optional[str] = None


class TaskResultResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:                    UUID
    task_assessment_id:    UUID
    worker_id:             UUID
    status:                TaskResultStatusEnum
    submission_notes:      Optional[str]
    submission_media_urls: Optional[list[Any]]
    score_pct:             Optional[Decimal]
    passed:                Optional[bool]
    grader_notes:          Optional[str]
    started_at:            Optional[datetime]
    submitted_at:          Optional[datetime]
    graded_at:             Optional[datetime]
    graded_by:             Optional[UUID]
    time_taken_seconds:    Optional[int]
    created_at:            Optional[datetime]


class TaskResultWithWorker(TaskResultResponse):
    worker_display_name: str = ""
    worker_country:      str = ""
