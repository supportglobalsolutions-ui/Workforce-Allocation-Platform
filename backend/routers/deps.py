from datetime import date
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlmodel import Session, SQLModel, select

from core.config import settings
from core.database import get_db
from core.permissions import STAFF_ROLES
from core.security import get_current_user
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.worker import Worker

# Auth role (Supabase claim) -> org role stored on admin_users.role.
# admin_users.role is metadata only; it does NOT drive auth/routing.
_AUTH_TO_ORG_ROLE = {
    "super_admin": AdminRoleEnum.ceo_leadership,
    "executive": AdminRoleEnum.ceo_leadership,
    "admin": AdminRoleEnum.operations_lead,
    "user": AdminRoleEnum.technical_admin,
    "partner": AdminRoleEnum.technical_admin,
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
    Resolve the admin_users row for the logged-in Supabase account, creating it
    on first access (just-in-time provisioning) so a valid Supabase login never
    has to be seeded into Postgres by hand.
    """
    uid = current_user["uid"]
    admin = db.exec(
        select(AdminUser).where(AdminUser.auth_user_id == uid)
    ).first()
    if admin:
        email = (admin.email or current_user.get("email") or "").strip().lower()
        if email in settings.protected_super_admin_emails and not admin.is_protected:
            admin.is_protected = True
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return admin

    email = (current_user.get("email") or f"{uid}@unknown.local").strip().lower()
    by_email = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
    if by_email:
        # Same person, new auth id (re-created Supabase user) — reattach.
        by_email.auth_user_id = uid
        if by_email.status != AccountStatusEnum.active:
            by_email.status = AccountStatusEnum.active
        db.add(by_email)
        db.commit()
        db.refresh(by_email)
        return by_email

    admin = AdminUser(
        auth_user_id=uid,
        email=email,
        role=_AUTH_TO_ORG_ROLE.get(current_user.get("role", "user"), AdminRoleEnum.technical_admin),
        display_name=_display_name_from(current_user),
        status=AccountStatusEnum.active,
        is_protected=email in settings.protected_super_admin_emails,
    )
    db.add(admin)
    try:
        db.commit()
    except Exception:
        db.rollback()
        # Race or leftover unique conflict — return whatever row now matches.
        admin = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
        if not admin:
            admin = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        if not admin:
            raise
        return admin
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
    if current_user.get("role") in STAFF_ROLES:
        worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
        if not worker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
        return worker

    worker = get_worker_for_user(db, current_user)
    if worker.id != worker_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your worker profile")
    return worker
