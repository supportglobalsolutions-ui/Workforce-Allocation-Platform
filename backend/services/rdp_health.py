"""Apply Uptime Kuma monitor events to rdp_resources."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlmodel import Session, select

from models.enums import RdpStatusEnum
from models.rdp_machine import RDPResource
from services.firebase_mirror import mirror_rdp_status, push_system_alert
from services.rdp_state import PROTECTED_FROM_HEALTH, transition_rdp_status, utc_now

logger = logging.getLogger(__name__)

# Uptime Kuma heartbeat.status values
KUMA_UP = 1
KUMA_DOWN = 0
KUMA_PENDING = 2
KUMA_MAINTENANCE = 3

PROTECTED_STATUSES = PROTECTED_FROM_HEALTH

ACTIVE_ASSIGNMENT_STATUSES = frozenset({
    RdpStatusEnum.assigned,
    RdpStatusEnum.active,
    RdpStatusEnum.idle,
})


def _utc_now() -> datetime:
    return utc_now()


def _extract_monitor_name(payload: dict[str, Any]) -> str | None:
    for key in ("monitor", "heartbeat"):
        block = payload.get(key)
        if isinstance(block, dict):
            name = block.get("name") or block.get("monitor_name")
            if name:
                return str(name).strip()
    return (payload.get("monitor_name") or payload.get("name") or "").strip() or None


def _extract_status(payload: dict[str, Any]) -> int | None:
    heartbeat = payload.get("heartbeat")
    if isinstance(heartbeat, dict) and "status" in heartbeat:
        return int(heartbeat["status"])
    monitor = payload.get("monitor")
    if isinstance(monitor, dict) and "status" in monitor:
        return int(monitor["status"])
    if "status" in payload:
        return int(payload["status"])
    return None


def _find_resource(db: Session, monitor_name: str) -> RDPResource | None:
    resource = db.exec(
        select(RDPResource).where(RDPResource.nickname == monitor_name)
    ).first()
    if resource:
        return resource
    return db.exec(
        select(RDPResource).where(RDPResource.monitor_host == monitor_name)
    ).first()


def _status_after_recovery(resource: RDPResource) -> RdpStatusEnum:
    if resource.assigned_worker_id:
        return RdpStatusEnum.assigned
    return RdpStatusEnum.online_free


def apply_uptime_kuma_event(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Process an Uptime Kuma webhook payload and update the matching RDP resource.

    Monitor name must match rdp_resources.nickname (recommended) or monitor_host.
    """
    monitor_name = _extract_monitor_name(payload)
    if not monitor_name:
        return {"ok": False, "error": "missing monitor name in payload"}

    kuma_status = _extract_status(payload)
    if kuma_status is None:
        return {"ok": False, "error": "missing status in payload", "monitor": monitor_name}

    resource = _find_resource(db, monitor_name)
    if not resource:
        logger.warning("Uptime Kuma event for unknown monitor: %s", monitor_name)
        return {"ok": False, "error": "unknown monitor", "monitor": monitor_name}

    now = _utc_now()
    previous_status = resource.status
    resource.last_health_check_at = now
    changed = False
    alert_message: str | None = None

    if resource.status in PROTECTED_STATUSES and kuma_status != KUMA_MAINTENANCE:
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return {
            "ok": True,
            "monitor": monitor_name,
            "rdp_id": str(resource.id),
            "skipped": "protected_status",
            "status": resource.status.value,
        }

    if kuma_status == KUMA_DOWN:
        if resource.status != RdpStatusEnum.offline:
            transition_rdp_status(db, resource, RdpStatusEnum.offline, mirror=False, commit=False)
            changed = True
        alert_message = f"RDP {resource.nickname} is unreachable (TCP check failed)."
    elif kuma_status == KUMA_MAINTENANCE:
        if resource.status != RdpStatusEnum.maintenance:
            transition_rdp_status(db, resource, RdpStatusEnum.maintenance, mirror=False, commit=False)
            changed = True
        alert_message = f"RDP {resource.nickname} entered maintenance mode."
    elif kuma_status == KUMA_UP:
        if resource.status in {RdpStatusEnum.offline, RdpStatusEnum.unhealthy}:
            transition_rdp_status(
                db, resource, _status_after_recovery(resource), mirror=False, commit=False
            )
            changed = True
        elif resource.status == RdpStatusEnum.maintenance:
            transition_rdp_status(
                db, resource, _status_after_recovery(resource), mirror=False, commit=False
            )
            changed = True
    elif kuma_status == KUMA_PENDING:
        pass
    else:
        if resource.status not in ACTIVE_ASSIGNMENT_STATUSES | {RdpStatusEnum.online_free}:
            transition_rdp_status(db, resource, RdpStatusEnum.unhealthy, mirror=False, commit=False)
            changed = True
        alert_message = f"RDP {resource.nickname} health check reported an unknown state."

    db.add(resource)
    db.commit()
    db.refresh(resource)
    mirror_rdp_status(resource)

    if changed and alert_message and kuma_status in {KUMA_DOWN, KUMA_MAINTENANCE}:
        push_system_alert(
            alert_type="rdp_offline" if kuma_status == KUMA_DOWN else "rdp_maintenance",
            severity="critical" if kuma_status == KUMA_DOWN else "warning",
            message=alert_message,
            entity_ref=str(resource.id),
        )

    return {
        "ok": True,
        "monitor": monitor_name,
        "rdp_id": str(resource.id),
        "previous_status": previous_status.value,
        "status": resource.status.value,
        "kuma_status": kuma_status,
        "changed": changed,
    }
