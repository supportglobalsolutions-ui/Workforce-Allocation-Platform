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
    if not settings.DATABASE_URL or _INSECURE_DB_DEFAULT in settings.DATABASE_URL:
        raise RuntimeError("Set a strong DATABASE_URL in production (no default password)")

    if settings.GUACAMOLE_PASSWORD == _INSECURE_GUAC_DEFAULT and settings.is_production:
        logger.warning("GUACAMOLE_PASSWORD is still the default — change it before launch")

    if not settings.OTP_PEPPER and not settings.RESEND_API_KEY:
        raise RuntimeError("OTP_PEPPER or RESEND_API_KEY is required in production")

    if not settings.SESSION_COOKIE_SECRET and not settings.OTP_PEPPER:
        logger.warning("SESSION_COOKIE_SECRET unset — falling back to OTP_PEPPER for signed cookies")


def validate_session_image_url(url: str) -> str:
    """Allow only HTTPS Supabase Storage URLs for session evidence.

    Restricting the host stops a worker submitting a link to an arbitrary
    server as proof of work, which would both leak request metadata and let
    the "evidence" change after review.
    """
    parsed = urlparse(url.strip())
    if parsed.scheme != "https":
        raise ValueError("Image URL must use HTTPS")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("Image URL is invalid")

    project_host = (urlparse(settings.SUPABASE_URL).hostname or "").lower()
    if project_host and host == project_host and "/storage/v1/object/" in parsed.path:
        return url.strip()

    raise ValueError("Image URL must be a Supabase Storage link for this project")
