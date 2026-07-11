import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import TaskResultStatusEnum, TaskResultStatusType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .worker import Worker


class TaskAssessment(SQLModel, table=True):
    __tablename__ = "task_assessments"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    category: str = Field(sa_column=Column(String(128), nullable=False))
    description: str = Field(sa_column=Column(Text, nullable=False))
    instructions: str = Field(sa_column=Column(Text, nullable=False))
    # [{type: 'image'|'video', url: str, name: str, storage_path: str}]
    media_urls: Optional[list[Any]] = Field(
        default=None,
        sa_column=Column(JSONB, nullable=False, server_default="'[]'::jsonb"),
    )
    is_timed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    time_limit_minutes: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    passing_score_pct: Decimal = Field(
        default=Decimal("70.00"),
        sa_column=Column(Numeric(5, 2), nullable=False, server_default="70.00"),
    )
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True))
    created_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    creator: Optional["AdminUser"] = Relationship(back_populates="created_task_assessments")
    results: list["TaskAssessmentResult"] = Relationship(
        back_populates="task_assessment",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class TaskAssessmentResult(SQLModel, table=True):
    __tablename__ = "task_assessment_results"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    task_assessment_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("task_assessments.id"), nullable=False, index=True),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    status: TaskResultStatusEnum = Field(
        default=TaskResultStatusEnum.pending,
        sa_column=Column(TaskResultStatusType, nullable=False),
    )
    submission_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # [{type: 'image'|'video', url: str, name: str, storage_path: str}]
    submission_media_urls: Optional[list[Any]] = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    score_pct: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))
    passed: Optional[bool] = Field(default=None, sa_column=Column(Boolean, nullable=True))
    grader_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    started_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    submitted_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    graded_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    graded_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    time_taken_seconds: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    task_assessment: Optional["TaskAssessment"] = Relationship(back_populates="results")
    worker: Optional["Worker"] = Relationship(
        back_populates="task_results",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessmentResult.worker_id]"},
    )
    grader: Optional["AdminUser"] = Relationship(
        back_populates="graded_task_results",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessmentResult.graded_by]"},
    )
