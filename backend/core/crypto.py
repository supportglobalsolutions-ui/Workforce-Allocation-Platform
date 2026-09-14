"""
Symmetric encryption for secrets held at rest in the application database.

Used for RDP credentials. Guacamole keeps the same values in plaintext in its
own database, so encrypting here is a strict improvement: a dump of the app
database (or the Supabase project) does not hand over machine passwords.

Key resolution, in order:
  1. SECRET_ENCRYPTION_KEY — a urlsafe-base64 32-byte Fernet key. Preferred.
  2. Derived via HKDF from OTP_PEPPER / SESSION_COOKIE_SECRET, so existing
     deployments work without adding a new variable.

Rotating the source secret makes stored ciphertext undecryptable; the app
treats that as "no credentials stored" and asks an admin to re-enter them
rather than failing the request.
"""
from __future__ import annotations

import base64
import hashlib
import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from .config import settings

logger = logging.getLogger(__name__)

_HKDF_INFO = b"workforce.rdp.credentials.v1"
_fernet: Optional[Fernet] = None


class SecretUnavailable(RuntimeError):
    """No usable encryption key is configured."""


def _derive_key(source: str) -> bytes:
    digest = hashlib.pbkdf2_hmac("sha256", source.encode(), _HKDF_INFO, 200_000, dklen=32)
    return base64.urlsafe_b64encode(digest)


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is not None:
        return _fernet

    explicit = (getattr(settings, "SECRET_ENCRYPTION_KEY", "") or "").strip()
    if explicit:
        try:
            _fernet = Fernet(explicit.encode())
            return _fernet
        except Exception as exc:
            raise SecretUnavailable(
                "SECRET_ENCRYPTION_KEY is not a valid Fernet key. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; "
                "print(Fernet.generate_key().decode())\""
            ) from exc

    fallback = (settings.OTP_PEPPER or settings.SESSION_COOKIE_SECRET or "").strip()
    if not fallback:
        raise SecretUnavailable(
            "Set SECRET_ENCRYPTION_KEY (or OTP_PEPPER) before storing credentials."
        )
    _fernet = Fernet(_derive_key(fallback))
    return _fernet


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret for storage. Returns urlsafe base64 ciphertext."""
    if plaintext is None:
        raise ValueError("Cannot encrypt None")
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str | None) -> Optional[str]:
    """
    Decrypt a stored secret.

    Returns None when there is nothing stored, or when the value cannot be
    decrypted (key rotated, corrupted row) — callers treat that as "unknown"
    and prompt for re-entry instead of crashing.
    """
    if not ciphertext:
        return None
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, SecretUnavailable, Exception):
        logger.warning("Stored secret could not be decrypted; treating as unset")
        return None


def encryption_available() -> bool:
    try:
        _get_fernet()
        return True
    except Exception:
        return False
