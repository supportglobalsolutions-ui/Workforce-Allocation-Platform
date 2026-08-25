"""
Per-admin security risk scoring.

Destructive actions add points. A sliding 24h window is summed; when the score
crosses RISK_THRESHOLD, the Settings alert inbox is emailed (debounced 1h).
Bulk deletes of more than 5 items also send an informational alert email.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from sqlmodel import Session, select

from models.security_risk import SecurityRiskEvent
from services.admin_otp import get_platform_settings
from services.audit_service import record_audit
from services.email_resend import send_email

logger = logging.getLogger(__name__)

WINDOW = timedelta(hours=24)
NOTIFY_DEBOUNCE = timedelta(hours=1)
RISK_THRESHOLD = 50

POINTS = {
    "worker_deleted": 10,
    "session_deleted": 2,
    "payroll_period_deleted": 30,
    "bulk_over_5": 15,
}

EVENT_THRESHOLD_EMAIL = "risk_threshold_email"
BULK_OTP_THRESHOLD = 10
BULK_ALERT_THRESHOLD = 5
BULK_HARD_MAX = 200


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def score_last_24h(db: Session, admin_user_id: UUID) -> int:
    since = _utcnow() - WINDOW
    rows = db.exec(
        select(SecurityRiskEvent).where(
            SecurityRiskEvent.admin_user_id == admin_user_id,
            SecurityRiskEvent.created_at >= since,
            SecurityRiskEvent.event_type != EVENT_THRESHOLD_EMAIL,
        )
    ).all()
    return sum(int(r.points or 0) for r in rows)


def record_event(
    db: Session,
    *,
    admin_user_id: UUID,
    event_type: str,
    points: Optional[int] = None,
    payload: Optional[dict[str, Any]] = None,
    commit: bool = False,
) -> SecurityRiskEvent:
    pts = POINTS.get(event_type, 0) if points is None else points
    row = SecurityRiskEvent(
        admin_user_id=admin_user_id,
        event_type=event_type,
        points=pts,
        payload=payload,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def _last_threshold_email_at(db: Session, admin_user_id: UUID) -> Optional[datetime]:
    row = db.exec(
        select(SecurityRiskEvent)
        .where(
            SecurityRiskEvent.admin_user_id == admin_user_id,
            SecurityRiskEvent.event_type == EVENT_THRESHOLD_EMAIL,
        )
        .order_by(SecurityRiskEvent.created_at.desc())
    ).first()
    return row.created_at if row else None


def maybe_notify_threshold(
    db: Session,
    *,
    admin_user_id: UUID,
    admin_email: Optional[str] = None,
) -> bool:
    """Email alert inbox if 24h score is at/above threshold (1h debounce)."""
    score = score_last_24h(db, admin_user_id)
    if score < RISK_THRESHOLD:
        return False

    last = _last_threshold_email_at(db, admin_user_id)
    if last is not None:
        aware = last if last.tzinfo else last.replace(tzinfo=timezone.utc)
        if _utcnow() - aware < NOTIFY_DEBOUNCE:
            return False

    settings_row = get_platform_settings(db)
    to_email = settings_row.alert_email
    subject = f"Security risk score high ({score})"
    body = (
        f"An administrator's security risk score reached {score} "
        f"(threshold {RISK_THRESHOLD}) in the last 24 hours.\n\n"
        f"Admin id: {admin_user_id}\n"
        f"Admin email: {admin_email or 'unknown'}\n\n"
        "Review recent deletes of workers, sessions, and payroll periods."
    )
    html = (
        f"<p>An administrator's security risk score reached <strong>{score}</strong> "
        f"(threshold {RISK_THRESHOLD}) in the last 24 hours.</p>"
        f"<p>Admin id: <code>{admin_user_id}</code><br/>"
        f"Admin email: {admin_email or 'unknown'}</p>"
        "<p>Review recent deletes of workers, sessions, and payroll periods.</p>"
    )
    log = send_email(
        db,
        to_email=to_email,
        subject=subject,
        html=html,
        text=body,
        template="security_alert",
    )
    record_event(
        db,
        admin_user_id=admin_user_id,
        event_type=EVENT_THRESHOLD_EMAIL,
        points=0,
        payload={"score": score, "email_status": log.status, "sent_to": to_email},
    )
    record_audit(
        db,
        actor_id=admin_user_id,
        action="security.risk_threshold_exceeded",
        target_type="admin_user",
        target_id=admin_user_id,
        new_value={"score": score, "threshold": RISK_THRESHOLD},
        reason_note="Risk score threshold email sent to alert inbox",
    )
    if log.status != "sent":
        logger.warning("Risk threshold email failed: %s", log.error)
    return True


def send_bulk_delete_alert(
    db: Session,
    *,
    admin_user_id: UUID,
    admin_email: Optional[str],
    kind: str,
    count: int,
    sample_ids: list[str],
) -> None:
    """Informational alert when more than 5 workers/sessions are deleted at once."""
    if count <= BULK_ALERT_THRESHOLD:
        return
    settings_row = get_platform_settings(db)
    to_email = settings_row.alert_email
    label = "workers" if kind == "workers" else "sessions"
    subject = f"Bulk delete alert — {count} {label}"
    sample = ", ".join(sample_ids[:8])
    if len(sample_ids) > 8:
        sample += f" … (+{len(sample_ids) - 8} more)"
    text = (
        f"An administrator deleted {count} {label} in one action.\n\n"
        f"Admin id: {admin_user_id}\n"
        f"Admin email: {admin_email or 'unknown'}\n"
        f"Sample ids: {sample}\n"
    )
    html = (
        f"<p>An administrator deleted <strong>{count}</strong> {label} in one action.</p>"
        f"<p>Admin id: <code>{admin_user_id}</code><br/>"
        f"Admin email: {admin_email or 'unknown'}</p>"
        f"<p>Sample ids: <code>{sample}</code></p>"
    )
    log = send_email(
        db,
        to_email=to_email,
        subject=subject,
        html=html,
        text=text,
        template="security_alert",
    )
    record_audit(
        db,
        actor_id=admin_user_id,
        action=f"security.bulk_{kind}_delete_alert",
        target_type=kind,
        target_id=admin_user_id,
        new_value={"count": count, "sample_ids": sample_ids[:20], "email_status": log.status},
        reason_note=f"Bulk delete of {count} {label} exceeded alert threshold",
    )


def after_destructive_bulk(
    db: Session,
    *,
    admin_user_id: UUID,
    admin_email: Optional[str],
    kind: str,
    count: int,
    ids: list[UUID],
) -> None:
    """Record per-item risk, bulk_over_5 bonus, alerts, and threshold check."""
    event_type = "worker_deleted" if kind == "workers" else "session_deleted"
    for item_id in ids:
        record_event(
            db,
            admin_user_id=admin_user_id,
            event_type=event_type,
            payload={"id": str(item_id)},
        )
    if count > BULK_ALERT_THRESHOLD:
        record_event(
            db,
            admin_user_id=admin_user_id,
            event_type="bulk_over_5",
            payload={"kind": kind, "count": count},
        )
        send_bulk_delete_alert(
            db,
            admin_user_id=admin_user_id,
            admin_email=admin_email,
            kind=kind,
            count=count,
            sample_ids=[str(i) for i in ids],
        )
    maybe_notify_threshold(db, admin_user_id=admin_user_id, admin_email=admin_email)
