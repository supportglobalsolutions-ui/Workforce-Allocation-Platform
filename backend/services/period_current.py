"""Resolve which payroll period admin screens treat as current."""
from datetime import date
from typing import Optional

from sqlmodel import Session, select

from models.enums import PayrollPeriodStatusEnum
from models.payroll import PayrollPeriod


def resolve_current_period(db: Session) -> Optional[PayrollPeriod]:
    """Pinned current, else the window covering today, else latest unpaid, else latest."""
    pinned = db.exec(select(PayrollPeriod).where(PayrollPeriod.is_current == True)).first()  # noqa: E712
    if pinned:
        return pinned

    today = date.today()
    covering = db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.start_date <= today, PayrollPeriod.end_date >= today)
        .order_by(PayrollPeriod.start_date.desc())
    ).first()
    if covering:
        return covering

    unpaid = db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.status != PayrollPeriodStatusEnum.paid)
        .order_by(PayrollPeriod.start_date.desc())
    ).first()
    if unpaid:
        return unpaid

    return db.exec(select(PayrollPeriod).order_by(PayrollPeriod.start_date.desc())).first()


def pin_current_period(db: Session, period: PayrollPeriod) -> None:
    """Exactly one row may have is_current=True."""
    for other in db.exec(
        select(PayrollPeriod).where(
            PayrollPeriod.is_current == True,  # noqa: E712
            PayrollPeriod.id != period.id,
        )
    ).all():
        other.is_current = False
        db.add(other)
    period.is_current = True
    db.add(period)
