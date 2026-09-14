"""Signed session cookies for Next.js middleware (HttpOnly, not forgeable)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import time

from core.config import settings

VALID_ROLES = frozenset({"user", "partner", "admin", "executive", "super_admin"})
DEFAULT_TTL_SECONDS = 86_400


def _secret() -> bytes:
    raw = settings.SESSION_COOKIE_SECRET or settings.OTP_PEPPER or settings.RESEND_API_KEY
    if not raw:
        if settings.is_production:
            raise RuntimeError("SESSION_COOKIE_SECRET (or OTP_PEPPER) is required in production")
        raw = "dev-session-cookie-secret"
    return raw.encode()


def sign_session(uid: str, role: str, *, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> str:
    if role not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}")
    exp = int(time.time()) + ttl_seconds
    payload = f"{uid}|{role}|{exp}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}|{sig}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def verify_session(token: str) -> dict[str, str] | None:
    try:
        pad = "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(token + pad).decode()
        uid, role, exp_str, sig = raw.rsplit("|", 3)
        payload = f"{uid}|{role}|{exp_str}"
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        if int(exp_str) < time.time():
            return None
        if role not in VALID_ROLES:
            return None
        return {"uid": uid, "role": role}
    except Exception:
        return None
