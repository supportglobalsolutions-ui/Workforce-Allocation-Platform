"""Background job: refresh Firestore leaderboard mirror from PostgreSQL."""
from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from core.config import settings
from core.database import engine
from services.firebase_mirror import sync_leaderboard_from_pg

logger = logging.getLogger(__name__)

LEADERBOARD_SYNC_INTERVAL_SECONDS = 300  # 5 minutes per data-models.md


async def run_leaderboard_sync_loop() -> None:
    """Periodically mirror quality_composite_scores to /leaderboard/current_period."""
    interval = LEADERBOARD_SYNC_INTERVAL_SECONDS
    logger.info("Leaderboard Firestore sync started (every %ss)", interval)

    while True:
        try:
            with Session(engine) as db:
                sync_leaderboard_from_pg(db)
        except Exception as exc:
            logger.warning("Leaderboard sync iteration failed: %s", exc)
        await asyncio.sleep(interval)
