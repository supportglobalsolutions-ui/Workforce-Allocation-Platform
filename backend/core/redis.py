import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

from .config import settings

_client: redis.Redis | None = None

# Keep auth/API responsive when Redis is down (Docker not running, etc.).
# Without this, the default connect can hang for many seconds per request and
# trip the frontend's sign-in timeout.
_SOCKET_CONNECT_TIMEOUT = 0.5
_SOCKET_TIMEOUT = 1.0


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=False,
            socket_connect_timeout=_SOCKET_CONNECT_TIMEOUT,
            socket_timeout=_SOCKET_TIMEOUT,
            retry=Retry(NoBackoff(), 0),
            retry_on_timeout=False,
        )
    return _client
