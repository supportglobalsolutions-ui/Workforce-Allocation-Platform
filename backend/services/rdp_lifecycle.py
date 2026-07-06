"""Background RDP lifecycle: heartbeat idle detection and auto-release."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from core.config import settings
from core.database import engine
from core.redis import get_redis
from models.enums import RdpStatusEnum, ReleaseReasonEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from services.firebase_mirror import delete_active_session, mirror_rdp_status
from services.rdp_state import transition_rdp_status, utc_now

logger = logging.getLogger(__name__)


def _parse_heartbeat(fields: dict) -> datetime | None:
    raw = fields.get("last_heartbeat_at")
    if not raw:
        return None
    try:
        if isinstance(raw, str):
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return None


def run_rdp_lifecycle_tick() -> dict[str, int]:
    """
    One pass: active→idle (no heartbeat), idle→online_free (auto-release).
    Returns counts for logging.
    """
    from routers.rdp import _end_rdp_connection

    now = utc_now()
    idle_threshold = now - timedelta(seconds=settings.RDP_HEARTBEAT_IDLE_SECONDS)
    release_threshold = now - timedelta(seconds=settings.RDP_IDLE_AUTO_RELEASE_SECONDS)

    marked_idle = 0
    auto_released = 0

    with Session(engine) as db:
        redis_client = get_redis()

        active_resources = db.exec(
            select(RDPResource).where(RDPResource.status == RdpStatusEnum.active)
        ).all()

        for resource in active_resources:
            open_session = db.exec(
                select(WorkSession).where(
                    WorkSession.rdp_resource_id == resource.id,
                    WorkSession.end_time.is_(None),
                )
            ).first()
            if not open_session:
                continue

            fields = dict(open_session.type_specific_fields or {})
            last_hb = _parse_heartbeat(fields) or open_session.start_time
            if last_hb and last_hb.tzinfo is None:
                last_hb = last_hb.replace(tzinfo=timezone.utc)

            if last_hb and last_hb < idle_threshold:
                transition_rdp_status(db, resource, RdpStatusEnum.idle)
                marked_idle += 1
                logger.info("RDP %s marked idle (no heartbeat)", resource.nickname)

        idle_resources = db.exec(
            select(RDPResource).where(RDPResource.status == RdpStatusEnum.idle)
        ).all()

        for resource in idle_resources:
            changed_at = resource.status_changed_at
            if changed_at and changed_at.tzinfo is None:
                changed_at = changed_at.replace(tzinfo=timezone.utc)
            if not changed_at or changed_at > release_threshold:
                continue

            try:
                result = _end_rdp_connection(
                    db,
                    resource,
                    redis_client,
                    worker_id=None,
                    require_owner=False,
                    release_reason=ReleaseReasonEnum.timed_out,
                )
                mirror_rdp_status(resource)
                for sid in result.get("closed_session_ids", []):
                    from uuid import UUID
                    delete_active_session(UUID(str(sid)))
                auto_released += 1
                logger.info("RDP %s auto-released after idle timeout", resource.nickname)
            except Exception as exc:
                logger.warning("Auto-release failed for RDP %s: %s", resource.id, exc)
                db.rollback()

    return {"marked_idle": marked_idle, "auto_released": auto_released}


async def run_rdp_lifecycle_loop() -> None:
    interval = settings.RDP_LIFECYCLE_INTERVAL_SECONDS
    logger.info("RDP lifecycle loop started (every %ss)", interval)
    while True:
        try:
            stats = await asyncio.to_thread(run_rdp_lifecycle_tick)
            if stats["marked_idle"] or stats["auto_released"]:
                logger.info("RDP lifecycle tick: %s", stats)
        except Exception:
            logger.exception("RDP lifecycle tick failed")
        await asyncio.sleep(interval)
