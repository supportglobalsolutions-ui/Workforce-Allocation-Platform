"""
Monthly Hours Log: paid hours per worker per desktop for one working month.

Rows fill from session screenshot times (the same sessions payroll counts).
An admin can type over any row; a typed row is never refreshed again until it
is reset. A worker's payslip hours are the total of their rows.
"""
from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional, Sequence
from uuid import UUID

from sqlmodel import Session, select

from models.enums import PayrollPeriodStatusEnum, PayrollSessionEnum
from models.hours_log import HoursLogEntry
from models.payroll import PayrollPeriod
from models.session import Session as WorkSession
from services.session_evidence import effective_duration_minutes

ZERO = Decimal("0")
TWO_DP = Decimal("0.01")

Key = tuple[UUID, Optional[UUID]]


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(TWO_DP, rounding=ROUND_HALF_UP)


def is_editable(period: PayrollPeriod) -> bool:
    return period.status != PayrollPeriodStatusEnum.paid


def refreshes(period: PayrollPeriod) -> bool:
    """Approved months keep their hours; only open and calculated ones follow sessions."""
    return period.status in (PayrollPeriodStatusEnum.open, PayrollPeriodStatusEnum.calculated)


def hours_by_desk(sessions: Iterable[WorkSession]) -> dict[Key, Decimal]:
    minutes: dict[Key, int] = {}
    for s in sessions:
        key = (s.worker_id, s.rdp_resource_id)
        minutes[key] = minutes.get(key, 0) + effective_duration_minutes(s)
    return {k: _q(Decimal(m) / Decimal(60)) for k, m in minutes.items()}


def _period_sessions(
    db: Session, period: PayrollPeriod, worker_ids: Optional[Sequence[UUID]] = None,
) -> list[WorkSession]:
    """Sessions that count toward this month (same rule as payroll evidence)."""
    start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)
    stmt = select(WorkSession).where(
        WorkSession.end_time.is_not(None),
        WorkSession.start_time >= start,
        WorkSession.start_time <= end,
        WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
        WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
    )
    if worker_ids is not None:
        stmt = stmt.where(WorkSession.worker_id.in_(list(worker_ids)))
    return [
        s for s in db.exec(stmt).all()
        if s.payroll_period_id is None or s.payroll_period_id == period.id
    ]


def entries(
    db: Session, period_id: UUID, worker_ids: Optional[Sequence[UUID]] = None,
) -> list[HoursLogEntry]:
    stmt = select(HoursLogEntry).where(HoursLogEntry.payroll_period_id == period_id)
    if worker_ids is not None:
        stmt = stmt.where(HoursLogEntry.worker_id.in_(list(worker_ids)))
    return list(db.exec(stmt).all())


def refresh(
    db: Session,
    period: PayrollPeriod,
    worker_ids: Optional[Sequence[UUID]] = None,
    sessions: Optional[Iterable[WorkSession]] = None,
) -> list[HoursLogEntry]:
    """Bring session hours up to date. Typed rows keep their hours. Caller commits.

    Pass ``sessions`` when the caller already has the month's sessions (it must
    then cover every worker in ``worker_ids``, or the whole month).
    """
    if sessions is None:
        sessions = _period_sessions(db, period, worker_ids)
    computed = hours_by_desk(sessions)
    rows = {(r.worker_id, r.rdp_resource_id): r for r in entries(db, period.id, worker_ids)}
    now = datetime.now(timezone.utc)
    for key in set(computed) | set(rows):
        worker_id, rdp_id = key
        if worker_ids is not None and worker_id not in worker_ids:
            continue
        session_hours = computed.get(key, ZERO)
        row = rows.get(key)
        if row is None:
            row = HoursLogEntry(
                payroll_period_id=period.id, worker_id=worker_id, rdp_resource_id=rdp_id,
                hours=session_hours, session_hours=session_hours, is_manual=False, updated_at=now,
            )
            rows[key] = row
            db.add(row)
            continue
        if not row.is_manual and key not in computed:
            db.delete(row)
            rows.pop(key)
            continue
        if row.session_hours == session_hours and (row.is_manual or row.hours == session_hours):
            continue
        row.session_hours = session_hours
        if not row.is_manual:
            row.hours = session_hours
        row.updated_at = now
        db.add(row)
    db.flush()
    return list(rows.values())


def totals(
    db: Session, period_id: UUID, worker_ids: Optional[Sequence[UUID]] = None,
) -> dict[UUID, Decimal]:
    """Payslip hours per worker that has log rows."""
    out: dict[UUID, Decimal] = {}
    for row in entries(db, period_id, worker_ids):
        out[row.worker_id] = out.get(row.worker_id, ZERO) + Decimal(row.hours or 0)
    return {k: _q(v) for k, v in out.items()}


def manual_deltas(
    db: Session, period_id: UUID, worker_ids: Optional[Sequence[UUID]] = None,
) -> dict[UUID, Decimal]:
    """Typed hours minus session hours per worker (the hours sessions don't explain)."""
    out: dict[UUID, Decimal] = {}
    for row in entries(db, period_id, worker_ids):
        if row.is_manual:
            out[row.worker_id] = out.get(row.worker_id, ZERO) + Decimal(row.hours) - Decimal(row.session_hours)
    return {k: _q(v) for k, v in out.items()}


def worker_total(db: Session, period: PayrollPeriod, worker_id: UUID) -> Decimal:
    """A worker's payslip hours, filling the log from sessions first while the month is open."""
    if refreshes(period):
        refresh(db, period, [worker_id])
    return totals(db, period.id, [worker_id]).get(worker_id, ZERO)


def set_entry(
    db: Session,
    period: PayrollPeriod,
    worker_id: UUID,
    rdp_resource_id: Optional[UUID],
    hours: Decimal,
    *,
    actor_id: Optional[UUID] = None,
    note: Optional[str] = None,
) -> HoursLogEntry:
    """Type the hours for one worker on one desktop (or the "No desktop" row)."""
    if hours < 0:
        raise ValueError("Hours cannot be negative")
    row = db.exec(
        select(HoursLogEntry).where(
            HoursLogEntry.payroll_period_id == period.id,
            HoursLogEntry.worker_id == worker_id,
            HoursLogEntry.rdp_resource_id == rdp_resource_id
            if rdp_resource_id is not None else HoursLogEntry.rdp_resource_id.is_(None),
        )
    ).first()
    if row is None:
        row = HoursLogEntry(
            payroll_period_id=period.id, worker_id=worker_id, rdp_resource_id=rdp_resource_id,
            session_hours=ZERO,
        )
    row.hours = _q(hours)
    row.is_manual = True
    row.updated_by = actor_id
    if note is not None:
        row.note = note.strip() or None
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.flush()
    return row


def reset_entry(db: Session, row: HoursLogEntry) -> HoursLogEntry:
    """Go back to the session hours for this row."""
    row.is_manual = False
    row.hours = row.session_hours
    row.note = None
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)
    db.flush()
    return row


def set_worker_total(
    db: Session,
    period: PayrollPeriod,
    worker_id: UUID,
    total: Decimal,
    *,
    actor_id: Optional[UUID] = None,
    note: Optional[str] = None,
) -> Decimal:
    """An admin typed the payslip hours: put the difference into the log.

    More hours go onto the worker's biggest row (or a "No desktop" row when
    there are none); fewer hours come off the biggest rows first.
    """
    if total < 0:
        raise ValueError("Hours cannot be negative")
    total = _q(total)
    if refreshes(period):
        refresh(db, period, [worker_id])
    rows = sorted(entries(db, period.id, [worker_id]), key=lambda r: Decimal(r.hours), reverse=True)
    current = _q(sum((Decimal(r.hours) for r in rows), ZERO))
    delta = total - current
    if delta == 0:
        return current
    now = datetime.now(timezone.utc)
    if delta > 0:
        if rows:
            target = rows[0]
            target.hours = _q(Decimal(target.hours) + delta)
        else:
            target = HoursLogEntry(
                payroll_period_id=period.id, worker_id=worker_id, rdp_resource_id=None,
                hours=delta, session_hours=ZERO,
            )
        touched = [target]
    else:
        remaining = -delta
        touched = []
        for row in rows:
            if remaining <= 0:
                break
            take = min(Decimal(row.hours), remaining)
            if take <= 0:
                continue
            row.hours = _q(Decimal(row.hours) - take)
            remaining -= take
            touched.append(row)
    for row in touched:
        row.is_manual = True
        row.updated_by = actor_id
        if note:
            row.note = note
        row.updated_at = now
        db.add(row)
    db.flush()
    return total
