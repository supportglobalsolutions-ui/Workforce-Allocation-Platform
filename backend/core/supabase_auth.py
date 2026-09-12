"""Supabase (GoTrue) authentication — token verification and user admin.

Replaces core/firebase_admin.py. Two distinct concerns live here:

Token verification
------------------
Supabase issues JWTs. Newer projects sign with RS256 and publish a JWKS
document; older ones sign with HS256 using the project's shared JWT secret.
Both are supported: JWKS is tried first and the key set is cached, falling
back to the shared secret.

Roles live in ``app_metadata``, which only the service key can write and which
Supabase copies into every issued token. ``user_metadata`` is writable by the
user themselves and must never be trusted for authorisation.

User administration
-------------------
Thin wrappers over the GoTrue admin REST API (``/auth/v1/admin/users``),
authenticated with the service-role/secret key. Function names mirror the
old Firebase module so call sites read the same.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import httpx
import jwt
from jwt import PyJWKClient

from .config import settings

logger = logging.getLogger(__name__)

VALID_ROLES = {"user", "admin", "super_admin", "partner"}
VALID_STATUSES = {"pending", "approved", "rejected", "banned"}
SUPER_ADMIN_EMAIL = "support.globalsolutions@gmail.com"

# Supabase's own JWT "role" claim (authenticated / anon / service_role) is not
# our application role — read ours out of app_metadata.
_APP_ROLE_KEY = "role"
_APP_STATUS_KEY = "status"
_APP_PARTNER_KEY = "partner_entity_id"

_LEEWAY_SECONDS = 30  # tolerate modest clock drift

_jwk_client: PyJWKClient | None = None


# ── configuration ────────────────────────────────────────────────────────

def _service_key() -> str:
    """Service-role (legacy) or secret (current) key — whichever is set."""
    return settings.SUPABASE_SECRET_KEY or settings.SUPABASE_SERVICE_ROLE_KEY


def _auth_base() -> str:
    return f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"


def is_auth_ready() -> bool:
    """True when enough config exists to verify tokens and call the admin API."""
    has_verify = bool(settings.SUPABASE_JWKS_URL or settings.SUPABASE_JWT_SECRET)
    return bool(settings.SUPABASE_URL) and bool(_service_key()) and has_verify


def require_auth_config() -> None:
    if not is_auth_ready():
        raise RuntimeError(
            "Supabase auth is not configured. Set SUPABASE_URL, "
            "SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) and one of "
            "SUPABASE_JWKS_URL / SUPABASE_JWT_SECRET in backend/.env."
        )


# ── token verification ───────────────────────────────────────────────────

def _jwks() -> PyJWKClient | None:
    global _jwk_client
    if _jwk_client is not None:
        return _jwk_client
    url = settings.SUPABASE_JWKS_URL
    if not url and settings.SUPABASE_URL:
        url = f"{_auth_base()}/.well-known/jwks.json"
    if not url:
        return None
    _jwk_client = PyJWKClient(url, cache_keys=True, lifespan=3600)
    return _jwk_client


def verify_supabase_token(access_token: str) -> dict:
    """Validate a Supabase access token. Raises ValueError when unacceptable.

    Returns a normalised identity dict: uid, email, name, role, status,
    partner_entity_id.
    """
    if not access_token:
        raise ValueError("No token supplied")

    claims: dict[str, Any] | None = None
    errors: list[str] = []

    # Preferred path: asymmetric verification against the published JWKS.
    try:
        client = _jwks()
        if client is not None:
            key = client.get_signing_key_from_jwt(access_token).key
            claims = jwt.decode(
                access_token,
                key,
                algorithms=["RS256", "ES256"],
                audience="authenticated",
                leeway=_LEEWAY_SECONDS,
            )
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired - please sign in again")
    except Exception as exc:  # noqa: BLE001 — fall through to HS256
        errors.append(f"jwks: {exc}")

    # Legacy path: symmetric verification with the project JWT secret.
    if claims is None and settings.SUPABASE_JWT_SECRET:
        try:
            claims = jwt.decode(
                access_token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
                leeway=_LEEWAY_SECONDS,
            )
        except jwt.ExpiredSignatureError:
            raise ValueError("Token has expired - please sign in again")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"hs256: {exc}")

    if claims is None:
        raise ValueError(f"Token verification failed ({'; '.join(errors) or 'no key available'})")

    # PyJWT's leeway loosens `exp` as well as `iat`/`nbf`, which would keep a
    # token usable for _LEEWAY_SECONDS past its expiry. Clock skew is a reason
    # to tolerate a token that looks slightly *early*, never one that has
    # already expired - so re-check expiry with no grace.
    exp = claims.get("exp")
    if exp is not None and time.time() > float(exp):
        raise ValueError("Token has expired - please sign in again")

    app_md = claims.get("app_metadata") or {}
    user_md = claims.get("user_metadata") or {}

    return {
        "uid": claims.get("sub", ""),
        "email": claims.get("email", "") or user_md.get("email", ""),
        # Display name is user-controlled and only ever used for presentation.
        "name": user_md.get("full_name") or user_md.get("display_name") or "",
        "role": app_md.get(_APP_ROLE_KEY, "user"),
        "status": app_md.get(_APP_STATUS_KEY, "approved"),
        "partner_entity_id": app_md.get(_APP_PARTNER_KEY),
    }


# ── admin REST helpers ───────────────────────────────────────────────────

def _admin_request(method: str, path: str, **kwargs: Any) -> Any:
    require_auth_config()
    key = _service_key()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    url = f"{_auth_base()}/admin{path}"
    with httpx.Client(timeout=30.0) as client:
        resp = client.request(method, url, headers=headers, **kwargs)
    if resp.status_code >= 400:
        detail = resp.text[:300]
        raise ValueError(f"Supabase admin API {resp.status_code}: {detail}")
    if not resp.content:
        return None
    return resp.json()


def _merge_app_metadata(uid: str, updates: dict[str, Any]) -> dict:
    """Patch app_metadata without clobbering keys we are not setting."""
    current = _admin_request("GET", f"/users/{uid}") or {}
    merged = {**(current.get("app_metadata") or {}), **updates}
    return _admin_request("PUT", f"/users/{uid}", json={"app_metadata": merged}) or {}


# ── user administration ──────────────────────────────────────────────────

def set_user_role(uid: str, role: str, *, partner_entity_id: str | None = None) -> None:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    updates: dict[str, Any] = {_APP_ROLE_KEY: role}
    # partner_entity_id only means anything for partner accounts.
    updates[_APP_PARTNER_KEY] = partner_entity_id if role == "partner" else None
    _merge_app_metadata(uid, updates)


def set_user_claims(
    uid: str,
    *,
    role: str,
    status: str,
    partner_entity_id: str | None = None,
) -> None:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    if status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {status}")
    _merge_app_metadata(uid, {
        _APP_ROLE_KEY: role,
        _APP_STATUS_KEY: status,
        _APP_PARTNER_KEY: partner_entity_id if role == "partner" else None,
    })


def create_auth_user(
    email: str,
    password: str,
    display_name: str,
    role: str,
    partner_entity_id: str | None = None,
) -> dict:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    user = _admin_request("POST", "/users", json={
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {"full_name": display_name},
        "app_metadata": {
            _APP_ROLE_KEY: role,
            _APP_STATUS_KEY: "approved",
            _APP_PARTNER_KEY: partner_entity_id if role == "partner" else None,
        },
    })
    return user or {}


def register_pending_user(email: str, password: str, display_name: str) -> dict:
    """Self-service signup. Banned until an admin approves, so the account
    exists but cannot authenticate."""
    user = _admin_request("POST", "/users", json={
        "email": email,
        "password": password,
        "email_confirm": True,
        "ban_duration": "876000h",  # ~100 years; lifted on approval
        "user_metadata": {"full_name": display_name},
        "app_metadata": {_APP_ROLE_KEY: "user", _APP_STATUS_KEY: "pending"},
    })
    return user or {}


def approve_auth_user(uid: str) -> dict:
    _admin_request("PUT", f"/users/{uid}", json={"ban_duration": "none"})
    set_user_claims(uid, role="user", status="approved")
    return get_auth_user(uid)


def reject_auth_user(uid: str) -> dict:
    _admin_request("PUT", f"/users/{uid}", json={"ban_duration": "876000h"})
    set_user_claims(uid, role="user", status="rejected")
    return get_auth_user(uid)


def ban_auth_user(uid: str) -> dict:
    _admin_request("PUT", f"/users/{uid}", json={"ban_duration": "876000h"})
    _merge_app_metadata(uid, {_APP_STATUS_KEY: "banned"})
    return get_auth_user(uid)


def unban_auth_user(uid: str) -> dict:
    _admin_request("PUT", f"/users/{uid}", json={"ban_duration": "none"})
    _merge_app_metadata(uid, {_APP_STATUS_KEY: "approved"})
    return get_auth_user(uid)


def delete_auth_user(uid: str) -> None:
    _admin_request("DELETE", f"/users/{uid}")


def get_auth_user(uid: str) -> dict:
    return _admin_request("GET", f"/users/{uid}") or {}


def get_auth_user_by_email(email: str) -> dict:
    # GoTrue's admin list endpoint filters on email.
    data = _admin_request("GET", "/users", params={"page": 1, "per_page": 200})
    for u in (data or {}).get("users", []):
        if (u.get("email") or "").lower() == email.lower():
            return u
    raise ValueError(f"No user with email {email}")


def user_to_dict(u: dict) -> dict:
    """Normalise a GoTrue user record to the shape the API already returns."""
    app_md = u.get("app_metadata") or {}
    user_md = u.get("user_metadata") or {}
    banned_until = u.get("banned_until")
    is_banned = bool(banned_until) and banned_until not in ("", "none")
    status = app_md.get(_APP_STATUS_KEY) or ("banned" if is_banned else "approved")
    return {
        "uid": u.get("id", ""),
        "email": u.get("email", "") or "",
        "displayName": user_md.get("full_name") or user_md.get("display_name") or "",
        "role": app_md.get(_APP_ROLE_KEY, "user"),
        "status": status,
        "banned": status == "banned",
        "disabled": is_banned,
        "createdAt": u.get("created_at"),
        "partnerEntityId": app_md.get(_APP_PARTNER_KEY),
    }


def list_auth_users() -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        data = _admin_request("GET", "/users", params={"page": page, "per_page": 200}) or {}
        users = data.get("users", [])
        if not users:
            break
        out.extend(user_to_dict(u) for u in users)
        if len(users) < 200:
            break
        page += 1
    return out


def bootstrap_super_admin() -> dict:
    """Ensure the founding account carries the super_admin role."""
    user = get_auth_user_by_email(SUPER_ADMIN_EMAIL)
    uid = user.get("id", "")
    set_user_claims(uid, role="super_admin", status="approved")
    return {"uid": uid, "email": user.get("email"), "role": "super_admin"}
