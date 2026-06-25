import base64

import httpx
import redis as redis_lib

from .config import settings

_CACHE_KEY = "guac:auth"
_CACHE_TTL = 2700  # 45 min (tokens expire after 60 min)


class GuacamoleClient:
    """Thin wrapper around the Guacamole REST API."""

    def __init__(self, redis_client: redis_lib.Redis):
        self._redis = redis_client
        self._base = settings.GUACAMOLE_URL.rstrip("/")

    def _get_token(self) -> tuple[str, str]:
        cached = self._redis.get(_CACHE_KEY)
        if cached:
            token, data_source = cached.decode().split(":", 1)
            return token, data_source

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{self._base}/api/tokens",
                data={
                    "username": settings.GUACAMOLE_USERNAME,
                    "password": settings.GUACAMOLE_PASSWORD,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        token: str = data["authToken"]
        data_source: str = data.get("dataSource", "mysql")
        self._redis.setex(_CACHE_KEY, _CACHE_TTL, f"{token}:{data_source}")
        return token, data_source

    def get_connection_url(self, connection_id: str) -> str:
        """Build the Guacamole web-client URL for a connection."""
        token, data_source = self._get_token()
        client_id = base64.b64encode(
            f"{connection_id}\0c\0{data_source}".encode()
        ).decode()
        return f"{self._base}/#/client/{client_id}?token={token}"

    def get_token(self) -> str:
        token, _ = self._get_token()
        return token
