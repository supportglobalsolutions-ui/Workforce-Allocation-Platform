"""Outlier-style RDP daily budgets: an admin-set clock window, reported on-image time.

Each machine opens at ``daily_window_start_hour`` (EAT) and stays open for
``daily_limit_hours`` — e.g. 10:00 + 12h = 10:00–22:00, 22:00 + 12h = 22:00–10:00.
Time left is the smaller of the unused hours and the real time until the window
closes, so it counts down with the clock: at 11:00 a 10:00–22:00 window has at
most 11h left even if nothing was used. Outside the window nothing is left.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlmodel import Session, select

from models.rdp_machine import RDPClaimReservation, RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from services.session_evidence import effective_duration_minutes, session_blocks

EAT = ZoneInfo("Africa/Nairobi")
RESET_HOUR_EAT = 10


@dataclass(frozen=True)
class RdpDayBudget:
    limit_minutes: int
    used_minutes: int
    remaining_minutes: int
    # The open window, or — when closed — the next one to open.
    window_start: datetime
    window_end: datetime
    window_open: bool = True


def eat_day_window(
    now: datetime | None = None,
    *,
    start_hour: int = RESET_HOUR_EAT,
    length_hours: Decimal | float | int = 24,
) -> tuple[datetime, datetime, bool]:
    """Latest window opening at ``start_hour`` EAT, lasting ``length_hours`` (as UTC).

    Returns (start, end, open). When ``now`` falls after that window closed,
    the next window is returned with open=False.
    """
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    local = instant.astimezone(EAT)
    start_local = local.replace(hour=start_hour, minute=0, second=0, microsecond=0)
    if local < start_local:
        start_local = start_local - timedelta(days=1)
    length = timedelta(minutes=int(Decimal(str(length_hours)) * 60))
    end_local = start_local + length
    if local >= end_local:
        start_local = start_local + timedelta(days=1)
        return start_local.astimezone(timezone.utc), (start_local + length).astimezone(timezone.utc), False
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc), True


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _overlap_minutes(start: datetime, end: datetime, window_start: datetime, window_end: datetime) -> int:
    """Minutes of [start, end] that fall inside [window_start, window_end)."""
    s = _aware(start)
    e = _aware(end)
    if e <= s:
        return 0
    lo = max(s, window_start)
    hi = min(e, window_end)
    if hi <= lo:
        return 0
    return int((hi - lo).total_seconds() // 60)


def reported_used_minutes(
    db: Session,
    rdp_id: UUID,
    window_start: datetime,
    window_end: datetime,
) -> int:
    """Sum reported on-image minutes on this machine that overlap the EAT day window."""
    sessions = db.exec(
        select(WorkSession).where(
            WorkSession.rdp_resource_id == rdp_id,
            WorkSession.image_start_at.is_not(None),
            WorkSession.image_end_at.is_not(None),
            WorkSession.image_start_at < window_end,
            WorkSession.image_end_at > window_start,
        )
    ).all()
    total = 0
    for session in sessions:
        # Prefer clipped overlap so a session spanning the 10:00 boundary only
        # counts the portion inside this window.
        if session.image_start_at and session.image_end_at:
            # Each worked block separately, so breaks inside a session don't count.
            total += sum(
                _overlap_minutes(start, end, window_start, window_end)
                for start, end in session_blocks(session)
            )
        else:
            total += effective_duration_minutes(session)
    return max(0, total)


def budget_for_rdp(
    db: Session,
    resource: RDPResource,
    *,
    now: datetime | None = None,
) -> RdpDayBudget:
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    limit_hours = Decimal(str(resource.daily_limit_hours or 12))
    limit_minutes = int(limit_hours * 60)
    start_hour = getattr(resource, "daily_window_start_hour", None)
    window_start, window_end, is_open = eat_day_window(
        instant,
        start_hour=RESET_HOUR_EAT if start_hour is None else int(start_hour),
        length_hours=limit_hours,
    )
    if not is_open:
        return RdpDayBudget(
            limit_minutes=limit_minutes,
            used_minutes=0,
            remaining_minutes=0,
            window_start=window_start,
            window_end=window_end,
            window_open=False,
        )
    used = reported_used_minutes(db, resource.id, window_start, window_end)
    # Count down with the clock: never more than the time until the window closes.
    clock_left = int((window_end - instant).total_seconds() // 60)
    remaining = max(0, min(limit_minutes - used, clock_left))
    return RdpDayBudget(
        limit_minutes=limit_minutes,
        used_minutes=used,
        remaining_minutes=remaining,
        window_start=window_start,
        window_end=window_end,
    )


def assert_worker_may_use_budget(
    db: Session,
    resource: RDPResource,
    *,
    is_staff: bool,
    now: datetime | None = None,
) -> RdpDayBudget:
    """Staff bypass. Workers need remaining reported budget > 0 to claim."""
    budget = budget_for_rdp(db, resource, now=now)
    if is_staff:
        return budget
    if not budget.window_open:
        opens = budget.window_start.astimezone(EAT).strftime("%Y-%m-%d %H:%M EAT")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This desktop's working window is closed. It opens at {opens}.",
        )
    if budget.remaining_minutes <= 0:
        ends = budget.window_end.astimezone(EAT).strftime("%Y-%m-%d %H:%M EAT")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This desktop has no time left in today's window "
                f"({budget.used_minutes} / {budget.limit_minutes} min used). "
                f"The window closes at {ends}."
            ),
        )
    return budget


def active_reservation(
    db: Session,
    rdp_id: UUID,
    *,
    now: datetime | None = None,
) -> Optional[RDPClaimReservation]:
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return db.exec(
        select(RDPClaimReservation).where(
            RDPClaimReservation.rdp_resource_id == rdp_id,
            RDPClaimReservation.cancelled_at.is_(None),
            RDPClaimReservation.starts_at <= instant,
            RDPClaimReservation.ends_at > instant,
        )
    ).first()


def assert_reservation_allows_claim(
    db: Session,
    resource: RDPResource,
    worker_id: UUID,
    *,
    is_staff: bool,
    now: datetime | None = None,
) -> Optional[RDPClaimReservation]:
    """If another worker holds an active reservation, block non-staff claimants."""
    row = active_reservation(db, resource.id, now=now)
    if not row:
        return None
    if is_staff or row.worker_id == worker_id:
        return row
    holder = db.get(Worker, row.worker_id)
    name = holder.display_name if holder else "another worker"
    until = _aware(row.ends_at).astimezone(EAT).strftime("%Y-%m-%d %H:%M %Z")
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"This desktop is reserved for {name} until {until}.",
    )


def reservations_overlap(
    db: Session,
    rdp_id: UUID,
    starts_at: datetime,
    ends_at: datetime,
    *,
    exclude_id: UUID | None = None,
) -> bool:
    q = select(RDPClaimReservation).where(
        RDPClaimReservation.rdp_resource_id == rdp_id,
        RDPClaimReservation.cancelled_at.is_(None),
        RDPClaimReservation.starts_at < ends_at,
        RDPClaimReservation.ends_at > starts_at,
    )
    if exclude_id:
        q = q.where(RDPClaimReservation.id != exclude_id)
    return db.exec(q).first() is not None
