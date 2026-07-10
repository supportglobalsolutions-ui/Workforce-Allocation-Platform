import json
import logging
import os
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials

from .config import settings

logger = logging.getLogger(__name__)
_initialized = False

VALID_ROLES = {"user", "admin", "super_admin"}
VALID_STATUSES = {"pending", "approved", "rejected"}
SUPER_ADMIN_EMAIL = "support.globalsolutions@gmail.com"

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REPO_ROOT = os.path.dirname(_BACKEND_DIR)


def _resolve_credentials_path() -> str | None:
    """Find Firebase service account JSON from env or common locations."""
    candidates = [
        settings.FIREBASE_CREDENTIALS_PATH,
        os.path.join(_BACKEND_DIR, "admin.json"),
        os.path.join(_BACKEND_DIR, "firebase-service-account.json"),
        os.path.join(_REPO_ROOT, "admin.json"),
        os.path.join(_REPO_ROOT, "firebase-service-account.json"),
    ]
    seen: set[str] = set()
    for raw in candidates:
        if not raw:
            continue
        path = os.path.abspath(os.path.expanduser(raw))
        if path in seen:
            continue
        seen.add(path)
        if os.path.isfile(path):
            return path
    return None


def is_firebase_ready() -> bool:
    return _initialized or bool(firebase_admin._apps)


def init_firebase() -> None:
    global _initialized
    if is_firebase_ready():
        _initialized = True
        return

    cred_path = _resolve_credentials_path()
    if not cred_path:
        logger.warning(
            "Firebase credentials not found — set FIREBASE_CREDENTIALS_PATH in backend/.env "
            "(e.g. ../admin.json). Auth and registration will not work until configured.",
        )
        return

    cred = credentials.Certificate(cred_path)
    options: dict[str, Any] = {}
    project_id = settings.FIREBASE_PROJECT_ID
    if not project_id:
        try:
            with open(cred_path, encoding="utf-8") as fh:
                project_id = json.load(fh).get("project_id", "") or ""
        except OSError:
            project_id = ""
    if project_id:
        options["projectId"] = project_id
    if settings.FIREBASE_DATABASE_URL:
        options["databaseURL"] = settings.FIREBASE_DATABASE_URL

    firebase_admin.initialize_app(cred, options)
    _initialized = True


def require_firebase() -> None:
    if not is_firebase_ready():
        raise RuntimeError(
            "Firebase Admin is not configured. Set FIREBASE_CREDENTIALS_PATH in backend/.env "
            "(e.g. ../admin.json) and restart the API."
        )


def verify_firebase_token(id_token: str) -> dict:
    try:
        return auth.verify_id_token(id_token, check_revoked=False)
    except auth.RevokedIdTokenError:
        raise ValueError("Token has been revoked")
    except auth.ExpiredIdTokenError:
        raise ValueError("Token has expired — please refresh the page")
    except auth.InvalidIdTokenError as exc:
        raise ValueError(f"Token rejected by Firebase: {exc}")
    except Exception as exc:
        raise ValueError(f"Token verification failed: {exc}")


def set_user_role(uid: str, role: str) -> None:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    existing = auth.get_user(uid).custom_claims or {}
    auth.set_custom_user_claims(uid, {**existing, "role": role})


def set_user_claims(uid: str, *, role: str, status: str) -> None:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    auth.set_custom_user_claims(uid, {"role": role, "status": status})


def create_firebase_user(
    email: str,
    password: str,
    display_name: str,
    role: str,
) -> auth.UserRecord:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    user = auth.create_user(
        email=email,
        password=password,
        display_name=display_name,
        disabled=False,
    )
    set_user_claims(user.uid, role=role, status="approved")
    return user


def register_pending_user(
    email: str,
    password: str,
    display_name: str,
) -> auth.UserRecord:
    require_firebase()
    user = auth.create_user(
        email=email,
        password=password,
        display_name=display_name,
        disabled=True,
    )
    set_user_claims(user.uid, role="user", status="pending")
    return user


def approve_firebase_user(uid: str) -> auth.UserRecord:
    auth.update_user(uid, disabled=False)
    set_user_claims(uid, role="user", status="approved")
    return auth.get_user(uid)


def reject_firebase_user(uid: str) -> auth.UserRecord:
    auth.update_user(uid, disabled=True)
    set_user_claims(uid, role="user", status="rejected")
    return auth.get_user(uid)


def get_firebase_user(uid: str) -> auth.UserRecord:
    return auth.get_user(uid)


def get_firebase_user_by_email(email: str) -> auth.UserRecord:
    return auth.get_user_by_email(email)


def user_to_dict(u: auth.UserRecord) -> dict:
    return _user_to_dict(u)


def _user_to_dict(u: auth.UserRecord) -> dict:
    claims = u.custom_claims or {}
    return {
        "uid": u.uid,
        "email": u.email or "",
        "displayName": u.display_name or "",
        "role": claims.get("role", "user"),
        "status": claims.get("status", "approved" if not u.disabled else "pending"),
        "disabled": u.disabled,
        "createdAt": u.user_metadata.creation_timestamp,
    }


def list_firebase_users() -> list[dict]:
    results = []
    page = auth.list_users()
    while page:
        for u in page.users:
            results.append(_user_to_dict(u))
        page = page.get_next_page()
    return results


def bootstrap_super_admin() -> dict:
    """Ensure support.globalsolutions@gmail.com has the super_admin claim."""
    user = get_firebase_user_by_email(SUPER_ADMIN_EMAIL)
    auth.set_custom_user_claims(user.uid, {"role": "super_admin", "status": "approved"})
    return {"uid": user.uid, "email": user.email, "role": "super_admin"}
