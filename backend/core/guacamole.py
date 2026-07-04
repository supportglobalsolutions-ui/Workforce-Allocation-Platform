import base64
import logging

import httpx
import redis as redis_lib

from .config import settings

logger = logging.getLogger(__name__)

_CACHE_KEY = "guac:auth"
_CACHE_TTL = 2700  # 45 min (tokens expire after 60 min)


class GuacamoleClient:
    """Thin wrapper around the Guacamole REST API."""

    def __init__(self, redis_client: redis_lib.Redis):
        self._redis = redis_client
        self._base = settings.GUACAMOLE_URL.rstrip("/")

    def _fetch_fresh_token(self) -> tuple[str, str]:
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
        data_source: str = data.get("dataSource", "postgresql")
        self._redis.setex(_CACHE_KEY, _CACHE_TTL, f"{token}:{data_source}")
        return token, data_source

    def _get_token(self) -> tuple[str, str]:
        cached = self._redis.get(_CACHE_KEY)
        if cached:
            token, data_source = cached.decode().split(":", 1)
            # Validate the cached token is still accepted by Guacamole.
            with httpx.Client(timeout=5.0) as client:
                check = client.get(
                    f"{self._base}/api/session/data/{data_source}/self",
                    params={"token": token},
                )
            if check.status_code == 200:
                return token, data_source
            # Token rejected (e.g. Guacamole restarted) — clear cache and re-fetch.
            self._redis.delete(_CACHE_KEY)
        return self._fetch_fresh_token()

    def _client_id(self, connection_id: str) -> str:
        _, data_source = self._get_token()
        return base64.b64encode(
            f"{connection_id}\0c\0{data_source}".encode()
        ).decode()

    def get_connection_url(self, connection_id: str) -> str:
        """Build the Guacamole web-client URL for a connection."""
        token, _ = self._get_token()
        return f"{self._base}/#/client/{self._client_id(connection_id)}?token={token}"

    def get_proxied_connection_path(
        self, connection_id: str, *, proxy_prefix: str = "/remote"
    ) -> str:
        """Same as get_connection_url but for embedding via Next.js /remote proxy."""
        token, _ = self._get_token()
        return f"{proxy_prefix}/#/client/{self._client_id(connection_id)}?token={token}"

    def get_tunnel_params(self, connection_id: str) -> tuple[str, str]:
        """Return (connect, token) for guacamole-common-js HTTPTunnel."""
        token, data_source = self._get_token()
        connect = base64.b64encode(
            f"{connection_id}\0c\0{data_source}".encode()
        ).decode()
        return connect, token

    def get_token(self) -> str:
        token, _ = self._get_token()
        return token

    def list_active_connections(self) -> dict[str, dict]:
        token, data_source = self._get_token()
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/activeConnections",
                params={"token": token},
            )
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict):
            return data
        return {}

    def kill_active_connections(self, connection_id: str) -> int:
        """Terminate all Guacamole sessions for a connection. Returns count killed."""
        try:
            token, data_source = self._get_token()
            actives = self.list_active_connections()
            to_kill: list[str] = []
            for active_id, meta in actives.items():
                if not isinstance(meta, dict):
                    continue
                cid = meta.get("connectionIdentifier") or meta.get("connectionID")
                if cid is not None and str(cid) == str(connection_id):
                    to_kill.append(str(active_id))
            if not to_kill:
                return 0
            patch = [{"op": "remove", "path": f"/{active_id}"} for active_id in to_kill]
            with httpx.Client(timeout=10.0) as client:
                resp = client.patch(
                    f"{self._base}/api/session/data/{data_source}/activeConnections",
                    params={"token": token},
                    json=patch,
                    headers={"Content-Type": "application/json"},
                )
                resp.raise_for_status()
            return len(to_kill)
        except Exception as exc:
            logger.warning("Guacamole kill_active_connections failed: %s", exc)
            return 0
