import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

from .enums import TrainingProgressEnum, TrainingProgressType

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .worker import Worker


class TrainingModule(SQLModel, table=True):
    __tablename__ = "training_modules"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    # Linked assessment the worker must pass to complete the module (MCQ set or task).
    mcq_set_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("mcq_assessment_sets.id"), nullable=True),
    )
    task_assessment_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("task_assessments.id"), nullable=True),
    )
    is_mandatory_for_new_workers: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, server_default="false")
    )
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default="true"))
    created_by: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=True),
    )
    created_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), server_default=text("now()"), nullable=False),
    )

    lessons: list["TrainingLesson"] = Relationship(back_populates="module")
    progress_records: list["TrainingProgress"] = Relationship(back_populates="module")
    created_by_user: Optional["AdminUser"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "[TrainingModule.created_by]"},
    )


class TrainingLesson(SQLModel, table=True):
    __tablename__ = "training_lessons"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    module_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("training_modules.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    content_type: str = Field(sa_column=Column(String(16), nullable=False))  # text | link | video | pdf
    content: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    media_url: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    sort_order: int = Field(default=0, sa_column=Column(Integer, nullable=False, server_default="0"))

    module: Optional["TrainingModule"] = Relationship(back_populates="lessons")


class TrainingProgress(SQLModel, table=True):
    __tablename__ = "training_progress"
    __table_args__ = (
        UniqueConstraint("module_id", "worker_id", name="uq_training_progress_module_worker"),
    )

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    module_id: uuid.UUID = Field(
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("training_modules.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    status: TrainingProgressEnum = Field(
        default=TrainingProgressEnum.not_started,
        sa_column=Column(TrainingProgressType, nullable=False, server_default="not_started"),
    )
    completed_lesson_ids: list[Any] = Field(
        default_factory=list,
        sa_column=Column(JSONB, nullable=False, server_default=text("'[]'")),
    )
    started_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )
    completed_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True), nullable=True)
    )

    module: Optional["TrainingModule"] = Relationship(back_populates="progress_records")
    worker: Optional["Worker"] = Relationship(back_populates="training_progress")
