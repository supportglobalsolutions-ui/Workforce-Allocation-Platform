from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

from core.auth_errors import http_error_from_auth
from core.config import settings
from core.database import get_db
from core.supabase_auth import (
    SUPER_ADMIN_EMAIL,
    approve_auth_user,
    ban_auth_user,
    bootstrap_super_admin,
    create_auth_user,
    get_auth_user,
    get_auth_user_by_email,
    list_auth_users,
    register_pending_user,
    reject_auth_user,
    set_user_role,
    unban_auth_user,
    user_to_dict,
    verify_supabase_token,
)
from core.permissions import ROLE_CAN_ASSIGN, require_admin, require_super_admin
from core.rate_limit import check_rate_limit
from core.session_cookie import sign_session
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    EntityStatusEnum,
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
    role: str  # "user" | "partner" | "admin" | "super_admin"
    partnerEntityId: Optional[UUID] = None


class UpdateRoleRequest(BaseModel):
    role: str
    partnerEntityId: Optional[UUID] = None


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    displayName: str


class SessionTokenRequest(BaseModel):
    id_token: str


class ApproveUserRequest(BaseModel):
    """Approval decision: designate the account as GS Member or Partner worker."""
    worker_type: Optional[str] = None        # "gs_registered" | "partner_worker"
    partner_entity_id: Optional[UUID] = None
    country: Optional[str] = None


def _validate_optional_partner_entity(db: Session, role: str, entity_id: Optional[UUID]) -> Optional[str]:
    """Return partner_entity_id string for claims, or None. Raises HTTPException if invalid."""
    if role != "partner":
        return None
    if entity_id is None:
        return None
    if not db.get(PartnerEntity, entity_id):
        raise HTTPException(status_code=404, detail="Partner company not found.")
    return str(entity_id)


def _ensure_partner_entity_id(
    db: Session,
    *,
    display_name: str,
    entity_id: Optional[str],
) -> str:
    """Require a partner company id; create a Self company from the display name if missing."""
    if entity_id:
        return entity_id
    name = (display_name or "Partner").strip() or "Partner"
    existing = db.exec(select(PartnerEntity).where(PartnerEntity.name == name)).first()
    if existing:
        return str(existing.id)
    entity = PartnerEntity(name=name, status=EntityStatusEnum.active, is_self=True)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return str(entity.id)


def _ensure_login_profile(
    db: Session,
    *,
    uid: str,
    email: str,
    display_name: str,
    as_partner: bool = False,
    partner_entity_id: str | None = None,
) -> Worker:
    """Ensure admin_users + workers rows exist so partner/worker can use worker APIs / inbox."""
    from uuid import UUID as UUIDType

    admin_row = db.exec(select(AdminUser).where(AdminUser.firebase_uid == uid)).first()
    if not admin_row:
        admin_row = AdminUser(
            firebase_uid=uid,
            email=email or f"{uid}@unknown.local",
            role=AdminRoleEnum.technical_admin,
            display_name=display_name or (email or "").split("@")[0] or "Partner",
            status=AccountStatusEnum.active,
        )
        db.add(admin_row)
        db.commit()
        db.refresh(admin_row)

    worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_row.id)).first()
    entity_uuid = UUIDType(partner_entity_id) if partner_entity_id else None

    if not worker:
        worker = Worker(
            admin_user_id=admin_row.id,
            worker_type=WorkerTypeEnum.partner_worker if as_partner else WorkerTypeEnum.gs_registered,
            partner_entity_id=entity_uuid if as_partner else None,
            display_name=admin_row.display_name,
            country="Unassigned",
            pay_tier="unassigned",
            status=WorkerStatusEnum.active,
            start_date=date.today(),
            work_ready=False,
        )
        db.add(worker)
        db.commit()
        db.refresh(worker)
    elif as_partner:
        worker.worker_type = WorkerTypeEnum.partner_worker
        if entity_uuid:
            worker.partner_entity_id = entity_uuid
        if not worker.partner_entity_id:
            raise HTTPException(
                status_code=400,
                detail="Partner accounts require a company link (use Self if independent).",
            )
        db.add(worker)
        db.commit()
        db.refresh(worker)
    return worker


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(body: RegisterRequest, request: Request):
    """
    Public self-registration. Creates a banned Supabase user pending admin approval.
    """
    check_rate_limit(request, scope="auth-register", limit=5, window_seconds=3600, key_suffix=body.email.lower())
    check_rate_limit(request, scope="auth-register-ip", limit=20, window_seconds=3600)
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
        raise http_error_from_auth(exc) from exc

    return user_to_dict(user)


_ORG_ROLE_TO_AUTH_ROLE = {
    AdminRoleEnum.ceo_leadership: "super_admin",
    AdminRoleEnum.operations_lead: "admin",
}


def _list_postgres_users(db: Session) -> list[dict]:
    """Project local account rows into the shape expected by the Accounts page."""
    users: list[dict] = []
    admin_rows = db.exec(select(AdminUser).order_by(AdminUser.display_name)).all()

    for admin in admin_rows:
        worker = db.exec(
            select(Worker).where(Worker.admin_user_id == admin.id)
        ).first()
        role = _ORG_ROLE_TO_AUTH_ROLE.get(admin.role)
        if role is None:
            role = (
                "partner"
                if worker and worker.worker_type == WorkerTypeEnum.partner_worker
                else "user"
            )

        disabled = admin.status == AccountStatusEnum.deactivated
        created_at_ms = (
            int(admin.created_at.timestamp() * 1000)
            if admin.created_at
            else 0
        )
        users.append({
            "uid": admin.firebase_uid,
            "email": admin.email,
            "displayName": admin.display_name,
            "role": role,
            "status": "banned" if disabled else "approved",
            "disabled": disabled,
            "banned": disabled,
            "createdAt": created_at_ms,
            "partnerEntityId": (
                str(worker.partner_entity_id)
                if worker and worker.partner_entity_id
                else None
            ),
        })

    return users


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """List accounts from Supabase Auth."""
    return list_auth_users()


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Create a new Supabase user with a role in app_metadata.
    - admin       : can create worker, partner, or operations lead
    - super_admin : can create any role including executive
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot create accounts with role '{body.role}'.",
        )

    partner_entity_id = _validate_optional_partner_entity(db, body.role, body.partnerEntityId)
    if body.role == "partner":
        partner_entity_id = _ensure_partner_entity_id(
            db,
            display_name=body.displayName,
            entity_id=partner_entity_id,
        )

    try:
        user = create_auth_user(
            email=body.email,
            password=body.password,
            display_name=body.displayName,
            role=body.role,
            partner_entity_id=partner_entity_id,
        )
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    if body.role in {"user", "partner"}:
        _ensure_login_profile(
            db,
            uid=user.uid,
            email=user.email or body.email,
            display_name=user.display_name or body.displayName,
            as_partner=body.role == "partner",
            partner_entity_id=partner_entity_id,
        )

    return user_to_dict(user)


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
        user = approve_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

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
        user = reject_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return user_to_dict(user)


@router.patch("/users/{uid}/role")
def update_user_role(
    uid: str,
    body: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Update the role of an existing user (promote/demote).
    - admin       : can set worker, partner, or operations lead (not executive)
    - super_admin : can set any role
    Admins cannot change Executive accounts.
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot assign role '{body.role}'.",
        )

    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.custom_claims or {}).get("role", "user")
    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot change Executive account roles.",
        )

    partner_entity_id = _validate_optional_partner_entity(db, body.role, body.partnerEntityId)
    if body.role == "partner":
        partner_entity_id = _ensure_partner_entity_id(
            db,
            display_name=target.display_name or (target.email or "").split("@")[0] or "Partner",
            entity_id=partner_entity_id,
        )

    try:
        set_user_role(uid, body.role, partner_entity_id=partner_entity_id)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    if body.role == "partner":
        _ensure_login_profile(
            db,
            uid=uid,
            email=target.email or f"{uid}@unknown.local",
            display_name=target.display_name or (target.email or "").split("@")[0] or "Partner",
            as_partner=True,
            partner_entity_id=partner_entity_id,
        )

    return user_to_dict(get_auth_user(uid))


@router.get("/account-status")
def get_account_status(email: str, request: Request):
    """
    Rate-limited status lookup for the login page when auth returns user-disabled.
    Returns a generic response when the address is not registered to reduce enumeration.
    """
    check_rate_limit(request, scope="auth-account-status", limit=10, window_seconds=60)
    check_rate_limit(
        request,
        scope="auth-account-status-email",
        limit=5,
        window_seconds=300,
        key_suffix=email.lower()[:120],
    )
    try:
        user = get_auth_user_by_email(email)
    except Exception:
        return {"status": "unknown"}
    claims = user.custom_claims or {}
    status = claims.get("status", "approved" if not user.disabled else "pending")
    return {"status": status}


@router.post("/session-token")
def create_session_token(body: SessionTokenRequest, request: Request):
    """Verify Firebase ID token and return a signed cookie value for Next.js middleware."""
    check_rate_limit(request, scope="auth-session-token", limit=30, window_seconds=60)
    try:
        decoded = verify_supabase_token(body.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    role = decoded.get("role", "user")
    if role not in {"user", "partner", "admin", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    token = sign_session(decoded["uid"], role)
    return {"token": token, "role": role}


@router.patch("/users/{uid}/ban")
def ban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Disable a user's account and mark it as banned. Admins cannot ban super_admins."""
    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.custom_claims or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot ban Super Admin accounts.",
        )

    try:
        user = ban_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return user_to_dict(user)


@router.patch("/users/{uid}/unban")
def unban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Re-enable a previously banned account."""
    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.custom_claims or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify Super Admin accounts.",
        )

    try:
        user = unban_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return user_to_dict(user)


@router.post("/bootstrap-super-admin")
def bootstrap(current_user: dict = Depends(require_super_admin)):
    """
    Idempotent: ensures support.globalsolutions@gmail.com has the super_admin claim.
    Only callable by an existing super_admin. Run once after initial Supabase setup.
    """
    try:
        return bootstrap_super_admin()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
