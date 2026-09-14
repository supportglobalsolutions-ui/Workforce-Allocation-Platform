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
        # Per-instance memo. A single request often needs the token 3-6 times
        # (url + client id + tunnel info); without this each one re-validates
        # against Guacamole, adding a round-trip apiece to every claim.
        self._token_memo: tuple[str, str] | None = None

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
        self._token_memo = (token, data_source)
        return token, data_source

    def _get_token(self) -> tuple[str, str]:
        if self._token_memo is not None:
            return self._token_memo

        cached = self._redis.get(_CACHE_KEY)
        if cached:
            token, data_source = cached.decode().split(":", 1)
            # Validate the cached token is still accepted by Guacamole.
            with httpx.Client(timeout=15.0) as client:
                check = client.get(
                    f"{self._base}/api/session/data/{data_source}/self",
                    params={"token": token},
                )
            if check.status_code == 200:
                self._token_memo = (token, data_source)
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

    def get_tunnel_connect_info(self, connection_id: str) -> dict[str, str]:
        """Auth token + identifiers for guacamole-common-js tunnel connect data."""
        token, data_source = self._get_token()
        # Guacamole's WebSocket endpoint expects the same encoded client
        # identifier used in its normal browser URL, not the raw database
        # connection ID. Passing the raw value results in a 516
        # RESOURCE_NOT_FOUND / "Requested tunnel destination does not exist".
        client_id = base64.b64encode(
            f"{connection_id}\0c\0{data_source}".encode()
        ).decode()
        return {
            "token": token,
            "data_source": data_source,
            "connection_id": str(connection_id),
            "client_id": client_id,
        }

    def get_token(self) -> str:
        token, _ = self._get_token()
        return token

    # ── Connection management (auto-provisioning) ─────────────────────────

    def list_connections(self) -> dict[str, dict]:
        """All connections visible to the API user, keyed by identifier."""
        token, data_source = self._get_token()
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/connections",
                params={"token": token},
            )
            resp.raise_for_status()
            data = resp.json()
        return data if isinstance(data, dict) else {}

    def find_connection_by_name(self, name: str) -> dict | None:
        """Guacamole enforces unique names per group — find one by its name."""
        for identifier, meta in self.list_connections().items():
            if isinstance(meta, dict) and meta.get("name") == name:
                return {**meta, "identifier": meta.get("identifier") or identifier}
        return None

    def get_connection(self, connection_id: str) -> dict | None:
        token, data_source = self._get_token()
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/connections/{connection_id}",
                params={"token": token},
            )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def get_connection_parameters(self, connection_id: str) -> dict[str, str]:
        """Stored protocol parameters (hostname/port/username/password/...)."""
        token, data_source = self._get_token()
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/connections/{connection_id}/parameters",
                params={"token": token},
            )
        if resp.status_code == 404:
            return {}
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, dict) else {}

    def create_connection(
        self,
        *,
        name: str,
        parameters: dict[str, str],
        attributes: dict[str, str] | None = None,
        protocol: str = "rdp",
        parent_identifier: str = "ROOT",
    ) -> str:
        """Create a connection and return its Guacamole identifier."""
        token, data_source = self._get_token()
        payload = {
            "parentIdentifier": parent_identifier,
            "name": name,
            "protocol": protocol,
            "parameters": parameters,
            "attributes": attributes or {},
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                f"{self._base}/api/session/data/{data_source}/connections",
                params={"token": token},
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
        identifier = data.get("identifier")
        if not identifier:
            raise RuntimeError("Guacamole did not return a connection identifier")
        return str(identifier)

    def update_connection(
        self,
        connection_id: str,
        *,
        name: str,
        parameters: dict[str, str],
        attributes: dict[str, str] | None = None,
        protocol: str = "rdp",
        parent_identifier: str = "ROOT",
    ) -> None:
        token, data_source = self._get_token()
        payload = {
            "identifier": str(connection_id),
            "parentIdentifier": parent_identifier,
            "name": name,
            "protocol": protocol,
            "parameters": parameters,
            "attributes": attributes or {},
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.put(
                f"{self._base}/api/session/data/{data_source}/connections/{connection_id}",
                params={"token": token},
                json=payload,
            )
            resp.raise_for_status()

    def delete_connection(self, connection_id: str) -> bool:
        token, data_source = self._get_token()
        with httpx.Client(timeout=10.0) as client:
            resp = client.delete(
                f"{self._base}/api/session/data/{data_source}/connections/{connection_id}",
                params={"token": token},
            )
        if resp.status_code == 404:
            return False
        resp.raise_for_status()
        return True

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
