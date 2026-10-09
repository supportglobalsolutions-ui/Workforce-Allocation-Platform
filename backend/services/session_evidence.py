"""Session evidence helpers: on-image times → duration, completeness, reminders."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, Sequence
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


MAX_WORK_BLOCKS = 10


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _parse(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        return _aware(value)
    if isinstance(value, str) and value:
        try:
            return _aware(datetime.fromisoformat(value.replace("Z", "+00:00")))
        except ValueError:
            return None
    return None


def session_blocks(session: WorkSession) -> list[tuple[datetime, datetime]]:
    """The session's worked blocks; a single start/end pair counts as one block."""
    blocks = []
    for raw in getattr(session, "work_blocks", None) or []:
        start, end = _parse(raw.get("start")), _parse(raw.get("end"))
        if start and end and end > start:
            blocks.append((start, end))
    if not blocks and session.image_start_at and session.image_end_at:
        start, end = _aware(session.image_start_at), _aware(session.image_end_at)
        if end > start:
            blocks.append((start, end))
    return blocks


def work_minutes(session: WorkSession) -> int:
    """Paid work time: the sum of the worked blocks (breaks between them are not paid)."""
    return sum(int((end - start).total_seconds() // 60) for start, end in session_blocks(session))


def set_work_blocks(session: WorkSession, blocks: Sequence[tuple[datetime, datetime]]) -> None:
    """Validate and store worked blocks; keeps image_start_at/image_end_at as first start / last end.

    Raises ValueError with a worker-facing message when the blocks are invalid.
    """
    if not blocks:
        raise ValueError("Add at least one start and end time.")
    if len(blocks) > MAX_WORK_BLOCKS:
        raise ValueError(f"A session can have at most {MAX_WORK_BLOCKS} work blocks.")
    ordered = sorted((_aware(s), _aware(e)) for s, e in blocks)
    for i, (start, end) in enumerate(ordered):
        if end <= start:
            raise ValueError("Each end time must be after its start time.")
        if i and start < ordered[i - 1][1]:
            raise ValueError("Work blocks cannot overlap — each one must start after the previous one ends.")
    session.work_blocks = [{"start": s.isoformat(), "end": e.isoformat()} for s, e in ordered]
    session.image_start_at = ordered[0][0]
    session.image_end_at = ordered[-1][1]
    apply_image_duration(session)


def apply_image_duration(session: WorkSession) -> None:
    """Set duration_minutes to the worked time when start/end times are present."""
    if not session.image_start_at or not session.image_end_at:
        return
    session.duration_minutes = max(0, work_minutes(session))


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


def evidence_hours_for_workers(
    db: Session,
    worker_ids: Sequence[UUID],
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    period_id: Optional[UUID] = None,
) -> dict[UUID, tuple[Decimal, bool, int]]:
    """Same sum as :func:`evidence_hours_for_worker`, for a whole roster at once.

    A payroll report asks this for every worker in the period. Done one worker
    at a time that is one round trip each — on a hosted database it is the
    difference between a report that renders and one the browser gives up on.
    Every worker asked for appears in the result, zeroed if they have no
    qualifying sessions, so callers never have to special-case a miss.
    """
    ids = list(dict.fromkeys(worker_ids))
    totals: dict[UUID, tuple[Decimal, bool, int]] = {
        wid: (Decimal("0.00"), False, 0) for wid in ids
    }
    if not ids:
        return totals

    stmt = select(WorkSession).where(
        WorkSession.worker_id.in_(ids),
        WorkSession.end_time.is_not(None),
        WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
        WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
    )
    if start is not None:
        stmt = stmt.where(WorkSession.start_time >= start)
    if end is not None:
        stmt = stmt.where(WorkSession.start_time <= end)

    minutes: dict[UUID, int] = {wid: 0 for wid in ids}
    incomplete: dict[UUID, bool] = {wid: False for wid in ids}
    counts: dict[UUID, int] = {wid: 0 for wid in ids}

    for s in db.exec(stmt).all():
        if period_id and s.payroll_period_id is not None and s.payroll_period_id != period_id:
            continue
        wid = s.worker_id
        if wid not in minutes:
            continue
        if not evidence_complete(s):
            incomplete[wid] = True
        minutes[wid] += effective_duration_minutes(s)
        counts[wid] += 1

    for wid in ids:
        hours = (Decimal(minutes[wid]) / Decimal(60)).quantize(Decimal("0.01"))
        totals[wid] = (hours, incomplete[wid], counts[wid])
    return totals


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

    Delegates to the batch form so the two can never disagree about which
    sessions count.
    """
    return evidence_hours_for_workers(
        db, [worker_id], start, end, period_id=period_id
    )[worker_id]
