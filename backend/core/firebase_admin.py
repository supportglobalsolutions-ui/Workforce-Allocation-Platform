import os
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials

from .config import settings

_initialized = False

VALID_ROLES = {"user", "admin", "super_admin"}
VALID_STATUSES = {"pending", "approved", "rejected"}
SUPER_ADMIN_EMAIL = "support.globalsolutions@gmail.com"


def init_firebase() -> None:
    global _initialized
    if _initialized or firebase_admin._apps:
        return

    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
    else:
        cred = credentials.ApplicationDefault()

    options: dict[str, Any] = {}
    if settings.FIREBASE_DATABASE_URL:
        options["databaseURL"] = settings.FIREBASE_DATABASE_URL

    firebase_admin.initialize_app(cred, options)
    _initialized = True


def verify_firebase_token(id_token: str) -> dict:
    try:
        return auth.verify_id_token(id_token, check_revoked=True)
    except auth.RevokedIdTokenError:
        raise ValueError("Token has been revoked")
    except auth.ExpiredIdTokenError:
        raise ValueError("Token has expired")
    except Exception:
        raise ValueError("Invalid token")


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
