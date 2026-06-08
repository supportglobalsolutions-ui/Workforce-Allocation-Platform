from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, status

from .security import get_current_user

AuthRole = str  # "worker" | "admin" | "executive"

ROLE_HIERARCHY: dict[AuthRole, int] = {
    "worker": 1,
    "admin": 2,
    "executive": 3,
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


require_worker = require_min_role("worker")
require_admin = require_min_role("admin")
require_executive = require_min_role("executive")
