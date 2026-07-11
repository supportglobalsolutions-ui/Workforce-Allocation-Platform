from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from core.database import get_db
from core.firebase_admin import ban_firebase_user, unban_firebase_user, get_firebase_user
from core.auth_errors import http_error_from_firebase
from core.permissions import require_admin, require_user
from core.security import get_current_user
from models.admin_users import AdminUser
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
    workers = db.exec(
        select(Worker).options(selectinload(Worker.admin_user)).order_by(Worker.display_name)
    ).all()
    result = []
    for w in workers:
        resp = WorkerResponse.model_validate(w)
        if w.admin_user:
            resp = resp.model_copy(update={"email": w.admin_user.email})
        result.append(resp)
    return result


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


def _get_worker_firebase_uid(worker_id: UUID, db: Session, current_user: dict) -> tuple[Worker, str]:
    """Fetch worker + linked firebase_uid, enforce admin-cannot-modify-super_admin."""
    worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")

    if not worker.admin_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This worker does not have a linked system account.",
        )

    admin_user = db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Linked system account not found.",
        )

    try:
        fb_user = get_firebase_user(admin_user.firebase_uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    target_role = (fb_user.custom_claims or {}).get("role", "user")
    if current_user.get("role") == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify Super Admin accounts.",
        )

    return worker, admin_user.firebase_uid


@router.patch("/{worker_id}/ban")
def ban_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Ban a worker's Firebase account — prevents login."""
    _, firebase_uid = _get_worker_firebase_uid(worker_id, db, current_user)
    try:
        ban_firebase_user(firebase_uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc
    return {"banned": True}


@router.patch("/{worker_id}/unban")
def unban_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Unban a worker's Firebase account — restores login access."""
    _, firebase_uid = _get_worker_firebase_uid(worker_id, db, current_user)
    try:
        unban_firebase_user(firebase_uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc
    return {"banned": False}
