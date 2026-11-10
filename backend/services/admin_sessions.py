"""
Sessions an admin adds for a worker by hand.

Used for work done off a desktop or tracking that was missed. The session is
closed and approved, with one work block so its hours count like any other
session, and belongs to the month its date falls in.

Client income only counts sessions with an explicit client_id. The desktop is
optional (machine tracking / Hours Log); the client is required.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client
from models.enums import PayrollPeriodStatusEnum, PayrollSessionEnum, SessionCloseEnum, SessionTypeEnum
from models.payroll import PayrollPeriod
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker

MAX_HOURS = Decimal("24")
WORK_START = time(9, 0)


class AdminSessionError(ValueError):
    pass


def _period_for(db: Session, day: date) -> Optional[PayrollPeriod]:
    return db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.start_date <= day, PayrollPeriod.end_date >= day)
        .order_by(PayrollPeriod.start_date.desc())
    ).first()


def create(
    db: Session,
    worker: Worker,
    *,
    title: str,
    day: date,
    hours: Decimal,
    client_id: UUID,
    rate: Optional[Decimal] = None,
    rdp_resource_id: Optional[UUID] = None,
    note: Optional[str] = None,
) -> WorkSession:
    """Add the session and refresh the worker's month. `rate` None means the worker's tier rate. Caller commits."""
    from services.payroll_engine import on_session_hours_changed

    title = (title or "").strip()
    if not title:
        raise AdminSessionError("Give the session a name.")
    hours = Decimal(hours)
    if hours <= 0 or hours > MAX_HOURS:
        raise AdminSessionError("Hours must be more than 0 and at most 24.")
    if rate is not None and Decimal(rate) < 0:
        raise AdminSessionError("The rate can't be negative.")
    period = _period_for(db, day)
    if period is not None and period.status == PayrollPeriodStatusEnum.paid:
        raise AdminSessionError(f"{period.label} is already paid: sessions can't be added to it.")
    if period is not None and period.status == PayrollPeriodStatusEnum.approved:
        raise AdminSessionError(f"{period.label} is approved: reopen it before adding sessions.")
    if client_id is None:
        raise AdminSessionError("Pick the client this work was for.")
    client = db.get(Client, client_id)
    if client is None:
        raise AdminSessionError("Client not found.")
    desk = None
    if rdp_resource_id is not None:
        desk = db.get(RDPResource, rdp_resource_id)
        if desk is None:
            raise AdminSessionError("Desktop not found.")

    start = datetime.combine(day, WORK_START, tzinfo=timezone.utc)
    end = start + timedelta(minutes=int((hours * 60).to_integral_value()))
    session = WorkSession(
        worker_id=worker.id,
        session_type=SessionTypeEnum.gs_rdp,
        rdp_resource_id=desk.id if desk else None,
        client_id=client.id,
        start_time=start,
        end_time=end,
        duration_minutes=int((hours * 60).to_integral_value()),
        close_status=SessionCloseEnum.completed,
        payroll_approval_state=PayrollSessionEnum.approved,
        payroll_period_id=period.id if period else None,
        admin_notes=(note or "").strip() or None,
        title=title[:160],
        added_by_admin=True,
        rate_override=Decimal(rate).quantize(Decimal("0.01")) if rate is not None else None,
        image_start_at=start,
        image_end_at=end,
        work_blocks=[{"start": start.isoformat(), "end": end.isoformat()}],
        type_specific_fields={},
    )
    db.add(session)
    db.flush()
    on_session_hours_changed(db, session)
    return session


MAX_BULK = 200


def split_minutes(count: int, hours: Decimal, hours_are: str) -> list[int]:
    """Minutes for each of `count` sessions. `hours_are` "each": every session gets `hours`;
    "total": `hours` is shared out so the sessions add up to it exactly."""
    if count < 1 or count > MAX_BULK:
        raise AdminSessionError(f"Number of sessions must be between 1 and {MAX_BULK}.")
    hours = Decimal(hours)
    if hours <= 0:
        raise AdminSessionError("Hours must be more than 0.")
    if hours_are == "each":
        return [int((hours * 60).to_integral_value())] * count
    if hours_are != "total":
        raise AdminSessionError("Hours must be per session or total.")
    total = int((hours * 60).to_integral_value())
    if total < count:
        raise AdminSessionError("The total is too small to share across that many sessions.")
    base, extra = divmod(total, count)
    return [base + 1 if i < extra else base for i in range(count)]


def create_bulk(
    db: Session,
    worker: Worker,
    *,
    count: int,
    hours: Decimal,
    hours_are: str,
    title: str,
    day: date,
    client_id: UUID,
    rate: Optional[Decimal] = None,
    rdp_resource_id: Optional[UUID] = None,
    note: Optional[str] = None,
) -> list[WorkSession]:
    """Add `count` sessions at once, e.g. work done outside the system. Caller commits."""
    minutes = split_minutes(count, hours, hours_are)
    if max(minutes) > int(MAX_HOURS * 60):
        raise AdminSessionError("Each session can be at most 24 hours; add more sessions or lower the hours.")
    return [
        create(
            db, worker, title=title, day=day, hours=Decimal(m) / 60, rate=rate,
            client_id=client_id, rdp_resource_id=rdp_resource_id, note=note,
        )
        for m in minutes
    ]
