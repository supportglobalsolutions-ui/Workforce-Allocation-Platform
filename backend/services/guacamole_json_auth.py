"""
Build a `guacamole-auth-json` authentication blob (Phase 5 — media plane).

Why this exists
---------------
Workers must reach `guac.` directly so pixels stop flowing through FastAPI,
but they must never hold a Guacamole admin login. `guacamole-auth-json` solves
exactly that: the caller encrypts a small JSON document describing *one*
ephemeral user and *only* the connections that user may open, POSTs it to
`/api/tokens`, and Guacamole returns a token whose entire visible universe is
that document. The blob is opaque to the browser — the RDP password inside is
encrypted with a key only FastAPI and Guacamole share.

Wire format (must match the extension byte for byte):

    signature = HMAC-SHA256(secret_key, json_utf8)          # 32 bytes
    payload   = signature || json_utf8
    blob      = base64( AES-128-CBC(key=secret_key, iv=0x00*16, PKCS#7(payload)) )

`secret_key` is the 128-bit value configured as `json-secret-key` in
guacamole.properties, written as 32 hex characters.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import logging
import time

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from core.config import settings

logger = logging.getLogger(__name__)

# guacamole-auth-json registers its authentication provider under this id, so
# tokens minted from a blob live in the "json" data source rather than
# "postgresql". The browser must pass it as GUAC_DATA_SOURCE.
JSON_DATA_SOURCE = "json"

_IV = b"\x00" * 16


class GuacamoleJsonAuthError(RuntimeError):
    """The auth-json blob could not be built (missing or malformed key)."""


def json_auth_available() -> bool:
    try:
        _secret_key()
        return True
    except GuacamoleJsonAuthError:
        return False


def _secret_key() -> bytes:
    raw = (settings.GUACAMOLE_JSON_SECRET_KEY or "").strip()
    if not raw:
        raise GuacamoleJsonAuthError(
            "GUACAMOLE_JSON_SECRET_KEY is not set — the direct Guacamole gateway "
            "cannot mint scoped tokens."
        )
    try:
        key = binascii.unhexlify(raw)
    except (binascii.Error, ValueError) as exc:
        raise GuacamoleJsonAuthError(
            "GUACAMOLE_JSON_SECRET_KEY must be 32 hexadecimal characters "
            "(the same 128-bit value as json-secret-key in guacamole.properties)."
        ) from exc
    if len(key) != 16:
        raise GuacamoleJsonAuthError(
            f"GUACAMOLE_JSON_SECRET_KEY must decode to 16 bytes, got {len(key)}."
        )
    return key


def encode_auth_blob(document: dict) -> str:
    """Sign + encrypt an auth-json document and return it base64-encoded."""
    key = _secret_key()
    # separators/sort_keys only to keep the blob deterministic for a given
    # document — the extension re-parses it, so formatting is free.
    payload = json.dumps(document, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(key, payload, hashlib.sha256).digest()

    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded = padder.update(signature + payload) + padder.finalize()

    encryptor = Cipher(algorithms.AES(key), modes.CBC(_IV)).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    return base64.b64encode(ciphertext).decode("ascii")


def build_connection_document(
    *,
    username: str,
    connection_name: str,
    parameters: dict[str, str],
    protocol: str = "rdp",
    ttl_seconds: int | None = None,
) -> dict:
    """
    One ephemeral user, one connection — nothing else is visible to the token.

    `username` is a synthetic per-allocation identity, not a real account: it
    only labels the Guacamole session in logs and the active-connections list,
    which is how force-stop and reconcile still find the tunnel.
    """
    ttl = ttl_seconds if ttl_seconds is not None else settings.RDP_GUAC_SESSION_TTL_SECONDS
    return {
        "username": username,
        # Milliseconds since epoch — after this the blob no longer mints tokens.
        "expires": int((time.time() + max(ttl, 30)) * 1000),
        "connections": {
            connection_name: {
                "protocol": protocol,
                "parameters": {k: str(v) for k, v in parameters.items() if v is not None},
            }
        },
    }
