"""
Mirror PostgreSQL state to Firestore after commit.

Firestore holds denormalized, display-only snapshots. See docs/storage-decision-guide.md.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from firebase_admin import firestore
from sqlmodel import Session, select

from core.database import engine
from core.firebase_admin import is_firebase_ready
from core.firestore_collections import (
    ACTIVE_SESSIONS,
    LEADERBOARD,
    LEADERBOARD_CURRENT_PERIOD_DOC,
    RDP_STATUS,
    SHIFT_NOTIFICATIONS,
    SYSTEM_ALERTS,
)
from models.admin_users import AdminUser
from models.enums import ShiftStatusEnum
from models.quality import QualityCompositeScore
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.shift import Shift
from models.worker import Worker

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _get_db() -> firestore.Client | None:
    if not is_firebase_ready():
        return None
    try:
        return firestore.client()
    except Exception as exc:
        logger.warning("Firestore client unavailable: %s", exc)
        return None


def _worker_firebase_uid(db: Session, worker_id: uuid.UUID) -> str | None:
    worker = db.get(Worker, worker_id)
    if not worker or not worker.admin_user_id:
        return None
    admin = db.get(AdminUser, worker.admin_user_id)
    return admin.firebase_uid if admin else None


def _safe_write(label: str, fn) -> None:
    try:
        fn()
    except Exception as exc:
        logger.warning("Firebase mirror %s failed (PG commit already succeeded): %s", label, exc)


# ── RDP status ───────────────────────────────────────────────────────────────


def mirror_rdp_status(resource: RDPResource) -> None:
    """Upsert /rdp_status/{rdp_id}."""

    def _write():
        client = _get_db()
        if not client:
            return
        doc_id = str(resource.id)
        payload: dict[str, Any] = {
            "status": resource.status.value if hasattr(resource.status, "value") else str(resource.status),
            "worker_id": str(resource.assigned_worker_id) if resource.assigned_worker_id else None,
            "updated_at": _iso(resource.status_changed_at or _utc_now()),
        }
        client.collection(RDP_STATUS).document(doc_id).set(payload, merge=True)

    _safe_write(f"rdp_status/{resource.id}", _write)


def delete_rdp_status(rdp_id: uuid.UUID) -> None:
    def _write():
        client = _get_db()
        if not client:
            return
        client.collection(RDP_STATUS).document(str(rdp_id)).delete()

    _safe_write(f"rdp_status/{rdp_id} delete", _write)


# ── Active sessions ───────────────────────────────────────────────────────────


def mirror_active_session(db: Session, session: WorkSession) -> None:
    """Upsert /active_sessions/{session_id} while session is open."""

    def _write():
        client = _get_db()
        if not client:
            return
        fields = dict(session.type_specific_fields or {})
        heartbeat_raw = fields.get("last_heartbeat_at")
        heartbeat_at = heartbeat_raw if isinstance(heartbeat_raw, str) else _iso(session.start_time)
        firebase_uid = _worker_firebase_uid(db, session.worker_id)
        payload: dict[str, Any] = {
            "worker_id": str(session.worker_id),
            "firebase_uid": firebase_uid,
            "rdp_id": str(session.rdp_resource_id) if session.rdp_resource_id else None,
            "started_at": _iso(session.start_time),
            "heartbeat_at": heartbeat_at,
            "start_image_url": session.start_image_url,
            "end_image_url": session.end_image_url,
        }
        client.collection(ACTIVE_SESSIONS).document(str(session.id)).set(payload, merge=True)

    _safe_write(f"active_sessions/{session.id}", _write)


def delete_active_session(session_id: uuid.UUID) -> None:
    def _write():
        client = _get_db()
        if not client:
            return
        client.collection(ACTIVE_SESSIONS).document(str(session_id)).delete()

    _safe_write(f"active_sessions/{session_id} delete", _write)


# ── Shift notifications ───────────────────────────────────────────────────────


def _push_shift_notification(
    db: Session,
    *,
    worker_id: uuid.UUID,
    notif_type: str,
    title: str,
    body: str,
) -> None:
    firebase_uid = _worker_firebase_uid(db, worker_id)
    notif_id = str(uuid.uuid4())
    worker_key = str(worker_id)

    def _write():
        client = _get_db()
        if not client:
            return
        payload: dict[str, Any] = {
            "worker_id": worker_key,
            "type": notif_type,
            "title": title,
            "body": body,
            "read": False,
            "created_at": _iso(_utc_now()),
            "firebase_uid": firebase_uid,
        }
        # Logical path: shift_notifications/{worker_id}/{notif_id}
        client.collection(SHIFT_NOTIFICATIONS).document(worker_key).collection("notifications").document(
            notif_id
        ).set(payload)

    _safe_write(f"shift_notifications/{worker_key}/{notif_id}", _write)


def mirror_shift_status_change(db: Session, shift: Shift, previous_status: ShiftStatusEnum | None) -> None:
    """Notify worker when shift is approved, rejected, or RDP is assigned."""
    if shift.status == previous_status:
        return

    if shift.status == ShiftStatusEnum.approved:
        rdp_note = ""
        resource: RDPResource | None = None
        if shift.rdp_resource_id:
            resource = db.get(RDPResource, shift.rdp_resource_id)
            if resource:
                rdp_note = f" RDP assigned: {resource.nickname}."
        _push_shift_notification(
            db,
            worker_id=shift.worker_id,
            notif_type="shift_approved",
            title="Shift approved",
            body=f"Your shift was approved.{rdp_note}",
        )
        if resource:
            mirror_rdp_status(resource)
    elif shift.status == ShiftStatusEnum.rejected:
        reason = shift.rejection_reason or "No reason provided."
        _push_shift_notification(
            db,
            worker_id=shift.worker_id,
            notif_type="shift_rejected",
            title="Shift rejected",
            body=f"Your shift was rejected. {reason}",
        )


# ── System alerts ─────────────────────────────────────────────────────────────


def push_system_alert(
    *,
    alert_type: str,
    severity: str,
    message: str,
    entity_ref: str | None = None,
) -> None:
    alert_id = str(uuid.uuid4())

    def _write():
        client = _get_db()
        if not client:
            return
        payload: dict[str, Any] = {
            "type": alert_type,
            "severity": severity,
            "message": message,
            "entity_ref": entity_ref,
            "created_at": _iso(_utc_now()),
        }
        client.collection(SYSTEM_ALERTS).document(alert_id).set(payload)

    _safe_write(f"system_alerts/{alert_id}", _write)


# ── Leaderboard ───────────────────────────────────────────────────────────────


def sync_leaderboard_from_pg(db: Session, *, limit: int = 50) -> None:
    """Refresh /leaderboard/current_period from quality_composite_scores."""

    def _write():
        client = _get_db()
        if not client:
            return
        stmt = (
            select(QualityCompositeScore, Worker)
            .join(Worker, Worker.id == QualityCompositeScore.worker_id)
            .order_by(
                QualityCompositeScore.global_rank.asc().nullslast(),
                QualityCompositeScore.composite_score.desc(),
            )
            .limit(limit)
        )
        rows = db.exec(stmt).all()
        workers_payload = [
            {
                "id": str(score.worker_id),
                "display_name": worker.display_name,
                "country": worker.country,
                "score": float(score.composite_score),
                "country_rank": score.country_rank,
                "global_rank": score.global_rank,
                "streak": score.session_streak_days,
            }
            for score, worker in rows
        ]
        payload: dict[str, Any] = {
            "workers": workers_payload,
            "refreshed_at": _iso(_utc_now()),
        }
        client.collection(LEADERBOARD).document(LEADERBOARD_CURRENT_PERIOD_DOC).set(payload)

    _safe_write("leaderboard/current_period", _write)


# ── Reconciliation (self-healing) ─────────────────────────────────────────────
#
# Individual mirror_* writes are best-effort: if Firestore is briefly unavailable
# the PG commit still succeeds and the failure is only logged. Over time that lets
# Firestore drift from PostgreSQL. These reconcile passes re-assert the canonical
# PG state onto Firestore and prune orphaned docs, so the mirror is eventually
# consistent even after transient failures.


def reconcile_rdp_statuses(db: Session) -> None:
    """Re-assert /rdp_status/* from PostgreSQL and delete orphaned docs."""

    def _write():
        client = _get_db()
        if not client:
            return
        resources = db.exec(select(RDPResource)).all()
        valid_ids = {str(r.id) for r in resources}
        for resource in resources:
            payload: dict[str, Any] = {
                "status": resource.status.value if hasattr(resource.status, "value") else str(resource.status),
                "worker_id": str(resource.assigned_worker_id) if resource.assigned_worker_id else None,
                "updated_at": _iso(resource.status_changed_at or _utc_now()),
            }
            client.collection(RDP_STATUS).document(str(resource.id)).set(payload, merge=True)

        for doc in client.collection(RDP_STATUS).stream():
            if doc.id not in valid_ids:
                doc.reference.delete()

    _safe_write("reconcile rdp_status", _write)


def reconcile_active_sessions(db: Session) -> None:
    """Re-assert /active_sessions/* from open PG sessions and prune closed ones."""

    def _write():
        client = _get_db()
        if not client:
            return
        open_sessions = db.exec(
            select(WorkSession).where(WorkSession.end_time.is_(None))
        ).all()
        valid_ids = {str(s.id) for s in open_sessions}
        for session in open_sessions:
            fields = dict(session.type_specific_fields or {})
            heartbeat_raw = fields.get("last_heartbeat_at")
            heartbeat_at = heartbeat_raw if isinstance(heartbeat_raw, str) else _iso(session.start_time)
            payload: dict[str, Any] = {
                "worker_id": str(session.worker_id),
                "firebase_uid": _worker_firebase_uid(db, session.worker_id),
                "rdp_id": str(session.rdp_resource_id) if session.rdp_resource_id else None,
                "started_at": _iso(session.start_time),
                "heartbeat_at": heartbeat_at,
                "start_image_url": session.start_image_url,
                "end_image_url": session.end_image_url,
            }
            client.collection(ACTIVE_SESSIONS).document(str(session.id)).set(payload, merge=True)

        for doc in client.collection(ACTIVE_SESSIONS).stream():
            if doc.id not in valid_ids:
                doc.reference.delete()

    _safe_write("reconcile active_sessions", _write)


# ── Background-task wrappers ───────────────────────────────────────────────────
#
# FastAPI BackgroundTasks run AFTER the response is sent, once the request's DB
# session is already closed. These helpers open their own short-lived session and
# re-fetch by id, so routers can schedule mirroring off the request path without
# touching a closed session or a detached ORM instance.


def mirror_rdp_status_by_id(rdp_id: uuid.UUID) -> None:
    with Session(engine) as db:
        resource = db.get(RDPResource, rdp_id)
        if resource:
            mirror_rdp_status(resource)
        else:
            delete_rdp_status(rdp_id)


def mirror_active_session_by_id(session_id: uuid.UUID) -> None:
    with Session(engine) as db:
        session = db.get(WorkSession, session_id)
        if session and session.end_time is None:
            mirror_active_session(db, session)
        else:
            delete_active_session(session_id)


def mirror_shift_status_change_by_id(
    shift_id: uuid.UUID, previous_status: ShiftStatusEnum | None
) -> None:
    with Session(engine) as db:
        shift = db.get(Shift, shift_id)
        if shift:
            mirror_shift_status_change(db, shift, previous_status)
