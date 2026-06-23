"""Map Firebase Admin exceptions to HTTP-friendly errors."""
from fastapi import HTTPException, status
from firebase_admin import auth

from core.firebase_admin import is_firebase_ready


def http_error_from_firebase(exc: Exception) -> HTTPException:
    if not is_firebase_ready():
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Account registration is not available: the server is missing Firebase credentials. "
                "Place firebase-service-account.json in the backend folder and restart the API."
            ),
        )

    if isinstance(exc, auth.EmailAlreadyExistsError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))

    msg = str(exc)
    if "EMAIL_EXISTS" in msg or "email address is already in use" in msg.lower():
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
