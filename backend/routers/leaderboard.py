from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.permissions import require_user
from models.quality import QualityCompositeScore
from models.worker import Worker
from schemas.quality import QualityCompositeScoreResponse

router = APIRouter()


@router.get("", response_model=list[QualityCompositeScoreResponse])
def get_leaderboard(
    country: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    query = db.query(QualityCompositeScore)
    if country:
        query = query.join(Worker, Worker.id == QualityCompositeScore.worker_id).filter(
            Worker.country == country
        )

    return (
        query.order_by(
            QualityCompositeScore.global_rank.asc().nullslast(),
            QualityCompositeScore.composite_score.desc(),
        )
        .limit(limit)
        .all()
    )
