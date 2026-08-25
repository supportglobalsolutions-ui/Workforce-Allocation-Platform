"""Structured security logging without secrets."""
from __future__ import annotations

import logging

from fastapi import Request

logger = logging.getLogger("security.auth")


def _client_ip(request: Request | None) -> str:
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host
    return "unknown"


def log_auth_failure(request: Request | None, *, reason: str, detail: str = "") -> None:
    path = request.url.path if request else "unknown"
    method = request.method if request else "?"
    logger.warning(
        "auth_failure reason=%s method=%s path=%s ip=%s detail=%s",
        reason,
        method,
        path,
        _client_ip(request),
        detail[:120],
    )


def log_auth_success(request: Request | None, *, uid: str, role: str) -> None:
    path = request.url.path if request else "unknown"
    logger.info(
        "auth_ok uid=%s role=%s path=%s ip=%s",
        uid[:12],
        role,
        path,
        _client_ip(request),
    )
