"""
Keep every RDP machine's Guacamole connection present and correct.

Guacamole's database lives in a Docker volume on whichever host is running,
while the machine records live in Supabase and are shared across environments.
Deploying to a new VPS therefore starts with an empty Guacamole: every stored
connection id points at nothing, and workers get a black screen.

This loop closes that gap. On startup and periodically it checks each machine
and rebuilds anything missing or stale from the credentials stored on the row,
so a fresh deployment provisions itself with no admin clicking Sync.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlmodel import Session, select

from core.database import engine
from core.guacamole import GuacamoleClient, raw_connection_id
from core.redis import get_redis
from models.rdp_machine import RDPResource
from services.guacamole_provision import (
    GuacamoleProvisionError,
    has_stored_credentials,
    sync_connection,
)

logger = logging.getLogger(__name__)

RECONCILE_INTERVAL_SECONDS = 15 * 60


def reconcile_rdp_connections(*, force: bool = False) -> dict[str, Any]:
    """
    One pass. Returns counts plus any machines needing human attention.

    `force` re-syncs even machines that already look healthy, which is what the
    admin "repair all" action wants.
    """
    checked = repaired = failed = 0
    needs_credentials: list[str] = []
    errors: list[str] = []

    redis_client = get_redis()
    try:
        live = {str(k) for k in GuacamoleClient(redis_client).list_connections()}
    except Exception as exc:
        logger.warning("RDP reconcile skipped — Guacamole unreachable: %s", exc)
        return {
            "checked": 0, "repaired": 0, "failed": 0,
            "needs_credentials": [], "error": f"{type(exc).__name__}: {exc}",
        }

    with Session(engine) as db:
        for resource in db.exec(select(RDPResource)).all():
            if not (resource.monitor_host or "").strip():
                continue
            checked += 1

            stored = raw_connection_id(resource.guacamole_connection_id)
            healthy = bool(stored) and stored in live
            if healthy and not force:
                continue

            # Rebuilding without credentials produces a connection that stops
            # at the Windows login screen — flag it rather than pretend it worked.
            if not has_stored_credentials(resource) and not healthy:
                needs_credentials.append(resource.nickname)

            try:
                result = sync_connection(redis_client, resource)
            except GuacamoleProvisionError as exc:
                failed += 1
                errors.append(f"{resource.nickname}: {exc}")
                continue

            if resource.guacamole_connection_id != result.connection_id:
                resource.guacamole_connection_id = result.connection_id
                db.add(resource)
                db.commit()
            if not healthy:
                repaired += 1
                logger.info(
                    "Rebuilt Guacamole connection for %s -> %s",
                    resource.nickname, result.connection_id,
                )

    return {
        "checked": checked,
        "repaired": repaired,
        "failed": failed,
        "needs_credentials": needs_credentials,
        "error": "; ".join(errors) or None,
    }


async def run_rdp_reconcile_loop(interval_seconds: int = RECONCILE_INTERVAL_SECONDS) -> None:
    logger.info("RDP connection reconcile started (every %ss)", interval_seconds)
    while True:
        try:
            stats = await asyncio.to_thread(reconcile_rdp_connections)
            if stats.get("repaired") or stats.get("failed"):
                logger.info("RDP reconcile: %s", stats)
            if stats.get("needs_credentials"):
                logger.warning(
                    "These machines have no stored RDP credentials and cannot be "
                    "rebuilt automatically: %s",
                    ", ".join(stats["needs_credentials"]),
                )
        except Exception:
            logger.exception("RDP reconcile failed")
        await asyncio.sleep(interval_seconds)
