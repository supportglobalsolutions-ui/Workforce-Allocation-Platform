import os

import firebase_admin
from firebase_admin import auth, credentials

from .config import settings

_initialized = False


def init_firebase() -> None:
    global _initialized
    if _initialized or firebase_admin._apps:
        return

    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
    else:
        # Fall back to Application Default Credentials (Cloud Run / GCP)
        cred = credentials.ApplicationDefault()

    options = {}
    if settings.FIREBASE_DATABASE_URL:
        options["databaseURL"] = settings.FIREBASE_DATABASE_URL

    firebase_admin.initialize_app(cred, options)
    _initialized = True


def verify_firebase_token(id_token: str) -> dict:
    """Verify a Firebase ID token and return the decoded claims."""
    try:
        return auth.verify_id_token(id_token, check_revoked=True)
    except auth.RevokedIdTokenError:
        raise ValueError("Token has been revoked")
    except auth.ExpiredIdTokenError:
        raise ValueError("Token has expired")
    except Exception:
        raise ValueError("Invalid token")


def set_user_role(uid: str, role: str) -> None:
    """Set a custom claim 'role' on a Firebase user. Call this after creating a worker."""
    auth.set_custom_user_claims(uid, {"role": role})


def get_firebase_user(uid: str):
    return auth.get_user(uid)
