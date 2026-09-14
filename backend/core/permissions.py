from functools import wraps
from typing import Callable

from fastapi import Depends, HTTPException, status

from .security import get_current_user

AuthRole = str  # "user" | "partner" | "admin" | "executive" | "super_admin"

ROLE_HIERARCHY: dict[AuthRole, int] = {
    "user": 1,
    "partner": 1,  # same worker APIs as user; distinct claim for Accounts / notify
    "admin": 2,
    # An executive reads the same org-wide data as an admin — the leadership
    # dashboards are built on admin-level endpoints — but is confined to the
    # leadership portal by the frontend router and middleware.
    "executive": 2,
    "super_admin": 3,
}

# What each role is allowed to assign when creating/elevating another account.
ROLE_CAN_ASSIGN: dict[AuthRole, set[AuthRole]] = {
    "super_admin": {"user", "partner", "admin", "executive", "super_admin"},
    "admin": {"user", "partner", "admin"},
    "partner": set(),
    "user": set(),
}

# Roles that see organisation-wide data rather than only their own records.
# Used instead of a literal {"admin", "super_admin"} so adding a staff role
# does not silently fall through to worker-scoped behaviour.
STAFF_ROLES: frozenset[AuthRole] = frozenset({"admin", "executive", "super_admin"})


def is_staff(current_user: dict) -> bool:
    """True when the caller sees org-wide data (admin, executive, super admin)."""
    return current_user.get("role") in STAFF_ROLES


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
