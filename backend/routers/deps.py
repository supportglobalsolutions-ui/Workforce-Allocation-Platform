from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, SQLModel, select

from core.database import get_db
from core.security import get_current_user
from models.admin_users import AdminUser
from models.worker import Worker


def apply_update(db_obj: Any, update: SQLModel) -> None:
    """Apply only fields explicitly set on a SQLModel update schema."""
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)


def get_admin_user(db: Session, current_user: dict) -> AdminUser:
    admin = db.exec(
        select(AdminUser).where(AdminUser.firebase_uid == current_user["uid"])
    ).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin user not found for this Firebase account",
        )
    return admin


def get_worker_for_user(db: Session, current_user: dict) -> Worker:
    admin = get_admin_user(db, current_user)
    worker = db.exec(
        select(Worker).where(Worker.admin_user_id == admin.id)
    ).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker profile not found for this account",
        )
    return worker


def require_worker_or_admin(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> Worker:
    if current_user.get("role") in {"admin", "super_admin"}:
        worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
        if not worker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
        return worker

    worker = get_worker_for_user(db, current_user)
    if worker.id != worker_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your worker profile")
    return worker
