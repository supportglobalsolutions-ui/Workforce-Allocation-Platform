from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import WorkerStatusEnum
from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore, QualityIndicator, QualityIndicatorRating
from models.worker import Worker
from schemas.quality import (
    PendingRatingWorker,
    PendingRatingsResponse,
    QualityCompositeScoreResponse,
    QualityIndicatorCreate,
    QualityIndicatorRatingCreate,
    QualityIndicatorRatingResponse,
    QualityIndicatorRatingUpdate,
    QualityIndicatorResponse,
    QualityIndicatorUpdate,
)
from services import quality_engine
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _latest_payroll_period(db: Session) -> PayrollPeriod | None:
    return db.exec(select(PayrollPeriod).order_by(PayrollPeriod.start_date.desc())).first()


@router.get("/me", response_model=QualityCompositeScoreResponse | None)
def get_my_quality_score(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return db.exec(
        select(QualityCompositeScore)
        .where(QualityCompositeScore.worker_id == worker.id)
        .order_by(QualityCompositeScore.calculated_at.desc())
    ).first()


@router.get("/indicators", response_model=list[QualityIndicatorResponse])
def list_quality_indicators(
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    return db.exec(select(QualityIndicator).order_by(QualityIndicator.code)).all()


@router.post("/indicators", response_model=QualityIndicatorResponse, status_code=status.HTTP_201_CREATED)
def create_quality_indicator(
    body: QualityIndicatorCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    indicator = QualityIndicator(**body.model_dump())
    db.add(indicator)
    db.commit()
    db.refresh(indicator)
    return indicator


@router.patch("/indicators/{indicator_id}", response_model=QualityIndicatorResponse)
def update_quality_indicator(
    indicator_id: UUID,
    body: QualityIndicatorUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    indicator = db.exec(select(QualityIndicator).where(QualityIndicator.id == indicator_id)).first()
    if not indicator:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quality indicator not found")

    apply_update(indicator, body)
    db.add(indicator)
    db.commit()
    db.refresh(indicator)
    return indicator


@router.get("/ratings", response_model=list[QualityIndicatorRatingResponse])
def list_quality_ratings(
    worker_id: UUID | None = None,
    payroll_period_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = select(QualityIndicatorRating)
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        stmt = stmt.where(QualityIndicatorRating.worker_id == worker.id)
    elif worker_id:
        stmt = stmt.where(QualityIndicatorRating.worker_id == worker_id)
    if payroll_period_id:
        stmt = stmt.where(QualityIndicatorRating.payroll_period_id == payroll_period_id)
    return db.exec(stmt.order_by(QualityIndicatorRating.created_at.desc())).all()


@router.get("/pending-ratings", response_model=PendingRatingsResponse)
def list_pending_ratings(
    payroll_period_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Workers still missing an admin overall rating for the given (or latest) payroll period."""
    period = db.get(PayrollPeriod, payroll_period_id) if payroll_period_id else _latest_payroll_period(db)
    if not period:
        raise HTTPException(status_code=404, detail="No payroll period found.")

    indicator = quality_engine.ensure_default_indicator(db)
    rated_ids = {
        r.worker_id
        for r in db.exec(
            select(QualityIndicatorRating).where(
                QualityIndicatorRating.indicator_id == indicator.id,
                QualityIndicatorRating.payroll_period_id == period.id,
            )
        ).all()
    }

    workers = db.exec(
        select(Worker)
        .where(Worker.status == WorkerStatusEnum.active)
        .order_by(Worker.display_name)
    ).all()

    pending = [
        PendingRatingWorker(
            worker_id=w.id,
            display_name=w.display_name,
            country=w.country or "",
            worker_type=w.worker_type.value if hasattr(w.worker_type, "value") else str(w.worker_type),
        )
        for w in workers
        if w.id not in rated_ids
    ]
    return PendingRatingsResponse(
        payroll_period_id=period.id,
        period_label=period.label,
        pending=pending,
        rated_count=len(rated_ids),
        total_workers=len(workers),
    )


@router.post("/ratings", response_model=QualityIndicatorRatingResponse, status_code=status.HTTP_201_CREATED)
def create_quality_rating(
    body: QualityIndicatorRatingCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    indicator = db.get(QualityIndicator, body.indicator_id)
    if not indicator:
        raise HTTPException(status_code=404, detail="Quality indicator not found")
    if not (indicator.scale_min <= body.score <= indicator.scale_max):
        raise HTTPException(
            status_code=400,
            detail=f"Score must be between {indicator.scale_min} and {indicator.scale_max}.",
        )

    period_id = body.payroll_period_id
    if period_id is None:
        latest = _latest_payroll_period(db)
        if latest:
            period_id = latest.id
    elif not db.get(PayrollPeriod, period_id):
        raise HTTPException(status_code=404, detail="Payroll period not found")

    admin = get_admin_user(db, current_user)

    # One overall rating per worker per payroll period — update if it already exists.
    if period_id is not None:
        existing = db.exec(
            select(QualityIndicatorRating).where(
                QualityIndicatorRating.worker_id == body.worker_id,
                QualityIndicatorRating.indicator_id == body.indicator_id,
                QualityIndicatorRating.payroll_period_id == period_id,
            )
        ).first()
        if existing:
            existing.score = body.score
            existing.reason_note = body.reason_note
            existing.rated_by = admin.id
            db.add(existing)
            db.commit()
            db.refresh(existing)
            return existing

    rating = QualityIndicatorRating(
        worker_id=body.worker_id,
        indicator_id=body.indicator_id,
        score=body.score,
        reason_note=body.reason_note,
        session_id=body.session_id,
        payroll_period_id=period_id,
        rated_by=admin.id,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/default-indicator", response_model=QualityIndicatorResponse)
def get_default_indicator(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """The 1-5 'Admin Overall Rating' indicator (created on first use)."""
    return quality_engine.ensure_default_indicator(db)


@router.post("/recalculate")
def recalculate_scores(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Recompute both leaderboard views (calendar month + payroll period)."""
    return quality_engine.recalculate_all(db)


@router.patch("/ratings/{rating_id}", response_model=QualityIndicatorRatingResponse)
def update_quality_rating(
    rating_id: UUID,
    body: QualityIndicatorRatingUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rating = db.exec(select(QualityIndicatorRating).where(QualityIndicatorRating.id == rating_id)).first()
    if not rating:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quality rating not found")

    apply_update(rating, body)
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/scores", response_model=list[QualityCompositeScoreResponse])
def list_quality_scores(
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(QualityCompositeScore)
    if worker_id:
        stmt = stmt.where(QualityCompositeScore.worker_id == worker_id)
    return db.exec(stmt.order_by(QualityCompositeScore.calculated_at.desc())).all()
