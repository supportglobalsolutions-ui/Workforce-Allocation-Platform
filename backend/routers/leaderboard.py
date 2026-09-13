from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, select

from core.database import get_db
from core.permissions import require_user
from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore
from models.worker import Worker
from schemas.quality import LeaderboardResponse
from .deps import get_worker_for_user

router = APIRouter()

_ANON_UUID = UUID("00000000-0000-0000-0000-000000000000")


@router.get("", response_model=list[LeaderboardResponse])
def get_leaderboard(
    country: str | None = None,
    period: str = Query("calendar", pattern="^(calendar|payroll|all)$"),
    payroll_period_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """
    Shared leaderboard (GS + partner workers) — calendar month, payroll period,
    or all-time.

    Only admins see who the other workers are. A worker sees their own row
    named and every other row anonymised, so they can still see where they
    rank without learning colleagues' identities.
    """
    is_admin = current_user.get("role") in {"admin", "super_admin"}
    viewer_worker_id: UUID | None = None
    if not is_admin:
        try:
            viewer_worker_id = get_worker_for_user(db, current_user).id
        except Exception:
            viewer_worker_id = None
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

    def _is_self(score_worker_id: UUID) -> bool:
        return viewer_worker_id is not None and score_worker_id == viewer_worker_id

    def _label(rank: int | None, idx: int) -> str:
        """Placeholder name for a worker the viewer may not identify."""
        return f"Worker #{rank if rank is not None else idx + 1}"

    return [
        LeaderboardResponse(
            id=score.id,
            # Other workers' ids are withheld so rows cannot be correlated
            # back to a person.
            worker_id=(
                score.worker_id
                if (is_admin or _is_self(score.worker_id))
                else _ANON_UUID
            ),
            worker_display_name=(
                worker.display_name
                if (is_admin or _is_self(score.worker_id))
                else _label(score.global_rank, idx)
            ),
            worker_country=(
                worker.country
                if (is_admin or _is_self(score.worker_id))
                else ""
            ),
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
        for idx, (score, worker) in enumerate(rows)
    ]
