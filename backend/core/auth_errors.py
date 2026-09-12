"""Map Supabase (GoTrue) admin-API failures to HTTP-friendly errors."""
from fastapi import HTTPException, status

from core.supabase_auth import is_auth_ready


def http_error_from_auth(exc: Exception) -> HTTPException:
    if not is_auth_ready():
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Account management is not available: the server is missing Supabase "
                "credentials. Set SUPABASE_URL, SUPABASE_SECRET_KEY and "
                "SUPABASE_JWKS_URL in backend/.env and restart the API."
            ),
        )

    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    msg = str(exc)
    lowered = msg.lower()

    # GoTrue reports a duplicate signup in several shapes depending on version.
    if (
        "already been registered" in lowered
        or "already registered" in lowered
        or "email_exists" in lowered
        or "duplicate key" in lowered
    ):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    if "user not found" in lowered or "404" in msg:
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No such user.",
        )

    if "weak password" in lowered or "password should be" in lowered:
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=msg,
        )

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
