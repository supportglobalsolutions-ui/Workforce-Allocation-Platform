import uuid
from sqlalchemy import Column, String, Text, Numeric, SmallInteger, Boolean, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID
from .types import TIMESTAMPTZ
from sqlalchemy.orm import relationship

from .base import Base
from .enums import IndicatorInputType
from .mixins import CreatedAtMixin


class QualityIndicator(Base):
    """
    Extensible indicator definitions. Adding a new indicator requires only a new row,
    not a schema change.

    MVP indicators:
      - mcq_assessment:  50% of total score (auto, from MCQ results)
      - organisation:    configurable share of subjective 50% (auto, session punctuality)
      - communication:   configurable share of subjective 50% (manual, mandatory reason note)
    """
    __tablename__ = "quality_indicators"

    id                       = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    code                     = Column(String(64), unique=True, nullable=False)
    name                     = Column(String(128), nullable=False)
    description              = Column(Text, nullable=True)
    weight_in_subjective_pool = Column(Numeric(5, 2), nullable=False)
    input_mode               = Column(IndicatorInputType, nullable=False)
    scale_min                = Column(SmallInteger, nullable=False)
    scale_max                = Column(SmallInteger, nullable=False)
    is_active                = Column(Boolean, nullable=False, default=True)

    ratings = relationship("QualityIndicatorRating", back_populates="indicator")


class QualityIndicatorRating(Base, CreatedAtMixin):
    """
    Individual quality rating per worker per indicator.
    reason_note is mandatory for manual (admin-entered) ratings — enforced at
    application layer; nullable at DB level to allow auto-computed rows.
    """
    __tablename__ = "quality_indicator_ratings"

    id           = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id    = Column(UUID(as_uuid=True), ForeignKey("workers.id"),            nullable=False, index=True)
    indicator_id = Column(UUID(as_uuid=True), ForeignKey("quality_indicators.id"), nullable=False)
    score        = Column(Numeric(5, 2), nullable=False)
    reason_note  = Column(Text, nullable=True)   # mandatory for manual ratings at app layer
    rated_by     = Column(UUID(as_uuid=True), ForeignKey("admin_users.id"),        nullable=False)
    session_id   = Column(UUID(as_uuid=True), ForeignKey("sessions.id"),           nullable=True)

    # Relationships
    worker       = relationship("Worker",           back_populates="quality_ratings")
    indicator    = relationship("QualityIndicator", back_populates="ratings")
    rated_by_user = relationship("AdminUser",       back_populates="quality_ratings", foreign_keys=[rated_by])
    session      = relationship("Session",          back_populates="quality_ratings")


class QualityCompositeScore(Base):
    """Periodic snapshot of a worker's 50/50 composite quality score."""
    __tablename__ = "quality_composite_scores"

    id                   = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    worker_id            = Column(UUID(as_uuid=True), ForeignKey("workers.id"), nullable=False, index=True)
    mcq_component        = Column(Numeric(5, 2), nullable=False)
    subjective_component = Column(Numeric(5, 2), nullable=False)
    composite_score      = Column(Numeric(5, 2), nullable=False)
    country_rank         = Column(SmallInteger,  nullable=True)
    global_rank          = Column(SmallInteger,  nullable=True)
    session_streak_days  = Column(SmallInteger,  nullable=True)
    calculated_at        = Column(TIMESTAMPTZ, nullable=False, server_default=text("now()"))

    worker = relationship("Worker", back_populates="composite_scores")
