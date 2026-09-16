"""Single-writer RDP session coordinator (Phase 4).

Runs lifecycle grace expiry, Guacamole connection reconcile, and capacity-slot
repair. Multiple processes may start this loop; Redis leader election ensures
only one tick runs work at a time.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import socket
import time
from datetime import timedelta, timezone

from sqlmodel import Session, select

from core.config import settings
from core.database import engine
from core.redis import get_redis
from models.allocation import Allocation
from models.enums import RdpStatusEnum, ReleaseReasonEnum
from models.rdp_machine import RDPResource
from services.rdp_reconcile import reconcile_rdp_connections
from services.rdp_state import utc_now

logger = logging.getLogger(__name__)

_LEADER_KEY = "rdp:coordinator:leader"
_HEARTBEAT_KEY = "rdp:coordinator:heartbeat"
_LEADER_TTL = max(30, int(settings.RDP_LIFECYCLE_INTERVAL_SECONDS) * 2)


def _instance_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def try_become_leader(redis_client) -> bool:
    """Atomic leader claim. Refresh TTL while still leader."""
    me = _instance_id()
    acquired = redis_client.set(_LEADER_KEY, me, nx=True, ex=_LEADER_TTL)
    if acquired:
        return True
    current = redis_client.get(_LEADER_KEY)
    if current and current.decode() == me:
        redis_client.expire(_LEADER_KEY, _LEADER_TTL)
        return True
    return False


def _heartbeat_ttl() -> int:
    """Long enough to survive a slow tick, short enough to notice a dead one."""
    return max(int(settings.RDP_LIFECYCLE_INTERVAL_SECONDS) * 3, 90)


def record_heartbeat(redis_client, *, status: str, detail: str | None = None) -> None:
    """
    Publish "a coordinator ran a tick just now, and it was me".

    Without this, enabling the standalone unit is unverifiable from the
    application: you can see a process in systemd, but not whether it is
    winning leader election, reaching its datastores, or actually ticking. This
    turns that into one endpoint an operator can check after a deploy.
    """
    try:
        redis_client.setex(
            _HEARTBEAT_KEY,
            _heartbeat_ttl(),
            json.dumps(
                {
                    "instance": _instance_id(),
                    "at": int(time.time()),
                    "status": status,
                    "detail": detail,
                    "interval_seconds": int(settings.RDP_LIFECYCLE_INTERVAL_SECONDS),
                    "in_api": bool(settings.RDP_RUN_COORDINATOR_IN_API),
                }
            ),
        )
    except Exception as exc:
        # Losing the heartbeat must never disturb the tick it describes.
        logger.debug("Could not record coordinator heartbeat: %s", exc)


def coordinator_status(redis_client) -> dict:
    """
    Operator view: is a coordinator alive, who is it, and is it healthy?

    A missing heartbeat is reported rather than guessed at — if Redis is down
    we genuinely cannot know, and saying so is more useful than implying the
    coordinator is dead when it may simply be unable to report.
    """
    try:
        raw = redis_client.get(_HEARTBEAT_KEY)
        leader = redis_client.get(_LEADER_KEY)
    except Exception as exc:
        return {
            "alive": None,
            "reason": f"cannot read Redis ({type(exc).__name__})",
            "leader": None,
        }

    leader_id = leader.decode() if isinstance(leader, bytes) else leader
    if not raw:
        return {
            "alive": False,
            "reason": (
                "no heartbeat within the last "
                f"{_heartbeat_ttl()}s — is workforce-rdp-coordinator running?"
            ),
            "leader": leader_id,
        }

    try:
        beat = json.loads(raw)
    except Exception:
        return {"alive": None, "reason": "unreadable heartbeat", "leader": leader_id}

    age = max(int(time.time()) - int(beat.get("at", 0)), 0)
    interval = int(beat.get("interval_seconds") or settings.RDP_LIFECYCLE_INTERVAL_SECONDS)
    return {
        "alive": True,
        "instance": beat.get("instance"),
        "leader": leader_id,
        "is_leader": leader_id == beat.get("instance"),
        "last_tick_seconds_ago": age,
        "interval_seconds": interval,
        "overdue": age > interval * 2,
        "status": beat.get("status"),
        "detail": beat.get("detail"),
        # True when the API process is also running the loop. Fine on one box
        # (leader election settles it), but production wants the standalone
        # unit and RDP_RUN_COORDINATOR_IN_API=false.
        "running_inside_api": beat.get("in_api"),
    }


def release_leadership(redis_client) -> bool:
    """
    Drop the lease on a clean shutdown so a standby takes over immediately.

    Without this, a deliberate restart leaves nobody expiring grace or
    reconciling until the lease times out — up to `_LEADER_TTL`. Only the
    holder may release it: deleting another instance's lease would hand two
    coordinators the same work.
    """
    me = _instance_id()
    try:
        current = redis_client.get(_LEADER_KEY)
        if current and current.decode() == me:
            redis_client.delete(_LEADER_KEY)
            logger.info("Coordinator %s released leadership", me)
            return True
    except Exception as exc:
        logger.warning("Could not release coordinator leadership: %s", exc)
    return False


def still_releasable(db: Session, resource: RDPResource, release_threshold) -> bool:
    """
    Is this machine *still* an expired-grace candidate, right now?

    Called immediately before a release, against a freshly read row. Two ways a
    machine stops being releasable between the candidate query and the release:

      * it went back to `active` — a reconnect (join ticket, `prepare_connect`,
        or the sweep's Direction C) cancelled the clock;
      * its `status_changed_at` moved forward — the clock restarted.

    Neither bumps `connection_generation`, so the generation check inside
    `disconnect()` cannot see either one. This is the guard that can.
    """
    try:
        db.refresh(resource)
    except Exception:
        # Cannot confirm the current state — do not release (Principle 4).
        return False

    if resource.status != RdpStatusEnum.idle:
        return False

    changed_at = resource.status_changed_at
    if changed_at is None:
        return False
    if changed_at.tzinfo is None:
        changed_at = changed_at.replace(tzinfo=timezone.utc)
    return changed_at <= release_threshold


def repair_capacity_slots(db: Session, redis_client) -> int:
    """Drop capacity reservation keys that no longer match open allocations."""
    # Live count is derived from Postgres; Redis only held short claim locks.
    # Clear a stale global capacity lock if present with no open allocations.
    open_count = len(
        db.exec(select(Allocation).where(Allocation.released_at.is_(None))).all()
    )
    if open_count == 0 and redis_client.exists("lock:rdp:capacity"):
        redis_client.delete("lock:rdp:capacity")
        return 1
    return 0


def run_coordinator_tick() -> dict[str, int | str]:
    """One reconciliation pass. Safe to call from API or standalone process."""
    from services.rdp_engine import disconnect
    from services.rdp_degraded import (
        datastore_health,
        note_health,
        releases_allowed,
    )

    redis_client = get_redis()

    # Phase 8 Action 3: decide degraded state before anything else, and treat
    # a dead Redis as a reason to stand down quietly rather than to raise.
    # Leader election itself needs Redis, so an unreachable Redis means this
    # process cannot know whether it is leader — it must not act.
    try:
        health = datastore_health(redis_client, None)
    except Exception as exc:
        logger.warning("DEGRADED: could not read datastore health: %s", exc)
        return {"skipped": 1, "reason": "health_unknown"}
    if not health.redis_ok:
        logger.warning(
            "DEGRADED: Redis unreachable (%s) — holding all RDP releases; "
            "live tunnels are unaffected",
            health.detail,
        )
        # No heartbeat is possible here: the heartbeat lives in the store that
        # is down. `coordinator_status` reports that honestly rather than
        # claiming the coordinator is dead.
        return {"skipped": 1, "reason": "redis_unreachable", "degraded": 1}

    if not try_become_leader(redis_client):
        return {"skipped": 1, "reason": "not_leader"}

    now = utc_now()
    release_threshold = now - timedelta(seconds=settings.RDP_DISCONNECT_GRACE_SECONDS)
    auto_released = 0
    capacity_repaired = 0
    # Machines that came back between the candidate query and the release.
    skipped_reconnected = 0

    # Phase 7: publish gateway reachability so placement can route around a
    # lost media node. Done here, once per tick under leader election, so a
    # claim never pays for a probe. Markers carry a TTL — if this process
    # dies they expire and placement treats every gateway as usable again
    # rather than refusing all new claims.
    gateways_down = 0
    try:
        from services.rdp_gateway_cluster import refresh_gateway_health

        health = refresh_gateway_health(redis_client)
        gateways_down = sum(1 for healthy in health.values() if not healthy)
        if gateways_down:
            logger.warning(
                "Gateway health: %s of %s node(s) unreachable — %s",
                gateways_down,
                len(health),
                ", ".join(sorted(gid for gid, ok in health.items() if not ok)),
            )
    except Exception as exc:
        logger.warning("Gateway health refresh failed: %s", exc)

    sweep_stats: dict = {}
    escalated = 0
    degraded_reason: str | None = None

    with Session(engine) as db:
        # Postgres is the other store ownership depends on. Re-check it with a
        # real session before anything is allowed to take a machine away.
        health = datastore_health(redis_client, db)
        note_health(redis_client, health)
        may_release, reason = releases_allowed(redis_client, health)
        if not may_release:
            degraded_reason = reason
            logger.warning(
                "DEGRADED: holding all RDP releases — %s. Live tunnels are "
                "unaffected; observation continues.",
                reason,
            )

        # Phase 8 Action 1: reconcile both directions. Runs even while
        # degraded, but in observe-only mode so the blind spots stay visible
        # without anything being taken away.
        try:
            from services.rdp_session_sweep import run_session_sweep

            stats = run_session_sweep(db, redis_client, allow_mutations=may_release)
            sweep_stats = stats.as_dict()
            if stats.interesting:
                logger.info("RDP session sweep: %s", sweep_stats)
        except Exception as exc:
            logger.warning("Session sweep failed: %s", exc)
            db.rollback()

        # Phase 8 Action 2: anything stuck mid-close gets a defined exit.
        if may_release:
            try:
                from services.rdp_quarantine import escalate_stuck_endings

                escalated = escalate_stuck_endings(db, redis_client)
            except Exception as exc:
                logger.warning("Quarantine escalation failed: %s", exc)
                db.rollback()

        if not may_release:
            # Alive and observing, just not permitted to take anything away.
            record_heartbeat(redis_client, status="degraded", detail=degraded_reason)
            return {
                "skipped": 1,
                "reason": degraded_reason or "degraded",
                "degraded": 1,
                "gateways_down": gateways_down,
                "sweep": sweep_stats,
            }

        capacity_repaired = repair_capacity_slots(db, redis_client)

        idle_resources = db.exec(
            select(RDPResource).where(RDPResource.status == RdpStatusEnum.idle)
        ).all()

        for resource in idle_resources:
            changed_at = resource.status_changed_at
            if changed_at and changed_at.tzinfo is None:
                changed_at = changed_at.replace(tzinfo=timezone.utc)
            if not changed_at or changed_at > release_threshold:
                continue

            # Re-read immediately before releasing. `idle_resources` is a
            # snapshot: a worker can reconnect between that query and this
            # iteration, and the join-ticket fast path flips the machine back to
            # `active` without bumping the generation — so the staleness check
            # inside disconnect() would NOT catch it and we would kill a live
            # tunnel. Confirm the machine is still counting down, and still
            # counting down from the same moment, before touching it.
            if not still_releasable(db, resource, release_threshold):
                skipped_reconnected += 1
                logger.info(
                    "Coordinator skipped %s — it came back during this tick",
                    resource.nickname,
                )
                continue

            alloc = db.exec(
                select(Allocation).where(
                    Allocation.rdp_resource_id == resource.id,
                    Allocation.released_at.is_(None),
                )
            ).first()
            # Capture generation so a reconnect that bumped it makes this release a no-op.
            generation = int(alloc.connection_generation) if alloc else None
            allocation_id = alloc.id if alloc else None

            try:
                from routers.rdp import _close_open_sessions_for_rdp, _record_rdp_logout

                outcome = disconnect(
                    db,
                    resource,
                    redis_client,
                    worker_id=None,
                    require_owner=False,
                    release_reason=ReleaseReasonEnum.timed_out,
                    initiated_by="coordinator",
                    allocation_id=allocation_id,
                    connection_generation=generation,
                    close_sessions_fn=_close_open_sessions_for_rdp,
                    record_logout_fn=_record_rdp_logout,
                )
                if outcome.ok and outcome.data.get("released"):
                    auto_released += 1
                    logger.info(
                        "Coordinator released %s after %ss grace (gen=%s)",
                        resource.nickname,
                        settings.RDP_DISCONNECT_GRACE_SECONDS,
                        generation,
                    )
            except Exception as exc:
                logger.warning("Coordinator auto-release failed for %s: %s", resource.id, exc)
                db.rollback()

    reconcile_stats = reconcile_rdp_connections(force=False)
    record_heartbeat(redis_client, status="ok")
    return {
        "auto_released": auto_released,
        "skipped_reconnected": skipped_reconnected,
        "capacity_repaired": capacity_repaired,
        "gateways_down": gateways_down,
        "quarantined": escalated,
        "sweep": sweep_stats,
        "reconcile_repaired": int(reconcile_stats.get("repaired") or 0),
        "reconcile_failed": int(reconcile_stats.get("failed") or 0),
    }


async def run_rdp_coordinator_loop() -> None:
    interval = settings.RDP_LIFECYCLE_INTERVAL_SECONDS
    logger.info("RDP coordinator loop started (every %ss, leader=%s)", interval, _instance_id())
    try:
        await _coordinator_ticks(interval)
    finally:
        # Shutdown and cancellation both land here, so a rolling deploy hands
        # the lease over instead of leaving the cluster leaderless. Called
        # synchronously: awaiting anything here during cancellation would be
        # cancelled too, and a single Redis DELETE is not worth a thread.
        release_leadership(get_redis())


async def _coordinator_ticks(interval: int) -> None:
    while True:
        try:
            stats = await asyncio.to_thread(run_coordinator_tick)
            if (
                stats.get("auto_released")
                or stats.get("reconcile_repaired")
                or stats.get("gateways_down")
                or stats.get("quarantined")
                or stats.get("degraded")
            ):
                logger.info("RDP coordinator tick: %s", stats)
        except Exception:
            logger.exception("RDP coordinator tick failed")
        await asyncio.sleep(interval)


async def _run_until_signalled() -> None:
    """
    Run the loop until SIGTERM/SIGINT, then unwind it properly.

    This exists because `systemctl stop` (and every restart during a deploy)
    sends SIGTERM, and Python's default SIGTERM disposition kills the process
    outright — `finally` blocks do not run. Without a handler,
    `release_leadership()` never executes on the one path where fast handover
    matters most, and the standby waits out the whole lease before taking over.

    Cancelling the task instead lets the loop's `finally` drop the lease, so a
    deploy hands the coordinator over in seconds rather than minutes.
    """
    loop = asyncio.get_running_loop()
    stop = asyncio.Event()

    def request_stop() -> None:
        logger.info("Coordinator received a stop signal — releasing and exiting")
        stop.set()

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, request_stop)
        except (NotImplementedError, AttributeError):
            # Windows has no add_signal_handler; fall back to the C-level hook
            # and hop back onto the loop thread to touch the Event.
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(request_stop))

    task = asyncio.create_task(run_rdp_coordinator_loop())
    stopper = asyncio.create_task(stop.wait())
    done, _pending = await asyncio.wait(
        [task, stopper], return_when=asyncio.FIRST_COMPLETED
    )

    if task in done:
        stopper.cancel()
        await asyncio.gather(stopper, return_exceptions=True)
        task.result()  # re-raise whatever killed the loop
        return

    task.cancel()
    # Let the loop's finally run — this is what releases the lease.
    await asyncio.gather(task, stopper, return_exceptions=True)


def main() -> None:
    """Standalone entrypoint: python -m services.rdp_coordinator"""
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(_run_until_signalled())


if __name__ == "__main__":
    main()
