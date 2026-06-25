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
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    stmt = (
        select(QualityCompositeScore, Worker)
        .join(Worker, Worker.id == QualityCompositeScore.worker_id)
    )
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
            composite_score=score.composite_score,
            global_rank=score.global_rank,
            country_rank=score.country_rank,
            session_streak_days=score.session_streak_days,
            calculated_at=score.calculated_at,
        )
        for score, worker in rows
    ]
