"""Background job: reconcile the Firestore mirror against PostgreSQL.

Per-request mirror writes are best-effort, so transient Firestore failures can
leave the mirror stale. This loop periodically re-asserts canonical PostgreSQL
state onto Firestore and prunes orphaned docs, making the mirror eventually
consistent. See docs/storage-decision-guide.md.
"""
from __future__ import annotations

import asyncio
import logging

from sqlmodel import Session

from core.config import settings
from core.database import engine
from services.firebase_mirror import reconcile_active_sessions, reconcile_rdp_statuses

logger = logging.getLogger(__name__)


async def run_mirror_reconcile_loop() -> None:
    """Periodically reconcile /rdp_status and /active_sessions from PostgreSQL."""
    interval = settings.MIRROR_RECONCILE_INTERVAL_SECONDS
    logger.info("Firestore mirror reconcile started (every %ss)", interval)

    while True:
        try:
            with Session(engine) as db:
                reconcile_rdp_statuses(db)
                reconcile_active_sessions(db)
        except Exception as exc:
            logger.warning("Mirror reconcile iteration failed: %s", exc)
        await asyncio.sleep(interval)
