from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from core.security import get_current_user
from models.worker import Worker
from schemas.worker import WorkerCreate, WorkerResponse, WorkerUpdate
from .deps import apply_update, get_worker_for_user

router = APIRouter()


@router.get("/me", response_model=WorkerResponse)
def get_my_worker(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    return get_worker_for_user(db, current_user)


@router.patch("/me", response_model=WorkerResponse)
def update_my_worker(
    body: WorkerUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    apply_update(worker, body)
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@router.get("", response_model=list[WorkerResponse])
def list_workers(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(select(Worker).order_by(Worker.display_name)).all()


@router.get("/{worker_id}", response_model=WorkerResponse)
def get_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") in {"admin", "super_admin"}:
        worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    else:
        worker = get_worker_for_user(db, current_user)
        if worker.id != worker_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your worker profile")

    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
    return worker


@router.post("", response_model=WorkerResponse, status_code=status.HTTP_201_CREATED)
def create_worker(
    body: WorkerCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    worker = Worker(**body.model_dump())
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker


@router.patch("/{worker_id}", response_model=WorkerResponse)
def update_worker(
    worker_id: UUID,
    body: WorkerUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")

    apply_update(worker, body)
    db.add(worker)
    db.commit()
    db.refresh(worker)
    return worker
