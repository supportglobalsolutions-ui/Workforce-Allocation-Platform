from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from core.auth_errors import http_error_from_firebase
from core.database import get_db
from core.firebase_admin import (
    SUPER_ADMIN_EMAIL,
    approve_firebase_user,
    ban_firebase_user,
    bootstrap_super_admin,
    create_firebase_user,
    get_firebase_user,
    get_firebase_user_by_email,
    list_firebase_users,
    register_pending_user,
    reject_firebase_user,
    set_user_role,
    unban_firebase_user,
    user_to_dict,
)
from core.permissions import ROLE_CAN_ASSIGN, require_admin, require_super_admin
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.partner import PartnerEntity
from models.worker import Worker

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    displayName: str
    role: str  # "user" | "admin" | "super_admin"


class UpdateRoleRequest(BaseModel):
    role: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    displayName: str


class ApproveUserRequest(BaseModel):
    """Approval decision: designate the account as GS Member or Partner worker."""
    worker_type: Optional[str] = None        # "gs_registered" | "partner_worker"
    partner_entity_id: Optional[UUID] = None
    country: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(body: RegisterRequest):
    """
    Public self-registration. Creates a disabled Firebase user pending admin approval.
    """
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )
    try:
        user = register_pending_user(
            email=body.email,
            password=body.password,
            display_name=body.displayName,
        )
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    return user_to_dict(user)


@router.get("/users")
def list_users(current_user: dict = Depends(require_admin)):
    """List all Firebase users. Requires admin+."""
    return list_firebase_users()


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    current_user: dict = Depends(require_admin),
):
    """
    Create a new Firebase user with a role claim.
    - admin       : can only create 'user' accounts
    - super_admin : can create any role
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot create accounts with role '{body.role}'.",
        )

    try:
        user = create_firebase_user(
            email=body.email,
            password=body.password,
            display_name=body.displayName,
            role=body.role,
        )
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    return {
        "uid": user.uid,
        "email": user.email,
        "displayName": user.display_name,
        "role": body.role,
        "status": "approved",
        "disabled": False,
    }


@router.patch("/users/{uid}/approve")
def approve_user(
    uid: str,
    body: ApproveUserRequest | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Enable a pending account so the user can sign in, and (optionally) provision
    the worker profile as a GS Member or Partner worker in the same step.
    New workers start with work_ready=false until onboarding training is done.
    """
    body = body or ApproveUserRequest()

    worker_type: Optional[WorkerTypeEnum] = None
    if body.worker_type:
        try:
            worker_type = WorkerTypeEnum(body.worker_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid worker type.")
        if worker_type == WorkerTypeEnum.partner_worker:
            if not body.partner_entity_id:
                raise HTTPException(
                    status_code=400,
                    detail="Select the partner company for a partner worker.",
                )
            if not db.get(PartnerEntity, body.partner_entity_id):
                raise HTTPException(status_code=404, detail="Partner company not found.")

    try:
        user = approve_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    # Eagerly provision admin_users + workers so the admin can finish the
    # profile immediately instead of waiting for the worker's first login.
    if worker_type is not None:
        admin_row = db.exec(select(AdminUser).where(AdminUser.firebase_uid == uid)).first()
        if not admin_row:
            admin_row = AdminUser(
                firebase_uid=uid,
                email=user.email or f"{uid}@unknown.local",
                role=AdminRoleEnum.technical_admin,
                display_name=user.display_name or (user.email or "").split("@")[0] or "New Worker",
                status=AccountStatusEnum.active,
            )
            db.add(admin_row)
            db.commit()
            db.refresh(admin_row)

        worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_row.id)).first()
        if not worker:
            worker = Worker(
                admin_user_id=admin_row.id,
                worker_type=worker_type,
                partner_entity_id=body.partner_entity_id if worker_type == WorkerTypeEnum.partner_worker else None,
                display_name=admin_row.display_name,
                country=body.country or "Unassigned",
                pay_tier="unassigned",
                status=WorkerStatusEnum.active,
                start_date=date.today(),
                work_ready=False,
            )
        else:
            worker.worker_type = worker_type
            worker.partner_entity_id = (
                body.partner_entity_id if worker_type == WorkerTypeEnum.partner_worker else None
            )
            if body.country:
                worker.country = body.country
        db.add(worker)
        db.commit()

    return user_to_dict(user)


@router.patch("/users/{uid}/reject")
def reject_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Reject and disable a pending account request."""
    try:
        user = reject_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc
    return user_to_dict(user)


@router.patch("/users/{uid}/role")
def update_user_role(
    uid: str,
    body: UpdateRoleRequest,
    current_user: dict = Depends(require_admin),
):
    """
    Update the role of an existing user.
    - admin       : cannot elevate (no elevation rights per policy)
    - super_admin : can set any role
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot assign role '{body.role}'.",
        )

    try:
        set_user_role(uid, body.role)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    return {"uid": uid, "role": body.role}


@router.get("/account-status")
def get_account_status(email: str):
    """
    Public endpoint — returns only the account status (banned/pending/rejected/approved).
    Used by the login page to show the correct error message when Firebase says 'user-disabled'.
    """
    try:
        user = get_firebase_user_by_email(email)
    except Exception:
        return {"status": "not_found"}
    claims = user.custom_claims or {}
    status = claims.get("status", "approved" if not user.disabled else "pending")
    return {"status": status}


@router.patch("/users/{uid}/ban")
def ban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Disable a user's account and mark it as banned. Admins cannot ban super_admins."""
    try:
        target = get_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    target_role = (target.custom_claims or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot ban Super Admin accounts.",
        )

    try:
        user = ban_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc
    return user_to_dict(user)


@router.patch("/users/{uid}/unban")
def unban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Re-enable a previously banned account."""
    try:
        target = get_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc

    target_role = (target.custom_claims or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify Super Admin accounts.",
        )

    try:
        user = unban_firebase_user(uid)
    except Exception as exc:
        raise http_error_from_firebase(exc) from exc
    return user_to_dict(user)


@router.post("/bootstrap-super-admin")
def bootstrap(current_user: dict = Depends(require_super_admin)):
    """
    Idempotent: ensures support.globalsolutions@gmail.com has the super_admin claim.
    Only callable by an existing super_admin. Run once after initial Firebase setup.
    """
    try:
        return bootstrap_super_admin()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
