from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_user
from models.quality import QualityCompositeScore
from models.worker import Worker
from schemas.quality import LeaderboardResponse

router = APIRouter()


@router.get("", response_model=list[LeaderboardResponse])
def get_leaderboard(
    country: str | None = None,
    period: str = Query("calendar", pattern="^(calendar|payroll)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    """Shared leaderboard (GS + partner workers) — calendar month or payroll period view."""
    stmt = (
        select(QualityCompositeScore, Worker)
        .join(Worker, Worker.id == QualityCompositeScore.worker_id)
    )
    # Rows tagged with a period_type belong to the dual-view engine; untagged
    # legacy rows are only used when no tagged rows exist for that view.
    tagged_exists = db.exec(
        select(QualityCompositeScore.id).where(QualityCompositeScore.period_type == period).limit(1)
    ).first()
    if tagged_exists:
        stmt = stmt.where(QualityCompositeScore.period_type == period)
    if country:
        stmt = stmt.where(Worker.country == country)

    stmt = stmt.order_by(
        QualityCompositeScore.global_rank.asc().nullslast(),
        QualityCompositeScore.composite_score.desc(),
    ).limit(limit)

    rows = db.exec(stmt).all()

    return [
        LeaderboardResponse(
            id=score.id,
            worker_id=score.worker_id,
            worker_display_name=worker.display_name,
            worker_country=worker.country,
            worker_type=worker.worker_type.value if worker.worker_type else None,
            composite_score=score.composite_score,
            assessment_component=score.assessment_component,
            rating_component=score.rating_component,
            reliability_component=score.reliability_component,
            consistency_component=score.consistency_component,
            period_type=score.period_type,
            period_label=score.period_label,
            global_rank=score.global_rank,
            country_rank=score.country_rank,
            session_streak_days=score.session_streak_days,
            calculated_at=score.calculated_at,
        )
        for score, worker in rows
    ]
