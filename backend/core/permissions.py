from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, status

from .security import get_current_user

AuthRole = str  # "user" | "admin" | "super_admin"

ROLE_HIERARCHY: dict[AuthRole, int] = {
    "user": 1,
    "admin": 2,
    "super_admin": 3,
}

# What each role is allowed to assign when creating/elevating another account.
ROLE_CAN_ASSIGN: dict[AuthRole, set[AuthRole]] = {
    "super_admin": {"user", "admin", "super_admin"},
    "admin": {"user"},
    "user": set(),
}


def require_role(*allowed_roles: AuthRole) -> Callable:
    def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role", "")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of: {', '.join(allowed_roles)}",
            )
        return current_user

    return dependency


def require_min_role(min_role: AuthRole) -> Callable:
    min_level = ROLE_HIERARCHY.get(min_role, 0)

    def dependency(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role", "")
        if ROLE_HIERARCHY.get(role, 0) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires at least {min_role} role",
            )
        return current_user

    return dependency


require_user = require_min_role("user")
require_admin = require_min_role("admin")
require_super_admin = require_min_role("super_admin")
