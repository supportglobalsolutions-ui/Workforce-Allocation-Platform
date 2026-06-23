from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from core.firebase_admin import (
    SUPER_ADMIN_EMAIL,
    bootstrap_super_admin,
    create_firebase_user,
    list_firebase_users,
    set_user_role,
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


# ── Endpoints ─────────────────────────────────────────────────────────────────

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
    }


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
