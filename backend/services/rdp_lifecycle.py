"""Background RDP lifecycle — delegates to the Phase 4 coordinator tick."""
from __future__ import annotations

import asyncio
import logging

from core.config import settings
from services.rdp_coordinator import run_coordinator_tick

logger = logging.getLogger(__name__)


def run_rdp_lifecycle_tick() -> dict:
    """Compat wrapper used by tests / admin tools."""
    return run_coordinator_tick()


async def run_rdp_lifecycle_loop() -> None:
    interval = settings.RDP_LIFECYCLE_INTERVAL_SECONDS
    logger.info("RDP lifecycle loop (compat) started (every %ss)", interval)
    while True:
        try:
            stats = await asyncio.to_thread(run_rdp_lifecycle_tick)
            if stats.get("auto_released"):
                logger.info("RDP lifecycle tick: %s", stats)
        except Exception:
            logger.exception("RDP lifecycle tick failed")
        await asyncio.sleep(interval)
