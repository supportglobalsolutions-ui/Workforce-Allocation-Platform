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
    media_urls: Optional[list[Any]] = Field(
        default=None,
        # Must be text(): a plain string is treated as a literal and gets
        # re-quoted to '''[]''::jsonb', which is not valid JSON. Matches the
        # pattern used by every other JSONB column in models/.
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    is_timed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, default=False))
    time_limit_minutes: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    passing_score_pct: Decimal = Field(
        default=Decimal("70.00"),
        sa_column=Column(Numeric(5, 2), nullable=False, server_default="70.00"),
    )
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True))
    allow_retakes: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    max_attempts: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    created_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    creator: Optional["AdminUser"] = Relationship(back_populates="created_task_assessments")
    results: list["TaskAssessmentResult"] = Relationship(back_populates="task_assessment")
    activities: list["TaskActivity"] = Relationship(
        back_populates="task_assessment",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class TaskActivity(SQLModel, table=True):
    __tablename__ = "task_activities"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    task_assessment_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("task_assessments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    prompt: str = Field(sa_column=Column(Text, nullable=False))
    max_marks: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    sort_order: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))

    task_assessment: Optional["TaskAssessment"] = Relationship(back_populates="activities")
    result_scores: list["TaskResultActivityScore"] = Relationship(back_populates="activity")


class TaskAssessmentResult(SQLModel, table=True):
    __tablename__ = "task_assessment_results"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    task_assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("task_assessments.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
    )
    source_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
    )
    title_snapshot: str = Field(sa_column=Column(String(255), nullable=False, server_default=""))
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    status: TaskResultStatusEnum = Field(
        default=TaskResultStatusEnum.pending,
        sa_column=Column(TaskResultStatusType, nullable=False),
    )
    submission_notes: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
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
    attempt_count: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    task_assessment: Optional["TaskAssessment"] = Relationship(back_populates="results")
    activity_scores: list["TaskResultActivityScore"] = Relationship(
        back_populates="result",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    worker: Optional["Worker"] = Relationship(
        back_populates="task_results",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessmentResult.worker_id]"},
    )
    grader: Optional["AdminUser"] = Relationship(
        back_populates="graded_task_results",
        sa_relationship_kwargs={"foreign_keys": "[TaskAssessmentResult.graded_by]"},
    )


class TaskResultActivityScore(SQLModel, table=True):
    __tablename__ = "task_result_activity_scores"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    result_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("task_assessment_results.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    activity_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("task_activities.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    prompt_snapshot: str = Field(sa_column=Column(Text, nullable=False))
    max_marks_snapshot: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    marks_awarded: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))

    result: Optional["TaskAssessmentResult"] = Relationship(back_populates="activity_scores")
    activity: Optional["TaskActivity"] = Relationship(back_populates="result_scores")
