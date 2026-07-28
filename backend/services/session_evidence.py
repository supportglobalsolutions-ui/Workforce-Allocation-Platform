"""Session evidence helpers: on-image times → duration, completeness, reminders."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models.notification import Notification
from models.session import Session as WorkSession


def evidence_complete(session: WorkSession) -> bool:
    return bool(
        session.start_image_url
        and session.end_image_url
        and session.image_start_at
        and session.image_end_at
    )


def apply_image_duration(session: WorkSession) -> None:
    """Set duration_minutes from image times when both are present."""
    if not session.image_start_at or not session.image_end_at:
        return
    start = session.image_start_at
    end = session.image_end_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    minutes = int((end - start).total_seconds() // 60)
    session.duration_minutes = max(0, minutes)


def notify_evidence_incomplete(db: Session, session: WorkSession) -> None:
    """Create a worker reminder when a closed session is missing evidence."""
    if session.end_time is None or evidence_complete(session):
        return
    # Avoid spamming: one unread evidence reminder per session.
    existing = db.exec(
        select(Notification).where(
            Notification.target_worker_id == session.worker_id,
            Notification.category == "session_evidence",
            Notification.is_read.is_(False),
            Notification.message.ilike(f"%{session.id}%"),
        )
    ).first()
    if existing:
        return
    when = session.start_time.strftime("%Y-%m-%d %H:%M") if session.start_time else "recent"
    db.add(
        Notification(
            sender_admin_id=None,
            title="Add session evidence",
            message=(
                f"Session {session.id} ({when}) needs start & end images and the times "
                f"shown on those images. Open Session History to complete it."
            ),
            category="session_evidence",
            target_type="specific",
            target_worker_id=session.worker_id,
        )
    )


def clear_evidence_reminders(db: Session, session: WorkSession) -> None:
    if not evidence_complete(session):
        return
    rows = db.exec(
        select(Notification).where(
            Notification.target_worker_id == session.worker_id,
            Notification.category == "session_evidence",
            Notification.is_read.is_(False),
            Notification.message.ilike(f"%{session.id}%"),
        )
    ).all()
    now = datetime.now(timezone.utc)
    for n in rows:
        n.is_read = True
        n.read_at = now
        db.add(n)


def evidence_hours_for_worker(
    db: Session,
    worker_id: UUID,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
) -> tuple[Decimal, bool]:
    """
    Sum duration_minutes for closed sessions (prefer evidence-complete durations).
    Returns (hours, any_incomplete_closed_session).
    """
    stmt = select(WorkSession).where(
        WorkSession.worker_id == worker_id,
        WorkSession.end_time.is_not(None),
    )
    if start is not None:
        stmt = stmt.where(WorkSession.start_time >= start)
    if end is not None:
        stmt = stmt.where(WorkSession.start_time <= end)
    sessions = db.exec(stmt).all()
    total_minutes = 0
    incomplete = False
    for s in sessions:
        if not evidence_complete(s):
            incomplete = True
        total_minutes += s.duration_minutes or 0
    hours = (Decimal(total_minutes) / Decimal(60)).quantize(Decimal("0.01"))
    return hours, incomplete
