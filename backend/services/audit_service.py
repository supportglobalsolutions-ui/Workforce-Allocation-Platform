"""Append-only audit trail.

Write only material admin mutations (payroll, people, machines, settings,
deletes). Do not log page views, heartbeats, image inspect, or list GETs —
those would fill the database.

Rows are small (~1–2 KB with a JSON cap). A few hundred admin actions a day
is a few hundred MB per year, not a growth problem. The table cannot be
updated or deleted from the app; PostgreSQL also blocks UPDATE/DELETE.
"""
from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlmodel import Session

from models.audit_log import AuditLog

MAX_JSON_BYTES = 8_192


def _clip(value: Any) -> Any:
    if value is None:
        return None
    try:
        raw = json.dumps(value, default=str)
    except TypeError:
        raw = json.dumps(str(value), default=str)
    if len(raw.encode("utf-8")) <= MAX_JSON_BYTES:
        return value
    return {
        "_truncated": True,
        "bytes": len(raw.encode("utf-8")),
        "preview": raw[:500],
    }


def record_audit(
    db: Session,
    *,
    action: str,
    target_type: str,
    target_id: UUID,
    actor_id: UUID | None = None,
    previous_value: Any = None,
    new_value: Any = None,
    reason_note: str | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    """Queue an immutable audit row. Caller must commit."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action[:64],
        target_type=target_type[:64],
        target_id=target_id,
        previous_value=_clip(previous_value),
        new_value=_clip(new_value),
        reason_note=(reason_note[:2000] if reason_note else None),
        ip_address=ip_address,
    )
    db.add(entry)
    return entry
