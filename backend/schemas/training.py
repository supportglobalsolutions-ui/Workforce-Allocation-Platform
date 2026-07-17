from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator
from sqlmodel import SQLModel

from models.enums import TrainingProgressEnum


class TrainingLessonBase(SQLModel):
    title:        str
    content_type: str = "text"  # text | link | video | pdf
    content:      Optional[str] = None
    media_url:    Optional[str] = None
    sort_order:   int = 0


class TrainingLessonCreate(TrainingLessonBase):
    module_id: UUID


class TrainingLessonUpdate(SQLModel):
    title:        Optional[str] = None
    content_type: Optional[str] = None
    content:      Optional[str] = None
    media_url:    Optional[str] = None
    sort_order:   Optional[int] = None


class TrainingLessonResponse(TrainingLessonBase):
    model_config = ConfigDict(from_attributes=True)
    id:        UUID
    module_id: UUID


class TrainingModuleBase(SQLModel):
    title:                        str
    description:                  Optional[str] = None
    mcq_set_id:                   Optional[UUID] = None
    task_assessment_id:           Optional[UUID] = None
    is_mandatory_for_new_workers: bool = False
    is_active:                    bool = True


class TrainingModuleCreate(TrainingModuleBase):
    pass


class TrainingModuleUpdate(SQLModel):
    title:                        Optional[str]  = None
    description:                  Optional[str]  = None
    mcq_set_id:                   Optional[UUID] = None
    task_assessment_id:           Optional[UUID] = None
    is_mandatory_for_new_workers: Optional[bool] = None
    is_active:                    Optional[bool] = None


class TrainingModuleResponse(TrainingModuleBase):
    model_config = ConfigDict(from_attributes=True)
    id:         UUID
    created_at: datetime
    lessons:    list[TrainingLessonResponse] = []
    # Present when returned for a specific worker.
    progress_status:       Optional[TrainingProgressEnum] = None
    completed_lesson_ids:  list[Any] = []

    @field_validator("completed_lesson_ids", mode="before")
    @classmethod
    def _default_ids(cls, v: Any) -> list[Any]:
        return v if isinstance(v, list) else []


class TrainingProgressResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)
    id:                   UUID
    module_id:            UUID
    worker_id:            UUID
    status:               TrainingProgressEnum
    completed_lesson_ids: list[Any] = []
    started_at:           Optional[datetime] = None
    completed_at:         Optional[datetime] = None

    @field_validator("completed_lesson_ids", mode="before")
    @classmethod
    def _default_ids(cls, v: Any) -> list[Any]:
        return v if isinstance(v, list) else []
