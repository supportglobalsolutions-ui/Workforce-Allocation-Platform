import base64
import hashlib
import logging
import time

import httpx
import redis as redis_lib

from .config import settings

logger = logging.getLogger(__name__)

_CACHE_PREFIX = "guac:auth"
_CACHE_TTL = 2700  # 45 min (tokens expire after 60 min)


def _token_cache_key(base_url: str) -> str:
    """Cache Guacamole tokens per gateway, never globally.

    A token is only valid on the node that minted it. With a gateway cluster
    (Phase 7) a single shared key would hand gw1's token to gw2, which rejects
    it — and the retry would evict the other node's good token in turn.
    """
    digest = hashlib.sha256(base_url.encode("utf-8")).hexdigest()[:12]
    return f"{_CACHE_PREFIX}:{digest}"


def raw_connection_id(connection_id: str | None) -> str:
    """Return the Guacamole identifier used by REST + /websocket-tunnel.

    The browser client URL uses base64 of ``{id}\\0c\\0{datasource}``. That
    encoded form stored on a machine must not be sent as GUAC_ID — Guacamole
    answers with 516 RESOURCE_NOT_FOUND and the viewer sits on Connecting.
    """
    raw = (connection_id or "").strip()
    if not raw:
        return raw
    try:
        pad = "=" * ((4 - len(raw) % 4) % 4)
        decoded = base64.b64decode(raw + pad, validate=False)
        if b"\x00c\x00" in decoded or b"\x00C\x00" in decoded:
            ident = decoded.split(b"\x00", 1)[0].decode("utf-8", errors="replace").strip()
            if ident:
                return ident
    except Exception:
        pass
    return raw


class GuacamoleClient:
    """Thin wrapper around the Guacamole REST API."""

    def __init__(
        self,
        redis_client: redis_lib.Redis,
        *,
        base_url: str | None = None,
        gateway_id: str | None = None,
    ):
        """
        `base_url` selects which Guacamole this client talks to. It defaults to
        the single configured node, so every existing caller is unchanged; a
        gateway cluster passes the chosen node's private URL (Phase 7).
        """
        self._redis = redis_client
        self._base = (base_url or settings.GUACAMOLE_URL).rstrip("/")
        self.gateway_id = gateway_id
        self._cache_key = _token_cache_key(self._base)
        # Per-instance memo. A single request often needs the token 3-6 times
        # (url + client id + tunnel info); without this each one re-validates
        # against Guacamole, adding a round-trip apiece to every claim.
        self._token_memo: tuple[str, str] | None = None

    @property
    def base_url(self) -> str:
        return self._base

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
        self._redis.setex(self._cache_key, _CACHE_TTL, f"{token}:{data_source}")
        self._token_memo = (token, data_source)
        return token, data_source

    def _get_token(self) -> tuple[str, str]:
        if self._token_memo is not None:
            return self._token_memo

        cached = self._redis.get(self._cache_key)
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
            self._redis.delete(self._cache_key)
        return self._fetch_fresh_token()

    def _client_id(self, connection_id: str) -> str:
        _, data_source = self._get_token()
        ident = raw_connection_id(connection_id)
        return base64.b64encode(
            f"{ident}\0c\0{data_source}".encode()
        ).decode()

    def get_connection_url(self, connection_id: str) -> str:
        """Build the Guacamole web-client path for a connection (no auth token).

        Never embed guacadmin (or any Guacamole) tokens in URLs returned to
        browsers. The browser canvas uses the FastAPI ws-tunnel, which mints
        the token server-side.
        """
        return f"{self._base}/#/client/{self._client_id(connection_id)}"

    def get_proxied_connection_path(
        self, connection_id: str, *, proxy_prefix: str = "/remote"
    ) -> str:
        """Same as get_connection_url but under a path prefix (no auth token)."""
        return f"{proxy_prefix}/#/client/{self._client_id(connection_id)}"

    def get_tunnel_connect_info(self, connection_id: str) -> dict[str, str]:
        """Server-side Guacamole tunnel params. Token must never leave the API."""
        token, data_source = self._get_token()
        ident = raw_connection_id(connection_id)
        client_id = base64.b64encode(
            f"{ident}\0c\0{data_source}".encode()
        ).decode()
        return {
            "token": token,
            "data_source": data_source,
            "connection_id": ident,
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
        ident = raw_connection_id(connection_id)
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/connections/{ident}",
                params={"token": token},
            )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()

    def get_connection_parameters(self, connection_id: str) -> dict[str, str]:
        """Stored protocol parameters (hostname/port/username/password/...)."""
        token, data_source = self._get_token()
        ident = raw_connection_id(connection_id)
        with httpx.Client(timeout=10.0) as client:
            resp = client.get(
                f"{self._base}/api/session/data/{data_source}/connections/{ident}/parameters",
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
        ident = raw_connection_id(connection_id)
        payload = {
            "identifier": ident,
            "parentIdentifier": parent_identifier,
            "name": name,
            "protocol": protocol,
            "parameters": parameters,
            "attributes": attributes or {},
        }
        with httpx.Client(timeout=15.0) as client:
            resp = client.put(
                f"{self._base}/api/session/data/{data_source}/connections/{ident}",
                params={"token": token},
                json=payload,
            )
            resp.raise_for_status()

    def delete_connection(self, connection_id: str) -> bool:
        token, data_source = self._get_token()
        ident = raw_connection_id(connection_id)
        with httpx.Client(timeout=10.0) as client:
            resp = client.delete(
                f"{self._base}/api/session/data/{data_source}/connections/{ident}",
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
                if cid is not None and raw_connection_id(str(cid)) == raw_connection_id(connection_id):
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

    def close_and_confirm(self, connection_id: str, *, timeout_seconds: float = 5.0) -> dict[str, object]:
        """Close one resource's tunnels and prove they have gone away.

        A desktop can become available only after this returns ``closed`` or
        ``already_closed``. The structured outcome keeps gateway failure
        distinct from a connection that simply ended before the request.
        """
        ident = raw_connection_id(connection_id)
        try:
            active_before = self.list_active_connections()
            matching = [
                str(active_id)
                for active_id, meta in active_before.items()
                if isinstance(meta, dict)
                and raw_connection_id(str(meta.get("connectionIdentifier") or meta.get("connectionID") or "")) == ident
            ]
            if not matching:
                return {"outcome": "already_closed", "closed": 0}

            token, data_source = self._get_token()
            patch = [{"op": "remove", "path": f"/{active_id}"} for active_id in matching]
            with httpx.Client(timeout=10.0) as client:
                response = client.patch(
                    f"{self._base}/api/session/data/{data_source}/activeConnections",
                    params={"token": token},
                    json=patch,
                    headers={"Content-Type": "application/json"},
                )
                response.raise_for_status()

            deadline = time.monotonic() + timeout_seconds
            while time.monotonic() < deadline:
                remaining = [
                    meta for meta in self.list_active_connections().values()
                    if isinstance(meta, dict)
                    and raw_connection_id(str(meta.get("connectionIdentifier") or meta.get("connectionID") or "")) == ident
                ]
                if not remaining:
                    return {"outcome": "closed", "closed": len(matching)}
                time.sleep(0.2)
            return {"outcome": "pending", "closed": 0}
        except Exception as exc:
            logger.warning("Guacamole close-and-confirm failed for %s: %s", ident, exc)
            return {"outcome": "failed", "closed": 0, "error": type(exc).__name__}
