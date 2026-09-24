"""Outlier-style RDP daily budgets: 10:00 EAT window, reported on-image time."""
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
from services.session_evidence import effective_duration_minutes

EAT = ZoneInfo("Africa/Nairobi")
RESET_HOUR_EAT = 10


@dataclass(frozen=True)
class RdpDayBudget:
    limit_minutes: int
    used_minutes: int
    remaining_minutes: int
    window_start: datetime
    window_end: datetime


def eat_day_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Current Outlier-style day: 10:00 EAT → next 10:00 EAT (as UTC)."""
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    local = instant.astimezone(EAT)
    start_local = local.replace(hour=RESET_HOUR_EAT, minute=0, second=0, microsecond=0)
    if local < start_local:
        start_local = start_local - timedelta(days=1)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


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
            total += _overlap_minutes(
                session.image_start_at,
                session.image_end_at,
                window_start,
                window_end,
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
    window_start, window_end = eat_day_window(now)
    limit_hours = Decimal(str(resource.daily_limit_hours or 12))
    limit_minutes = int(limit_hours * 60)
    used = reported_used_minutes(db, resource.id, window_start, window_end)
    remaining = max(0, limit_minutes - used)
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
    if budget.remaining_minutes <= 0:
        ends = budget.window_end.astimezone(EAT).strftime("%Y-%m-%d %H:%M %Z")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This desktop has no reported time left for today "
                f"({budget.used_minutes} / {budget.limit_minutes} min used). "
                f"The pool resets at {ends}."
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
