"""Remove an RDP machine and unlink dependents (history kept where possible)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

import redis as redis_lib
from sqlalchemy import delete, update as sa_update
from sqlmodel import Session, select

from models.allocation import Allocation
from models.enums import AllocationLifecycleEnum, ReleaseReasonEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.shift import Shift
from services.guacamole_provision import remove_connection

logger = logging.getLogger(__name__)


def purge_rdp_resource(
    db: Session,
    redis_client: redis_lib.Redis,
    rdp_id: UUID,
) -> dict:
    resource = db.get(RDPResource, rdp_id)
    if not resource:
        return {"deleted": False, "missing": True}

    snapshot = {
        "id": str(resource.id),
        "nickname": resource.nickname,
        "guacamole_connection_id": resource.guacamole_connection_id,
        "monitor_host": resource.monitor_host,
        "monitor_port": resource.monitor_port,
    }

    now = datetime.now(timezone.utc)
    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).all()
    for alloc in open_allocs:
        alloc.released_at = now
        alloc.release_reason = ReleaseReasonEnum.force_released
        alloc.allocation_status = AllocationLifecycleEnum.ended
        db.add(alloc)
    if open_allocs:
        db.flush()

    db.exec(
        sa_update(WorkSession)
        .where(WorkSession.rdp_resource_id == rdp_id)
        .values(rdp_resource_id=None)
    )
    db.exec(
        sa_update(Shift)
        .where(Shift.rdp_resource_id == rdp_id)
        .values(rdp_resource_id=None)
    )
    db.exec(delete(Allocation).where(Allocation.rdp_resource_id == rdp_id))

    guac_id = resource.guacamole_connection_id
    db.delete(resource)
    db.flush()

    if guac_id:
        try:
            remove_connection(redis_client, str(guac_id))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Guacamole connection cleanup after RDP delete failed: %s", exc)

    return {"deleted": True, "missing": False, "machine": snapshot}
