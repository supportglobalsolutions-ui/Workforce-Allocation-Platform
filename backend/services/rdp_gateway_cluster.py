"""Gateway cluster registry — sticky placement and maintenance drain (Phase 7).

Gateways are configured in env (no DB table required for Stage 2 bootstrap):

    RDP_GATEWAYS='[
      {"id":"gw1","public_url":"https://guac1.example.com","private_url":"http://10.0.0.2:8080/guacamole","capacity":50},
      {"id":"gw2","public_url":"https://guac2.example.com","private_url":"http://10.0.0.3:8080/guacamole","capacity":50,"draining":false}
    ]'

When empty, the single-gateway path uses GUACAMOLE_PUBLIC_URL / GUACAMOLE_URL
(same behaviour as Phase 5).

Sticky rule: an open allocation keeps its gateway_id on reconnect. New claims
pick the least-loaded non-draining gateway under its capacity.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import redis as redis_lib
from sqlmodel import Session, select

from core.config import settings
from models.allocation import Allocation

logger = logging.getLogger(__name__)

_DRAIN_KEY = "rdp:gateway:drain:{gateway_id}"
_HEALTH_KEY = "rdp:gateway:health:{gateway_id}"

# Health markers outlive one coordinator tick but not many. If the coordinator
# dies the markers expire and every gateway is treated as usable again — the
# cluster degrades to blind placement rather than refusing all new claims
# (Principle 4: unknown is not free).
_HEALTH_TTL_SECONDS = max(90, int(settings.RDP_LIFECYCLE_INTERVAL_SECONDS) * 3)


@dataclass(frozen=True)
class GatewayNode:
    id: str
    public_url: str
    private_url: str
    capacity: int
    draining: bool = False

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "public_url": self.public_url,
            "private_url": self.private_url,
            "capacity": self.capacity,
            "draining": self.draining,
        }


def _normalize_url(url: str) -> str:
    return (url or "").strip().rstrip("/")


def parse_gateways(raw: str | None = None) -> list[GatewayNode]:
    """Parse RDP_GATEWAYS JSON. Invalid entries are skipped with a warning."""
    text = (raw if raw is not None else settings.RDP_GATEWAYS or "").strip()
    if not text:
        # Single-node fallback from Phase 5 settings.
        public = settings.guacamole_public_url
        private = _normalize_url(settings.GUACAMOLE_URL)
        if not public and not private:
            return []
        return [
            GatewayNode(
                id="default",
                public_url=public or private,
                private_url=private or public,
                capacity=int(
                    settings.RDP_GATEWAY_CAPACITY
                    or (settings.RDP_MAX_LIVE_SESSIONS if settings.RDP_MAX_LIVE_SESSIONS > 0 else 50)
                ),
                draining=False,
            )
        ]

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        logger.error("RDP_GATEWAYS is not valid JSON: %s", exc)
        return []

    if not isinstance(data, list):
        logger.error("RDP_GATEWAYS must be a JSON array")
        return []

    nodes: list[GatewayNode] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            continue
        gid = str(item.get("id") or "").strip()
        public = _normalize_url(str(item.get("public_url") or ""))
        private = _normalize_url(str(item.get("private_url") or public))
        if not gid or not public:
            logger.warning("Skipping gateway entry missing id/public_url: %s", item)
            continue
        if gid in seen:
            logger.warning("Duplicate gateway id %s — skipping", gid)
            continue
        seen.add(gid)
        try:
            capacity = int(item.get("capacity") or settings.RDP_GATEWAY_CAPACITY or 50)
        except (TypeError, ValueError):
            capacity = 50
        draining = bool(item.get("draining", False))
        nodes.append(
            GatewayNode(
                id=gid,
                public_url=public,
                private_url=private or public,
                capacity=max(1, capacity),
                draining=draining,
            )
        )
    return nodes


def is_draining(redis_client: redis_lib.Redis | None, node: GatewayNode) -> bool:
    """Env drain OR Redis override (admin maintenance without redeploy)."""
    if node.draining:
        return True
    if redis_client is None:
        return False
    try:
        return bool(redis_client.exists(_DRAIN_KEY.format(gateway_id=node.id)))
    except Exception as exc:
        logger.warning("Could not read drain flag for %s: %s", node.id, exc)
        return node.draining


def set_draining(
    redis_client: redis_lib.Redis, gateway_id: str, *, draining: bool
) -> None:
    key = _DRAIN_KEY.format(gateway_id=gateway_id)
    if draining:
        redis_client.set(key, "1")
    else:
        redis_client.delete(key)


# ── Reachability ─────────────────────────────────────────────────────────
#
# Surviving gateway loss means not placing new sessions on a node that is
# already gone. Placement must stay cheap, so it only reads a marker; the
# coordinator does the actual probing on its tick.


def is_unhealthy(redis_client: redis_lib.Redis | None, node: GatewayNode) -> bool:
    """
    True only when a node has been *positively observed* failing.

    Absent marker means "not probed recently", which is treated as usable on
    purpose: a broken probe, an expired marker or a dead coordinator must not
    empty the pool and refuse every claim.
    """
    if redis_client is None:
        return False
    try:
        marker = redis_client.get(_HEALTH_KEY.format(gateway_id=node.id))
    except Exception as exc:
        logger.warning("Could not read health marker for %s: %s", node.id, exc)
        return False
    if not marker:
        return False
    value = marker.decode() if isinstance(marker, bytes) else str(marker)
    return value == "down"


def record_gateway_health(
    redis_client: redis_lib.Redis, gateway_id: str, *, healthy: bool
) -> None:
    try:
        redis_client.setex(
            _HEALTH_KEY.format(gateway_id=gateway_id),
            _HEALTH_TTL_SECONDS,
            "up" if healthy else "down",
        )
    except Exception as exc:
        logger.warning("Could not record health for gateway %s: %s", gateway_id, exc)


def probe_gateway(redis_client: redis_lib.Redis, node: GatewayNode) -> bool:
    """Can we still authenticate against this node's REST API?"""
    from core.guacamole import GuacamoleClient

    try:
        GuacamoleClient(
            redis_client, base_url=node.private_url, gateway_id=node.id
        ).get_token()
        return True
    except Exception as exc:
        logger.warning("Gateway %s failed its health probe: %s", node.id, exc)
        return False


def refresh_gateway_health(redis_client: redis_lib.Redis) -> dict[str, bool]:
    """Probe every configured gateway and publish the result. Coordinator-owned."""
    results: dict[str, bool] = {}
    for node in parse_gateways():
        healthy = probe_gateway(redis_client, node)
        record_gateway_health(redis_client, node.id, healthy=healthy)
        results[node.id] = healthy
    return results


def live_count_by_gateway(db: Session) -> dict[str, int]:
    counts: dict[str, int] = {}
    rows = db.exec(
        select(Allocation.gateway_id).where(Allocation.released_at.is_(None))
    ).all()
    for gid in rows:
        key = (gid or "default").strip() or "default"
        counts[key] = counts.get(key, 0) + 1
    return counts


def find_gateway(gateway_id: str | None) -> GatewayNode | None:
    """
    Strict lookup: exactly this id, or None.

    `get_gateway` deliberately falls back to a usable node so a session with a
    stale gateway_id still gets a working client. Anything acting *on* a named
    gateway — draining it for maintenance — must not accept that fallback, or a
    mistyped id reports success while the real node keeps taking sessions.
    """
    if not gateway_id:
        return None
    return next((n for n in parse_gateways() if n.id == gateway_id), None)


def get_gateway(gateway_id: str | None) -> GatewayNode | None:
    nodes = {n.id: n for n in parse_gateways()}
    if gateway_id and gateway_id in nodes:
        return nodes[gateway_id]
    if "default" in nodes:
        return nodes["default"]
    return next(iter(nodes.values()), None)


def pick_gateway(
    db: Session,
    redis_client: redis_lib.Redis | None = None,
    *,
    preferred_id: str | None = None,
) -> GatewayNode | None:
    """
    Sticky first: if preferred_id is still healthy and not draining, keep it.
    Otherwise choose the least-loaded non-draining gateway under capacity.
    """
    nodes = parse_gateways()
    if not nodes:
        return None

    counts = live_count_by_gateway(db)

    def usable(n: GatewayNode) -> bool:
        """Accepting work at all: not draining, not known-dead."""
        return not is_draining(redis_client, n) and not is_unhealthy(redis_client, n)

    def eligible(n: GatewayNode) -> bool:
        return usable(n) and counts.get(n.id, 0) < n.capacity

    if preferred_id:
        preferred = next((n for n in nodes if n.id == preferred_id), None)
        if preferred and eligible(preferred):
            return preferred
        # Preferred exists but is draining, dead or full — fall through and
        # re-place. This is what moves a reconnect off a lost gateway.

    candidates = [n for n in nodes if eligible(n)]
    if candidates:
        return min(candidates, key=lambda n: (counts.get(n.id, 0), n.id))

    # Everything is full, draining or down. Prefer a node that is merely full
    # over one that is draining or dead, so an over-capacity cluster still
    # serves reconnects; return None only when nothing is usable at all, and
    # let the caller refuse with a clear at-capacity message.
    active = [n for n in nodes if usable(n)]
    if not active:
        return None
    return min(active, key=lambda n: (counts.get(n.id, 0), n.id))


def assign_gateway_to_allocation(
    db: Session,
    allocation: Allocation,
    redis_client: redis_lib.Redis | None = None,
) -> GatewayNode | None:
    """Persist sticky gateway_id on the allocation. Returns the chosen node."""
    node = pick_gateway(
        db,
        redis_client,
        preferred_id=allocation.gateway_id,
    )
    if node is None:
        return None
    if allocation.gateway_id != node.id:
        allocation.gateway_id = node.id
        allocation.version = int(allocation.version or 1) + 1
        db.add(allocation)
        db.commit()
        db.refresh(allocation)
    return node


def list_gateways_status(
    db: Session, redis_client: redis_lib.Redis | None = None
) -> list[dict[str, Any]]:
    counts = live_count_by_gateway(db)
    out: list[dict[str, Any]] = []
    for node in parse_gateways():
        live = counts.get(node.id, 0)
        draining = is_draining(redis_client, node)
        unhealthy = is_unhealthy(redis_client, node)
        out.append(
            {
                **node.as_dict(),
                "draining": draining,
                "healthy": not unhealthy,
                "live_sessions": live,
                "available": (not draining) and (not unhealthy) and live < node.capacity,
            }
        )
    return out


def admit_connect(
    redis_client: redis_lib.Redis | None, gateway_id: str
) -> tuple[bool, int]:
    """
    Rate-shape **new** connects per gateway. Returns (admitted, retry_after_ms).

    When a media node restarts, every tunnel it held drops at the same instant
    and every viewer retries at once — a thundering herd against guacd and
    Nginx exactly when they are least able to take it. A fixed-window counter
    per second is enough to flatten that: the excess is told to come back
    shortly rather than piling on, and the worker still has their whole grace
    window to reconnect in.

    Fails open. If Redis cannot answer we admit the connect — refusing real
    workers because of a broken limiter would be a worse outage than the herd.
    """
    limit = int(settings.RDP_GATEWAY_ADMIT_PER_SECOND or 0)
    if limit <= 0 or redis_client is None:
        return True, 0
    try:
        # Whole-second bucket: cheap, self-expiring, and good enough for
        # smoothing a burst. Not a precise limiter, and does not need to be.
        import time

        bucket = int(time.time())
        key = f"rdp:gateway:admit:{gateway_id}:{bucket}"
        used = int(redis_client.incr(key))
        if used == 1:
            redis_client.expire(key, 2)
        if used <= limit:
            return True, 0
        # Spread the overflow across the next second instead of releasing it
        # all on the same tick boundary.
        overflow = used - limit
        retry_after_ms = 1000 + min(overflow, 20) * 250
        return False, retry_after_ms
    except Exception as exc:
        logger.warning("Admission check failed for gateway %s: %s", gateway_id, exc)
        return True, 0


def client_for_allocation(
    redis_client: redis_lib.Redis,
    allocation: Allocation | None,
):
    """
    A `GuacamoleClient` pointed at the node this session actually lives on.

    Killing a tunnel, confirming it closed, or reconciling a connection has to
    talk to the gateway holding it. Against the wrong node those calls quietly
    succeed while the real session keeps running — the machine would be handed
    to the next worker with someone still on it.
    """
    from core.guacamole import GuacamoleClient

    node = get_gateway(allocation.gateway_id if allocation else None)
    if node is None:
        return GuacamoleClient(redis_client)
    return GuacamoleClient(
        redis_client, base_url=node.private_url, gateway_id=node.id
    )


def public_url_for_allocation(
    db: Session,
    allocation: Allocation,
    redis_client: redis_lib.Redis | None = None,
) -> str:
    """URL the browser should open for this allocation's media plane."""
    node = assign_gateway_to_allocation(db, allocation, redis_client)
    if node:
        return node.public_url
    return settings.guacamole_public_url
