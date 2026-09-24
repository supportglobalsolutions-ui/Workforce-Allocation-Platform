import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .admin_users import AdminUser
    from .worker import Worker


class McqAssessmentSet(SQLModel, table=True):
    __tablename__ = "mcq_assessment_sets"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    title: str = Field(sa_column=Column(String(255), nullable=False))
    category: str = Field(sa_column=Column(String(128), nullable=False))
    description: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    instructions: str = Field(default="", sa_column=Column(Text, nullable=False, server_default=""))
    passing_score_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    is_timed: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    time_limit_minutes: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True))
    allow_retakes: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default="false"))
    max_attempts: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    created_by: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False),
    )

    creator: Optional["AdminUser"] = Relationship(back_populates="created_assessments")
    questions: list["McqQuestion"] = Relationship(
        back_populates="assessment_set",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    results: list["McqResult"] = Relationship(back_populates="assessment_set")


class McqQuestion(SQLModel, table=True):
    __tablename__ = "mcq_questions"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    assessment_set_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("mcq_assessment_sets.id"), nullable=False, index=True),
    )
    prompt: str = Field(sa_column=Column(Text, nullable=False))
    options: Optional[list[Any]] = Field(
        default=None, sa_column=Column(JSONB, nullable=False)
    )
    correct_option_key: str = Field(sa_column=Column(String(8), nullable=False))
    sort_order: int = Field(default=0, sa_column=Column(Integer, nullable=False, default=0))
    marks: Decimal = Field(
        default=Decimal("0"),
        sa_column=Column(Numeric(5, 2), nullable=False, server_default="0"),
    )

    assessment_set: Optional["McqAssessmentSet"] = Relationship(back_populates="questions")
    result_answers: list["McqResultAnswer"] = Relationship(back_populates="question")


class McqResult(SQLModel, table=True):
    __tablename__ = "mcq_results"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    worker_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True),
    )
    assessment_set_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("mcq_assessment_sets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    source_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), nullable=False, index=True),
    )
    title_snapshot: str = Field(sa_column=Column(String(255), nullable=False, server_default=""))
    score_pct: Decimal = Field(sa_column=Column(Numeric(5, 2), nullable=False))
    passed: bool = Field(sa_column=Column(Boolean, nullable=False))
    attempt_count: int = Field(default=1, sa_column=Column(Integer, nullable=False, server_default="1"))
    completed_at: Optional[datetime] = Field(
        default=None,
        sa_column=Column(DateTime(timezone=True), nullable=False, server_default=text("now()")),
    )

    worker: Optional["Worker"] = Relationship(back_populates="mcq_results")
    assessment_set: Optional["McqAssessmentSet"] = Relationship(back_populates="results")
    answers: list["McqResultAnswer"] = Relationship(
        back_populates="result",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class McqResultAnswer(SQLModel, table=True):
    __tablename__ = "mcq_result_answers"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")),
    )
    mcq_result_id: uuid.UUID = Field(
        sa_column=Column(PGUUID(as_uuid=True), ForeignKey("mcq_results.id"), nullable=False, index=True),
    )
    question_id: Optional[uuid.UUID] = Field(
        default=None,
        sa_column=Column(
            PGUUID(as_uuid=True),
            ForeignKey("mcq_questions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    selected_option_key: str = Field(sa_column=Column(String(8), nullable=False))
    is_correct: bool = Field(sa_column=Column(Boolean, nullable=False))
    prompt_snapshot: Optional[str] = Field(default=None, sa_column=Column(Text, nullable=True))
    options_snapshot: Optional[list[Any]] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    marks_snapshot: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(5, 2), nullable=True))

    result: Optional["McqResult"] = Relationship(back_populates="answers")
    question: Optional["McqQuestion"] = Relationship(back_populates="result_answers")
