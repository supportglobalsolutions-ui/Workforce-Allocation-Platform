from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from .worker import Worker


class QualityScoreBase(SQLModel):
    worker_id: UUID = Field(foreign_key="workers.id", index=True)
    period_start: datetime
    period_end: datetime
    assessment_score: float = Field(ge=0, le=100)
    subjective_score: float = Field(ge=0, le=100)
    notes: Optional[str] = Field(default=None, max_length=500)


class QualityScore(QualityScoreBase, table=True):
    __tablename__ = "quality_scores"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    composite_score: float = Field(ge=0, le=100)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    worker: Optional["Worker"] = Relationship(back_populates="quality_scores")

    @classmethod
    def compute_composite(cls, assessment: float, subjective: float) -> float:
        return round(assessment * 0.5 + subjective * 0.5, 2)


class QualityScoreCreate(QualityScoreBase):
    pass


class QualityScoreRead(QualityScoreBase):
    id: UUID
    composite_score: float
    created_at: datetime


class QualityScoreUpdate(SQLModel):
    assessment_score: Optional[float] = None
    subjective_score: Optional[float] = None
    notes: Optional[str] = None
