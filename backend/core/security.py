from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth_logging import log_auth_failure
from .config import settings
from .firebase_admin import verify_firebase_token

bearer_scheme = HTTPBearer(auto_error=False)

ROLES = {"user", "partner", "admin", "super_admin"}

# Fixed identity used when DEV_AUTH_BYPASS is enabled (development only).
_DEV_USER_UID = "dev-test-user"
_DEV_USER_EMAIL = "dev.test@local.dev"


def _dev_bypass_enabled() -> bool:
    return settings.DEV_AUTH_BYPASS and not settings.is_production


def _dev_user() -> dict:
    role = settings.DEV_AUTH_ROLE if settings.DEV_AUTH_ROLE in ROLES else "user"
    return {
        "uid": _DEV_USER_UID,
        "email": _DEV_USER_EMAIL,
        "name": "Dev Test User",
        "role": role,
    }


def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    """
    Verify the Firebase ID token sent as Bearer <token>.
    Returns decoded payload with uid, email, and role custom claim.
    Roles: user | partner | admin | super_admin
    """
    if not credentials:
        if _dev_bypass_enabled():
            return _dev_user()
        log_auth_failure(request, reason="missing_token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        decoded = verify_firebase_token(credentials.credentials)
    except ValueError as exc:
        if _dev_bypass_enabled():
            return _dev_user()
        log_auth_failure(request, reason="invalid_token", detail=str(exc))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    role = decoded.get("role", "user")
    if role not in ROLES:
        log_auth_failure(request, reason="unknown_role", detail=role)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return {
        "uid": decoded["uid"],
        "email": decoded.get("email", ""),
        "name": decoded.get("name", "") or decoded.get("display_name", ""),
        "role": role,
    }
