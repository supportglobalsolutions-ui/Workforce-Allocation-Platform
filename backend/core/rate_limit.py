"""Redis sliding-window rate limits for auth and sensitive routes."""
from __future__ import annotations

import logging

import redis as redis_lib
from fastapi import HTTPException, Request, status

from core.config import settings
from core.redis import get_redis

logger = logging.getLogger(__name__)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
    key_suffix: str = "",
) -> None:
    """Raise 429 when the limit for this scope + IP (+ optional suffix) is exceeded."""
    ip = _client_ip(request)
    key = f"rate:{scope}:{ip}"
    if key_suffix:
        key = f"{key}:{key_suffix}"

    try:
        redis_client = get_redis()
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        count, _ = pipe.execute()
        if int(count) > limit:
            logger.warning("Rate limit exceeded scope=%s ip=%s count=%s", scope, ip, count)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait and try again.",
            )
    except HTTPException:
        raise
    except redis_lib.RedisError as exc:
        if settings.is_production:
            logger.error("Rate limiter unavailable: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Service temporarily unavailable.",
            ) from exc
        logger.warning("Rate limiter skipped (Redis unavailable): %s", exc)


def enforce_global_rate_limit(request: Request) -> None:
    """Light per-IP cap on all API traffic."""
    check_rate_limit(request, scope="global", limit=300, window_seconds=60)
