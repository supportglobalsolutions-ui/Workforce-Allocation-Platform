from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth_logging import log_auth_failure
from .config import settings
from .supabase_auth import verify_supabase_token

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
    Verify the Supabase access token sent as Bearer <token>.
    Returns uid, email, name and the application role.
    Roles: user | partner | admin | super_admin

    The role comes from app_metadata, which only the service key can write.
    user_metadata is user-editable and is never trusted for authorisation.
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
        decoded = verify_supabase_token(credentials.credentials)
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

    # Banning in Supabase already stops tokens being issued, but a token minted
    # just before the ban stays valid until it expires. Re-check the account
    # state on every request so a ban takes effect immediately.
    account_status = decoded.get("status", "approved")
    if account_status in {"banned", "rejected", "pending"}:
        log_auth_failure(request, reason="account_status", detail=account_status)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your account is awaiting approval"
                if account_status == "pending"
                else "Access denied"
            ),
        )

    return {
        "uid": decoded["uid"],
        "email": decoded.get("email", ""),
        "name": decoded.get("name", ""),
        "role": role,
    }
