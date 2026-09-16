"""
Degraded-mode policy for datastore outages (Phase 8 Action 3).

Principle 4 says "do not invent frees during Redis/Postgres outages". Until
now that held only by accident: losing Redis made the coordinator's leader
claim raise, which aborted the whole tick with a traceback. Fail-safe by luck
is not a design — it also silently stopped the sweep and the gateway probes,
and gave no signal that anything had stopped.

The policy
----------
Ownership lives in Postgres; locks, tickets and the leader lease live in
Redis. When either is unreachable we cannot *prove* anything about who owns
what, so every action that would **take a machine away from someone** is
frozen. Nothing that merely observes is frozen.

    Frozen while degraded     grace expiry, sweep Direction A, orphan kills,
                              quarantine escalation, capacity repair
    Still allowed             gateway health probes, reads, logging
    Unaffected entirely       live tunnels — pixels do not pass through the
                              control plane once Phase 5 is on

Recovery
--------
A 30-minute outage leaves every `idle` machine far past its 5-minute grace, so
the first healthy tick would release the entire fleet in one batch — every one
of those workers is still sitting at a desktop. After health returns we
therefore suppress releases for `RDP_DEGRADED_RECOVERY_SECONDS`, giving
reconnects a fair window before any clock is allowed to fire again.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import redis as redis_lib
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from core.config import settings

logger = logging.getLogger(__name__)

# Set when a tick observes a healthy datastore after an unhealthy one. Kept in
# Redis rather than memory so every coordinator instance honours the same
# window — a failover mid-outage must not reset the clock.
_RECOVERY_KEY = "rdp:degraded:recovered_at"
# Marks that the last observation was degraded, so the next healthy tick can
# tell "recovering" from "was fine all along".
_DEGRADED_KEY = "rdp:degraded:since"


def is_datastore_error(exc: BaseException) -> bool:
    """True for a Redis or SQLAlchemy failure that should be retried by a worker.

    Do not catch arbitrary exceptions here. A bad RDP credential, Guacamole
    timeout, or programming error needs its own outcome instead of being
    disguised as a Redis/Postgres outage.
    """
    return isinstance(exc, (redis_lib.RedisError, SQLAlchemyError))


@dataclass(frozen=True)
class DatastoreHealth:
    redis_ok: bool
    postgres_ok: bool
    detail: str | None = None

    @property
    def ok(self) -> bool:
        return self.redis_ok and self.postgres_ok

    def as_dict(self) -> dict:
        return {
            "redis": "ok" if self.redis_ok else "unreachable",
            "postgres": "ok" if self.postgres_ok else "unreachable",
            "degraded": not self.ok,
            "detail": self.detail,
        }


def datastore_health(
    redis_client: redis_lib.Redis | None, db: Session | None
) -> DatastoreHealth:
    """Cheap liveness check of the two stores ownership depends on."""
    problems: list[str] = []

    redis_ok = False
    if redis_client is not None:
        try:
            redis_client.ping()
            redis_ok = True
        except Exception as exc:
            problems.append(f"redis: {type(exc).__name__}")
    else:
        problems.append("redis: no client")

    postgres_ok = False
    if db is not None:
        try:
            db.exec(text("SELECT 1"))
            postgres_ok = True
        except Exception as exc:
            problems.append(f"postgres: {type(exc).__name__}")
    else:
        problems.append("postgres: no session")

    return DatastoreHealth(
        redis_ok=redis_ok,
        postgres_ok=postgres_ok,
        detail="; ".join(problems) or None,
    )


def note_health(redis_client: redis_lib.Redis | None, health: DatastoreHealth) -> None:
    """
    Record the transition so recovery can be detected on a later tick.

    Only called by the coordinator. If Redis itself is the thing that is down
    we obviously cannot write the marker — that is fine, because the marker is
    only needed on the way back up, when Redis is reachable again.
    """
    if redis_client is None:
        return
    try:
        if not health.ok:
            # Stamp once; keep the original start time across repeated ticks.
            redis_client.set(_DEGRADED_KEY, str(int(time.time())), nx=True)
            return
        was_degraded = redis_client.get(_DEGRADED_KEY)
        if was_degraded:
            redis_client.delete(_DEGRADED_KEY)
            redis_client.setex(
                _RECOVERY_KEY,
                max(int(settings.RDP_DEGRADED_RECOVERY_SECONDS), 1),
                str(int(time.time())),
            )
            logger.warning(
                "Datastores recovered — suppressing RDP releases for %ss so "
                "workers can reconnect before any grace clock fires",
                settings.RDP_DEGRADED_RECOVERY_SECONDS,
            )
    except Exception as exc:
        logger.warning("Could not record degraded-mode transition: %s", exc)


def in_recovery_window(redis_client: redis_lib.Redis | None) -> bool:
    """True while releases stay suppressed after an outage."""
    if redis_client is None:
        return False
    try:
        return bool(redis_client.exists(_RECOVERY_KEY))
    except Exception:
        # Cannot tell — and this function gates *releases*, so the safe answer
        # is "yes, still recovering": hold the machine rather than free it.
        return True


def releases_allowed(
    redis_client: redis_lib.Redis | None, health: DatastoreHealth
) -> tuple[bool, str]:
    """
    May this tick take a machine away from someone? Returns (allowed, reason).

    Every caller that releases, quarantines or kills must consult this first.
    """
    if not health.ok:
        return False, f"datastore degraded ({health.detail or 'unknown'})"
    if in_recovery_window(redis_client):
        return False, "within post-outage recovery window"
    return True, "ok"


def degraded_status(
    redis_client: redis_lib.Redis | None, db: Session | None
) -> dict:
    """Operator-facing snapshot for `GET /rdp/health/degraded`."""
    health = datastore_health(redis_client, db)
    allowed, reason = releases_allowed(redis_client, health)
    return {
        **health.as_dict(),
        "releases_allowed": allowed,
        "releases_blocked_because": None if allowed else reason,
        "recovery_window_seconds": settings.RDP_DEGRADED_RECOVERY_SECONDS,
    }
