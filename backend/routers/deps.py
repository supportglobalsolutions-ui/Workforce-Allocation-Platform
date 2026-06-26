from datetime import date
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, SQLModel, select

from core.database import get_db
from core.security import get_current_user
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.worker import Worker

# Auth role (Firebase claim) -> org role stored on admin_users.role.
# admin_users.role is metadata only; it does NOT drive auth/routing.
_AUTH_TO_ORG_ROLE = {
    "super_admin": AdminRoleEnum.ceo_leadership,
    "admin": AdminRoleEnum.operations_lead,
    "user": AdminRoleEnum.technical_admin,
}


def apply_update(db_obj: Any, update: SQLModel) -> None:
    """Apply only fields explicitly set on a SQLModel update schema."""
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)


def _display_name_from(current_user: dict) -> str:
    name = (current_user.get("name") or "").strip()
    if name:
        return name
    email = current_user.get("email") or ""
    return email.split("@")[0] if email else "Unknown User"


def get_admin_user(db: Session, current_user: dict) -> AdminUser:
    """
    Resolve the admin_users row for the logged-in Firebase account, creating it
    on first access (just-in-time provisioning) so a valid Firebase login never
    has to be seeded into Postgres by hand.
    """
    admin = db.exec(
        select(AdminUser).where(AdminUser.firebase_uid == current_user["uid"])
    ).first()
    if admin:
        return admin

    admin = AdminUser(
        firebase_uid=current_user["uid"],
        email=current_user.get("email") or f"{current_user['uid']}@unknown.local",
        role=_AUTH_TO_ORG_ROLE.get(current_user.get("role", "user"), AdminRoleEnum.technical_admin),
        display_name=_display_name_from(current_user),
        status=AccountStatusEnum.active,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def get_worker_for_user(db: Session, current_user: dict) -> Worker:
    """
    Resolve the worker profile for the logged-in account, creating a minimal one
    on first access. Business fields (country / pay_tier) are placeholders an
    admin can correct later.
    """
    admin = get_admin_user(db, current_user)
    worker = db.exec(
        select(Worker).where(Worker.admin_user_id == admin.id)
    ).first()
    if worker:
        return worker

    worker = Worker(
        admin_user_id=admin.id,
        worker_type=WorkerTypeEnum.gs_registered,
        display_name=admin.display_name,
        country="Unassigned",
        pay_tier="unassigned",
        status=WorkerStatusEnum.active,
        start_date=date.today(),
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
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
