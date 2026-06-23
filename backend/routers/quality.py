from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.permissions import require_admin, require_user
from models.quality import QualityCompositeScore, QualityIndicator, QualityIndicatorRating
from schemas.quality import (
    QualityCompositeScoreResponse,
    QualityIndicatorCreate,
    QualityIndicatorRatingCreate,
    QualityIndicatorRatingResponse,
    QualityIndicatorRatingUpdate,
    QualityIndicatorResponse,
    QualityIndicatorUpdate,
)
from .deps import apply_update, get_worker_for_user

router = APIRouter()


@router.get("/me", response_model=QualityCompositeScoreResponse | None)
def get_my_quality_score(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    score = (
        db.query(QualityCompositeScore)
        .filter(QualityCompositeScore.worker_id == worker.id)
        .order_by(QualityCompositeScore.calculated_at.desc())
        .first()
    )
    return score


@router.get("/indicators", response_model=list[QualityIndicatorResponse])
def list_quality_indicators(
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    return db.query(QualityIndicator).order_by(QualityIndicator.code).all()


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
    indicator = db.query(QualityIndicator).filter(QualityIndicator.id == indicator_id).first()
    if not indicator:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quality indicator not found")

    apply_update(indicator, body)
    db.commit()
    db.refresh(indicator)
    return indicator


@router.get("/ratings", response_model=list[QualityIndicatorRatingResponse])
def list_quality_ratings(
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    query = db.query(QualityIndicatorRating)
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        query = query.filter(QualityIndicatorRating.worker_id == worker.id)
    elif worker_id:
        query = query.filter(QualityIndicatorRating.worker_id == worker_id)
    return query.order_by(QualityIndicatorRating.created_at.desc()).all()


@router.post("/ratings", response_model=QualityIndicatorRatingResponse, status_code=status.HTTP_201_CREATED)
def create_quality_rating(
    body: QualityIndicatorRatingCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rating = QualityIndicatorRating(**body.model_dump())
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.patch("/ratings/{rating_id}", response_model=QualityIndicatorRatingResponse)
def update_quality_rating(
    rating_id: UUID,
    body: QualityIndicatorRatingUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rating = db.query(QualityIndicatorRating).filter(QualityIndicatorRating.id == rating_id).first()
    if not rating:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quality rating not found")

    apply_update(rating, body)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/scores", response_model=list[QualityCompositeScoreResponse])
def list_quality_scores(
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    query = db.query(QualityCompositeScore)
    if worker_id:
        query = query.filter(QualityCompositeScore.worker_id == worker_id)
    return query.order_by(QualityCompositeScore.calculated_at.desc()).all()
