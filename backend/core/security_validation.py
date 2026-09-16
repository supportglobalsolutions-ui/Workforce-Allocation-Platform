"""Startup checks and shared input validation for security-sensitive fields."""
from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from core.config import settings

logger = logging.getLogger(__name__)

_INSECURE_DB_DEFAULT = "122333"
_INSECURE_GUAC_DEFAULT = "guacadmin"
_JSON_SECRET = re.compile(r"^[0-9a-fA-F]{32}$")


def validate_production_settings() -> None:
    """Fail fast when production is misconfigured."""
    if not settings.DATABASE_URL or _INSECURE_DB_DEFAULT in settings.DATABASE_URL:
        raise RuntimeError("Set a strong DATABASE_URL in production (no default password)")

    if settings.is_production:
        pwd = (settings.GUACAMOLE_PASSWORD or "").strip()
        if not pwd or pwd == _INSECURE_GUAC_DEFAULT:
            raise RuntimeError(
                "Set a strong GUACAMOLE_PASSWORD (not empty, not the guacadmin default). "
                "Rotate it in Guacamole and backend .env — assume any old token leaked "
                "(Phase 1 Safety)."
            )

        direct_mode = (settings.RDP_DIRECT_GATEWAY_MODE or "off").strip().lower()
        if direct_mode not in {"off", "pilot", "on"}:
            raise RuntimeError("RDP_DIRECT_GATEWAY_MODE must be off, pilot, or on")
        if direct_mode != "off":
            if not settings.guacamole_public_url.startswith("https://"):
                raise RuntimeError(
                    "Set GUACAMOLE_PUBLIC_URL to the HTTPS guac. origin before "
                    "enabling the direct gateway."
                )
            if not _JSON_SECRET.fullmatch((settings.GUACAMOLE_JSON_SECRET_KEY or "").strip()):
                raise RuntimeError(
                    "Set GUACAMOLE_JSON_SECRET_KEY to a random 32-hex-character "
                    "value before enabling the direct gateway."
                )

    if not settings.OTP_PEPPER and not settings.RESEND_API_KEY:
        raise RuntimeError("OTP_PEPPER or RESEND_API_KEY is required in production")

    if not settings.SESSION_COOKIE_SECRET and not settings.OTP_PEPPER:
        logger.warning("SESSION_COOKIE_SECRET unset — falling back to OTP_PEPPER for signed cookies")


_STORAGE_OBJECT_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,300}$")


def validate_session_image_url(url: str) -> str:
    """Allow only this project's Supabase Storage objects as session evidence.

    Restricting the host stops a worker submitting a link to an arbitrary
    server as proof of work, which would both leak request metadata and let
    the "evidence" change after review.

    Two accepted forms:
      * a bucket-relative object path ("<session_id>/start.jpg") — what the app
        stores now that the bucket is private and read through signed URLs;
      * a legacy HTTPS Supabase Storage URL, still present on older rows.
    """
    value = url.strip()
    if not value:
        raise ValueError("Image URL is required")

    parsed = urlparse(value)

    # Bucket-relative path: no scheme and no host, so it cannot point off-site.
    if not parsed.scheme and not parsed.netloc:
        if value.startswith("/") or "\\" in value or ".." in value:
            raise ValueError("Image path is invalid")
        if not _STORAGE_OBJECT_PATH.match(value):
            raise ValueError("Image path is invalid")
        return value

    if parsed.scheme != "https":
        raise ValueError("Image URL must use HTTPS")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("Image URL is invalid")

    project_host = (urlparse(settings.SUPABASE_URL).hostname or "").lower()
    if project_host and host == project_host and "/storage/v1/object/" in parsed.path:
        return value

    raise ValueError("Image URL must be a Supabase Storage link for this project")
