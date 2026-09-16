"""
Bidirectional reconciliation of allocations against live gateway sessions
(Phase 8 Action 1).

`rdp_reconcile` repairs connection *definitions* — the catalogue entries that
go missing when Guacamole starts with an empty database. Nothing compared our
*sessions* against the gateway's, which left two ways to lose a machine
silently:

**Direction A — allocation with no session.** A worker shuts the laptop while
the API is restarting. Nobody observes the WebSocket close, so the resource
stays `active`; the coordinator only ever inspects resources already marked
`idle`, so it never looks again. The machine is held for that worker forever.

**Direction B — session with no allocation.** A crash between "guacd connection
opened" and "allocation row committed" leaves a live desktop nobody owns:
invisible to the state model, burning RAM, with a Windows session attached.

Both are fixed by comparing the two pictures every tick.

Safety rules, in order of importance:

1. **Never release directly.** Direction A marks the resource `idle` and
   stamps `status_changed_at`, handing it to the existing 5-minute grace. The
   worker still gets their reconnect window.
2. **Two consecutive observations** before acting (`RDP_SWEEP_CONFIRMATIONS`).
   One flaky REST call to Guacamole must not start a release clock on a
   perfectly healthy session.
3. **An unreachable gateway is unknown, not empty** (Principle 4). If a node
   failed its health probe this tick, every session it might be holding is
   invisible — treat its machines as untouched rather than sessionless.
4. **Carry the generation** (Principle 8). A reconnect that raced the sweep
   bumps `connection_generation`, and the sweep's write becomes a no-op.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from uuid import UUID

import redis as redis_lib
from sqlmodel import Session, select

from core.config import settings
from core.guacamole import raw_connection_id
from models.allocation import Allocation
from models.enums import AllocationLifecycleEnum, RdpStatusEnum, TunnelStatusEnum
from models.rdp_machine import RDPResource
from services.rdp_state import utc_now

logger = logging.getLogger(__name__)

# How many consecutive sessionless observations a machine has accumulated.
_MISS_KEY = "rdp:sweep:miss:{rdp_id}"
# Long enough to survive a few ticks, short enough that a machine which
# reconnects and later drops starts counting from scratch.
_MISS_TTL_SECONDS = 3600


@dataclass
class SweepStats:
    gateways_seen: int = 0
    gateways_skipped: int = 0
    live_sessions: int = 0
    marked_idle: int = 0
    grace_cancelled: int = 0
    orphans_found: int = 0
    orphans_killed: int = 0
    awaiting_confirmation: int = 0
    errors: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "gateways_seen": self.gateways_seen,
            "gateways_skipped": self.gateways_skipped,
            "live_sessions": self.live_sessions,
            "marked_idle": self.marked_idle,
            "grace_cancelled": self.grace_cancelled,
            "orphans_found": self.orphans_found,
            "orphans_killed": self.orphans_killed,
            "awaiting_confirmation": self.awaiting_confirmation,
            "errors": self.errors[:5],
        }

    @property
    def interesting(self) -> bool:
        return bool(
            self.marked_idle
            or self.grace_cancelled
            or self.orphans_found
            or self.orphans_killed
            or self.errors
        )


def _miss_key(rdp_id: UUID | str) -> str:
    return _MISS_KEY.format(rdp_id=rdp_id)


def _record_miss(redis_client: redis_lib.Redis, rdp_id: UUID | str) -> int:
    """Count one sessionless observation. Returns the running total."""
    try:
        key = _miss_key(rdp_id)
        count = int(redis_client.incr(key))
        redis_client.expire(key, _MISS_TTL_SECONDS)
        return count
    except Exception as exc:
        logger.warning("Could not record sweep miss for %s: %s", rdp_id, exc)
        # Unknown count — report 0 so we never act on an unverifiable miss.
        return 0


def clear_miss(redis_client: redis_lib.Redis, rdp_id: UUID | str) -> None:
    """Forget the miss streak. Called whenever a live session is seen."""
    try:
        redis_client.delete(_miss_key(rdp_id))
    except Exception:
        pass


def _live_sessions_by_connection(
    redis_client: redis_lib.Redis,
    stats: SweepStats,
) -> tuple[dict[str, list[tuple[str, str]]], set[str]]:
    """
    Ask every reachable gateway what it is currently running.

    Returns ``({connection_id: [(gateway_id, active_id), ...]}, reachable_ids)``.
    A gateway missing from `reachable_ids` told us nothing this tick, so its
    machines must not be judged sessionless.
    """
    from core.guacamole import GuacamoleClient
    from services.rdp_gateway_cluster import is_unhealthy, parse_gateways

    by_connection: dict[str, list[tuple[str, str]]] = {}
    reachable: set[str] = set()

    for node in parse_gateways():
        if is_unhealthy(redis_client, node):
            # Rule 3: unknown, not empty.
            stats.gateways_skipped += 1
            continue
        try:
            client = GuacamoleClient(
                redis_client, base_url=node.private_url, gateway_id=node.id
            )
            active = client.list_active_connections()
        except Exception as exc:
            stats.gateways_skipped += 1
            stats.errors.append(f"{node.id}: {type(exc).__name__}")
            logger.warning("Sweep could not read gateway %s: %s", node.id, exc)
            continue

        reachable.add(node.id)
        stats.gateways_seen += 1
        for active_id, meta in active.items():
            if not isinstance(meta, dict):
                continue
            cid = raw_connection_id(
                str(meta.get("connectionIdentifier") or meta.get("connectionID") or "")
            )
            if not cid:
                continue
            by_connection.setdefault(cid, []).append((node.id, str(active_id)))
            stats.live_sessions += 1

    return by_connection, reachable


def _gateway_was_read(
    allocation: Allocation, reachable: set[str], gateway_count: int
) -> bool:
    """Did we actually hear from the node that would be holding this session?"""
    if not reachable:
        return False
    if allocation.gateway_id:
        return allocation.gateway_id in reachable
    # No sticky placement recorded (single-node deploys, or pre-Phase-7 rows).
    # Only safe to judge when every configured gateway answered.
    return len(reachable) == gateway_count


def run_session_sweep(
    db: Session,
    redis_client: redis_lib.Redis,
    *,
    allow_mutations: bool = True,
) -> SweepStats:
    """
    One reconciliation pass. Coordinator-owned, leader-elected.

    `allow_mutations=False` observes and reports without changing anything —
    what degraded mode passes, so an outage still produces visibility without
    ever taking a machine away from someone.
    """
    from services.rdp_gateway_cluster import parse_gateways

    stats = SweepStats()
    gateway_count = len(parse_gateways())
    live, reachable = _live_sessions_by_connection(redis_client, stats)

    open_allocs = db.exec(
        select(Allocation).where(Allocation.released_at.is_(None))
    ).all()
    owned_connections: set[str] = set()

    # ── Direction A: open allocation with no live session ────────────────
    for alloc in open_allocs:
        resource = db.get(RDPResource, alloc.rdp_resource_id)
        if resource is None:
            continue
        connection_id = raw_connection_id(resource.guacamole_connection_id)
        if connection_id:
            owned_connections.add(connection_id)

        # Quarantined allocations are deliberately held; the sweep must not
        # quietly convert that into a grace clock.
        if alloc.allocation_status == AllocationLifecycleEnum.quarantined:
            continue
        if not _gateway_was_read(alloc, reachable, gateway_count):
            continue

        session_is_live = bool(connection_id) and connection_id in live

        # ── Direction C: the machine is counting down but the tunnel is back ──
        #
        # On the direct gateway path the browser reconnects straight to
        # Guacamole, so nothing in the control plane sees it happen —
        # `prepare_connect` only runs on the proxy tunnel. Without this the
        # grace clock keeps running under a live session and the coordinator
        # releases the machine out from under a working worker.
        #
        # Deliberately runs even while degraded: seeing a live session is
        # positive evidence, and acting on it only ever *keeps* a machine with
        # its owner. Only actions that take a machine away are frozen.
        if resource.status == RdpStatusEnum.idle and session_is_live:
            clear_miss(redis_client, resource.id)
            try:
                resource.status = RdpStatusEnum.active
                resource.status_changed_at = utc_now()
                resource.version = int(resource.version or 1) + 1
                alloc.tunnel_status = TunnelStatusEnum.connected
                alloc.last_gateway_observation_at = utc_now()
                alloc.version = int(alloc.version or 1) + 1
                db.add(resource)
                db.add(alloc)
                db.commit()
                stats.grace_cancelled += 1
                logger.info(
                    "Sweep: %s has a live gateway session while in grace — "
                    "cancelling the release clock (gen=%s)",
                    resource.nickname,
                    int(alloc.connection_generation),
                )
            except Exception as exc:
                db.rollback()
                stats.errors.append(f"resume {resource.nickname}: {type(exc).__name__}")
                logger.warning("Sweep could not cancel grace for %s: %s", resource.id, exc)
            continue

        # Anything not `active` from here on is already counting down (or in a
        # state the sweep does not judge), so there is nothing to start.
        if resource.status != RdpStatusEnum.active:
            continue

        if session_is_live:
            clear_miss(redis_client, resource.id)
            continue

        misses = _record_miss(redis_client, resource.id)
        if misses < max(int(settings.RDP_SWEEP_CONFIRMATIONS), 1):
            stats.awaiting_confirmation += 1
            continue
        if not allow_mutations:
            stats.awaiting_confirmation += 1
            continue

        # Rule 1: hand it to grace, do not release it here.
        # Rule 4: re-read and compare the generation we decided on, so a
        # reconnect that happened during this pass wins.
        db.refresh(alloc)
        if alloc.released_at is not None:
            continue
        observed_generation = int(alloc.connection_generation)
        current = db.get(RDPResource, resource.id)
        if current is None or current.status != RdpStatusEnum.active:
            continue
        fresh_alloc = db.exec(
            select(Allocation).where(
                Allocation.rdp_resource_id == resource.id,
                Allocation.released_at.is_(None),
            )
        ).first()
        if fresh_alloc is None or int(fresh_alloc.connection_generation) != observed_generation:
            # Stale actor — a reconnect bumped the generation. No-op.
            clear_miss(redis_client, resource.id)
            continue

        current.status = RdpStatusEnum.idle
        current.status_changed_at = utc_now()
        current.version = int(current.version or 1) + 1
        db.add(current)
        db.commit()
        clear_miss(redis_client, resource.id)
        stats.marked_idle += 1
        logger.info(
            "Sweep: %s has no gateway session after %s observations — starting "
            "%ss grace (gen=%s)",
            current.nickname,
            misses,
            settings.RDP_DISCONNECT_GRACE_SECONDS,
            observed_generation,
        )

    # ── Direction B: live session with no open allocation ────────────────
    for connection_id, holders in live.items():
        if connection_id in owned_connections:
            continue
        stats.orphans_found += 1
        resource = db.exec(
            select(RDPResource).where(
                RDPResource.guacamole_connection_id == connection_id
            )
        ).first()
        label = resource.nickname if resource else connection_id

        if not allow_mutations or not settings.RDP_SWEEP_KILL_ORPHANS:
            logger.warning(
                "Sweep: live session on %s has no open allocation "
                "(reporting only; set RDP_SWEEP_KILL_ORPHANS=true to reclaim)",
                label,
            )
            continue

        for gateway_id, _active_id in holders:
            try:
                _kill_orphan(db, redis_client, gateway_id, connection_id, label, resource)
                stats.orphans_killed += 1
            except Exception as exc:
                stats.errors.append(f"orphan {label}: {type(exc).__name__}")
                logger.warning("Sweep could not kill orphan on %s: %s", label, exc)

    return stats


def _kill_orphan(
    db: Session,
    redis_client: redis_lib.Redis,
    gateway_id: str,
    connection_id: str,
    label: str,
    resource: RDPResource | None,
) -> None:
    """Close an unowned session on the node that holds it, and record why."""
    from core.guacamole import GuacamoleClient
    from services.audit_service import record_audit
    from services.rdp_gateway_cluster import find_gateway

    node = find_gateway(gateway_id)
    client = GuacamoleClient(
        redis_client,
        base_url=node.private_url if node else None,
        gateway_id=gateway_id,
    )
    outcome = client.close_and_confirm(connection_id)
    logger.warning(
        "Sweep killed orphan session on %s (gateway %s): %s",
        label, gateway_id, outcome.get("outcome"),
    )
    record_audit(
        db,
        action="rdp.orphan_killed",
        target_type="rdp_access",
        target_id=resource.id if resource else None,
        new_value={
            "rdp_nickname": label,
            "gateway_id": gateway_id,
            "connection_id": connection_id,
            "outcome": str(outcome.get("outcome")),
            "at": utc_now().isoformat(),
        },
    )
    db.commit()
