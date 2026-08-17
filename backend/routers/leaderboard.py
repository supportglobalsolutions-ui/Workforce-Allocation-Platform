from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, select

from core.database import get_db
from core.permissions import require_user
from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore
from models.worker import Worker
from schemas.quality import LeaderboardResponse

router = APIRouter()


@router.get("", response_model=list[LeaderboardResponse])
def get_leaderboard(
    country: str | None = None,
    period: str = Query("calendar", pattern="^(calendar|payroll)$"),
    payroll_period_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    """Shared leaderboard (GS + partner workers) — calendar month or payroll period view."""
    stmt = (
        select(QualityCompositeScore, Worker)
        .join(Worker, Worker.id == QualityCompositeScore.worker_id)
    )

    if period == "payroll":
        target_id = payroll_period_id
        if target_id is None:
            latest = db.exec(
                select(PayrollPeriod).order_by(col(PayrollPeriod.start_date).desc())
            ).first()
            target_id = latest.id if latest else None
        if target_id:
            has_snapshot = db.exec(
                select(QualityCompositeScore.id)
                .where(QualityCompositeScore.payroll_period_id == target_id)
                .limit(1)
            ).first()
            if has_snapshot:
                stmt = stmt.where(QualityCompositeScore.payroll_period_id == target_id)
            else:
                stmt = stmt.where(
                    QualityCompositeScore.period_type == "payroll",
                    QualityCompositeScore.payroll_period_id.is_(None),
                )
        else:
            stmt = stmt.where(QualityCompositeScore.period_type == "payroll")
    else:
        tagged_exists = db.exec(
            select(QualityCompositeScore.id)
            .where(QualityCompositeScore.period_type == period)
            .limit(1)
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
            payroll_period_id=score.payroll_period_id,
            global_rank=score.global_rank,
            country_rank=score.country_rank,
            session_streak_days=score.session_streak_days,
            calculated_at=score.calculated_at,
        )
        for score, worker in rows
    ]
