"""Open a new work month when the current one ends; keep admin date overrides."""
from __future__ import annotations

import asyncio
import calendar
import logging
from datetime import date, timedelta

from sqlmodel import Session, select

from core.database import engine
from models.payroll import PayrollPeriod
from models.enums import PayrollPeriodStatusEnum
from services.period_current import pin_current_period
from services.period_labels import period_label_from_date

logger = logging.getLogger(__name__)

# Check hourly so a 1st-of-month rollover is not delayed until the next restart.
INTERVAL_SECONDS = 3600


def _month_end(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def _unique_label(db: Session, start: date, end: date) -> str:
    base = period_label_from_date(start)
    taken = {
        row.label
        for row in db.exec(
            select(PayrollPeriod).where(PayrollPeriod.label.like(f"{base}%"))
        ).all()
    }
    if base not in taken:
        return base
    ranged = f"{base} ({start.day}–{end.day})"
    if ranged not in taken:
        return ranged
    n = 2
    while f"{base} ({n})" in taken:
        n += 1
    return f"{base} ({n})"


def ensure_current_work_month(db: Session, *, today: date | None = None) -> dict[str, str | None]:
    """Unpin expired current periods and open a covering month when none exists.

    Admins can still rename, retarget dates, or pin a different period afterwards.
    Expired months are left in their payroll status (open/calculated/…) so finance
    can still customise them — they are just no longer "current".
    """
    today = today or date.today()
    created_id: str | None = None
    closed_id: str | None = None

    expired_current = db.exec(
        select(PayrollPeriod).where(
            PayrollPeriod.is_current == True,  # noqa: E712
            PayrollPeriod.end_date < today,
        )
    ).all()
    for period in expired_current:
        period.is_current = False
        db.add(period)
        closed_id = str(period.id)

    covering = db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.start_date <= today, PayrollPeriod.end_date >= today)
        .order_by(PayrollPeriod.start_date.desc())
    ).first()
    if covering:
        if not covering.is_current:
            pin_current_period(db, covering)
        db.commit()
        return {"closed_id": closed_id, "current_id": str(covering.id), "created_id": None}

    latest = db.exec(select(PayrollPeriod).order_by(PayrollPeriod.end_date.desc())).first()
    month_start = date(today.year, today.month, 1)
    start = month_start
    if latest and latest.end_date < today:
        nxt = latest.end_date + timedelta(days=1)
        if nxt.year == today.year and nxt.month == today.month:
            start = nxt
    end = _month_end(today)
    if start > end:
        start = month_start

    currency = (latest.currency if latest else None) or "USD"
    period = PayrollPeriod(
        label=_unique_label(db, start, end),
        start_date=start,
        end_date=end,
        currency=currency,
        status=PayrollPeriodStatusEnum.open,
    )
    db.add(period)
    db.flush()
    pin_current_period(db, period)
    db.commit()
    db.refresh(period)
    created_id = str(period.id)
    logger.info("Opened work month %s (%s to %s)", period.label, start.isoformat(), end.isoformat())
    return {"closed_id": closed_id, "current_id": created_id, "created_id": created_id}


def run_period_lifecycle_tick() -> dict[str, str | None]:
    with Session(engine) as db:
        return ensure_current_work_month(db)


async def run_period_lifecycle_loop() -> None:
    logger.info("Work-month lifecycle loop started (every %ss)", INTERVAL_SECONDS)
    while True:
        try:
            stats = await asyncio.to_thread(run_period_lifecycle_tick)
            if stats.get("created_id") or stats.get("closed_id"):
                logger.info("Work-month lifecycle tick: %s", stats)
        except Exception:
            logger.exception("Work-month lifecycle tick failed")
        await asyncio.sleep(INTERVAL_SECONDS)
