import uuid
from sqlalchemy import Column, String, Text, Numeric, Integer, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .types import TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base


class McqAssessmentSet(Base):
    __tablename__ = "mcq_assessment_sets"

    id                = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    title             = Column(String(255), nullable=False)
    category          = Column(String(128), nullable=False)
    passing_score_pct = Column(Numeric(5, 2), nullable=False)
    is_active         = Column(Boolean, nullable=False, default=True)
    created_by        = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"), nullable=False)

    creator   = relationship("AdminUser", back_populates="created_assessments")
    questions = relationship("McqQuestion", back_populates="assessment_set", cascade="all, delete-orphan")
    results   = relationship("McqResult",   back_populates="assessment_set")


class McqQuestion(Base):
    __tablename__ = "mcq_questions"

    id                 = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    assessment_set_id  = Column(UUID(as_uuid=True), ForeignKey("mcq_assessment_sets.id"), nullable=False, index=True)
    prompt             = Column(Text, nullable=False)
    options            = Column(JSONB, nullable=False)
    correct_option_key = Column(String(8), nullable=False)
    sort_order         = Column(Integer, nullable=False, default=0)

    assessment_set = relationship("McqAssessmentSet", back_populates="questions")
    result_answers = relationship("McqResultAnswer",  back_populates="question")


class McqResult(Base):
    __tablename__ = "mcq_results"

    id                = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id         = Column(UUID(as_uuid=True), ForeignKey("workers.id"),           nullable=False, index=True)
    assessment_set_id = Column(UUID(as_uuid=True), ForeignKey("mcq_assessment_sets.id"), nullable=False)
    score_pct         = Column(Numeric(5, 2), nullable=False)
    passed            = Column(Boolean, nullable=False)
    completed_at      = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))

    worker         = relationship("Worker",          back_populates="mcq_results")
    assessment_set = relationship("McqAssessmentSet", back_populates="results")
    answers        = relationship("McqResultAnswer",  back_populates="result", cascade="all, delete-orphan")


class McqResultAnswer(Base):
    __tablename__ = "mcq_result_answers"

    id                  = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    mcq_result_id       = Column(UUID(as_uuid=True), ForeignKey("mcq_results.id"),  nullable=False, index=True)
    question_id         = Column(UUID(as_uuid=True), ForeignKey("mcq_questions.id"), nullable=False)
    selected_option_key = Column(String(8), nullable=False)
    is_correct          = Column(Boolean, nullable=False)

    result   = relationship("McqResult",   back_populates="answers")
    question = relationship("McqQuestion", back_populates="result_answers")
