"""Session evidence helpers: on-image times → duration, completeness, reminders."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models.enums import PayrollSessionEnum
from models.notification import Notification
from models.session import Session as WorkSession


#: Most screenshots a worker may attach to one session.
MAX_SESSION_IMAGES = 8


def session_image_paths(session: WorkSession) -> list[str]:
    """The session's screenshots, newest schema first, legacy pair as fallback.

    Rows written before the gallery replaced the fixed start/end pair were
    backfilled by migration f3a4b5c6d7e8, but a row can still carry only the
    old columns if it was written while that deploy was in flight.
    """
    paths = [p for p in (session.image_urls or []) if p]
    if paths:
        return paths
    return [p for p in (session.start_image_url, session.end_image_url) if p]


def evidence_complete(session: WorkSession) -> bool:
    """At least one screenshot plus both on-image times.

    The two-screenshot rule went away with the single capture button; the
    times are still what payroll pays on, so they stay required.
    """
    return bool(
        session_image_paths(session)
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


def effective_duration_minutes(session: WorkSession) -> int:
    """
    Minutes payroll should use: only the start/end times entered from the
    screenshots. RDP connected time is never paid.
    """
    apply_image_duration(session)
    if session.image_start_at and session.image_end_at:
        return int(session.duration_minutes or 0)
    return 0


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
                f"Session {session.id} ({when}) needs at least one screenshot and the "
                f"start & end times shown on it. Open Session History to complete it."
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
    period_id: Optional[UUID] = None,
) -> tuple[Decimal, bool, int]:
    """
    Sum session hours for a worker in a date window.

    Skips flagged/excluded sessions and sessions already billed to another period.
    Returns (hours, any_incomplete_closed_session, session_count).
    """
    stmt = select(WorkSession).where(
        WorkSession.worker_id == worker_id,
        WorkSession.end_time.is_not(None),
        WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
        WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
    )
    if start is not None:
        stmt = stmt.where(WorkSession.start_time >= start)
    if end is not None:
        stmt = stmt.where(WorkSession.start_time <= end)
    sessions = db.exec(stmt).all()
    total_minutes = 0
    incomplete = False
    count = 0
    for s in sessions:
        if period_id and s.payroll_period_id is not None and s.payroll_period_id != period_id:
            continue
        if not evidence_complete(s):
            incomplete = True
        total_minutes += effective_duration_minutes(s)
        count += 1
    hours = (Decimal(total_minutes) / Decimal(60)).quantize(Decimal("0.01"))
    return hours, incomplete, count
