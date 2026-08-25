"""Startup checks and shared input validation for security-sensitive fields."""
from __future__ import annotations

import logging
from urllib.parse import urlparse

from core.config import settings

logger = logging.getLogger(__name__)

_INSECURE_DB_DEFAULT = "122333"
_INSECURE_GUAC_DEFAULT = "guacadmin"


def validate_production_settings() -> None:
    """Fail fast when production is misconfigured."""
    if settings.DEV_AUTH_BYPASS:
        raise RuntimeError("DEV_AUTH_BYPASS must be false when ENVIRONMENT=production")

    if not settings.DATABASE_URL or _INSECURE_DB_DEFAULT in settings.DATABASE_URL:
        raise RuntimeError("Set a strong DATABASE_URL in production (no default password)")

    if settings.GUACAMOLE_PASSWORD == _INSECURE_GUAC_DEFAULT and settings.is_production:
        logger.warning("GUACAMOLE_PASSWORD is still the default — change it before launch")

    if not settings.OTP_PEPPER and not settings.RESEND_API_KEY:
        raise RuntimeError("OTP_PEPPER or RESEND_API_KEY is required in production")

    if not settings.SESSION_COOKIE_SECRET and not settings.OTP_PEPPER:
        logger.warning("SESSION_COOKIE_SECRET unset — falling back to OTP_PEPPER for signed cookies")


def validate_session_image_url(url: str) -> str:
    """Allow only HTTPS Firebase Storage download URLs for session evidence."""
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"https"}:
        raise ValueError("Image URL must use HTTPS")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("Image URL is invalid")
    if host.endswith(".firebasestorage.app") or host.endswith(".googleapis.com"):
        return url.strip()
    project = settings.FIREBASE_PROJECT_ID.lower()
    if project and project in host:
        return url.strip()
    raise ValueError("Image URL must be a Firebase Storage download link")
