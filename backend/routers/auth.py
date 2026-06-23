from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from core.firebase_admin import (
    SUPER_ADMIN_EMAIL,
    approve_firebase_user,
    bootstrap_super_admin,
    create_firebase_user,
    list_firebase_users,
    register_pending_user,
    reject_firebase_user,
    set_user_role,
    user_to_dict,
)
from core.permissions import ROLE_CAN_ASSIGN, require_admin, require_super_admin

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

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
    current_user: dict = Depends(require_admin),
):
    """Enable a pending account so the user can sign in."""
    try:
        user = approve_firebase_user(uid)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return {"uid": uid, "role": body.role}


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
