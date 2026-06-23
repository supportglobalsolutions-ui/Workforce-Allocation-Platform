from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.permissions import require_admin, require_user
from models.shift import Shift
from schemas.shift import ShiftCreate, ShiftResponse, ShiftUpdate
from .deps import apply_update, get_worker_for_user

router = APIRouter()


def _scoped_shifts_query(db: Session, current_user: dict):
    query = db.query(Shift)
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        query = query.filter(Shift.worker_id == worker.id)
    return query


@router.get("", response_model=list[ShiftResponse])
def list_shifts(
    status_filter: Optional[str] = Query(None, alias="status"),
    upcoming: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    query = _scoped_shifts_query(db, current_user)
    if status_filter:
        query = query.filter(Shift.status == status_filter)
    if upcoming:
        query = query.filter(Shift.scheduled_start >= datetime.utcnow())
    return query.order_by(Shift.scheduled_start).all()


@router.get("/{shift_id}", response_model=ShiftResponse)
def get_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    shift = _scoped_shifts_query(db, current_user).filter(Shift.id == shift_id).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return shift


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
def create_shift(
    body: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        if body.worker_id != worker.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers may only submit shifts for themselves",
            )

    shift = Shift(**body.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.patch("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: UUID,
    body: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") in {"admin", "super_admin"}:
        shift = db.query(Shift).filter(Shift.id == shift_id).first()
    else:
        worker = get_worker_for_user(db, current_user)
        shift = (
            db.query(Shift)
            .filter(Shift.id == shift_id, Shift.worker_id == worker.id)
            .first()
        )

    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    if current_user.get("role") not in {"admin", "super_admin"}:
        restricted = {"status", "approved_by", "approved_at", "rejection_reason"}
        if restricted & body.model_dump(exclude_unset=True).keys():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers cannot approve or reject shifts",
            )

    apply_update(shift, body)
    db.commit()
    db.refresh(shift)
    return shift
