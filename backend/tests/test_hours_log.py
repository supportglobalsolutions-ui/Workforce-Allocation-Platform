"""Hours Log: fill from sessions, typed rows kept, payslip hours = log total."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.enums import PayrollPeriodStatusEnum
from services import hours_log


class FakeDB:
    """Just enough of a session for the Hours Log: rows live in a list."""

    def __init__(self):
        self.rows = []

    def add(self, row):
        if not any(r is row for r in self.rows):
            self.rows.append(row)

    def delete(self, row):
        self.rows = [r for r in self.rows if r is not row]

    def flush(self):
        pass


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()
    monkeypatch.setattr(
        hours_log, "entries",
        lambda db, period_id, worker_ids=None: [
            r for r in db.rows
            if r.payroll_period_id == period_id and (worker_ids is None or r.worker_id in worker_ids)
        ],
    )
    monkeypatch.setattr(hours_log, "effective_duration_minutes", lambda s: s.minutes)
    return fake


def _period(status=PayrollPeriodStatusEnum.open):
    return SimpleNamespace(id=uuid4(), status=status, start_date=date(2026, 10, 1), end_date=date(2026, 10, 31))


def _session(worker, desk, minutes):
    return SimpleNamespace(worker_id=worker, rdp_resource_id=desk, minutes=minutes)


def _row(db, period, worker, desk):
    return next(r for r in db.rows if r.payroll_period_id == period.id and (r.worker_id, r.rdp_resource_id) == (worker, desk))


def test_sessions_fill_one_row_per_desktop_and_a_no_desktop_row(db):
    period, amina, x1, x2 = _period(), uuid4(), uuid4(), uuid4()
    sessions = [
        _session(amina, x1, 300), _session(amina, x1, 300),  # 10 h on X1
        _session(amina, x2, 90),                              # 1.5 h on X2
        _session(amina, None, 45),                            # partner work, no desktop
    ]
    hours_log.refresh(db, period, sessions=sessions)

    assert _row(db, period, amina, x1).hours == Decimal("10.00")
    assert _row(db, period, amina, x2).hours == Decimal("1.50")
    assert _row(db, period, amina, None).hours == Decimal("0.75")
    assert hours_log.totals(db, period.id) == {amina: Decimal("12.25")}


def test_typed_rows_survive_a_refresh_and_track_the_session_figure(db):
    period, amina, x1, x2 = _period(), uuid4(), uuid4(), uuid4()
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 600), _session(amina, x2, 120)])
    typed = _row(db, period, amina, x1)
    typed.hours, typed.is_manual = Decimal("12.00"), True

    # More sessions arrive on X1; X2's only session is excluded and drops out.
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 660)])

    assert typed.hours == Decimal("12.00")
    assert typed.session_hours == Decimal("11.00")
    assert not any(r.rdp_resource_id == x2 for r in db.rows)
    assert hours_log.manual_deltas(db, period.id) == {amina: Decimal("1.00")}


def test_reset_goes_back_to_session_hours(db):
    period, amina, x1 = _period(), uuid4(), uuid4()
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 600)])
    row = _row(db, period, amina, x1)
    row.hours, row.is_manual = Decimal("15"), True

    hours_log.reset_entry(db, row)

    assert (row.hours, row.is_manual) == (Decimal("10.00"), False)


def test_typing_more_payslip_hours_goes_on_the_busiest_desktop(db):
    period, amina, x1, x2 = _period(PayrollPeriodStatusEnum.approved), uuid4(), uuid4(), uuid4()
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 600), _session(amina, x2, 120)])

    hours_log.set_worker_total(db, period, amina, Decimal("14"))

    assert _row(db, period, amina, x1).hours == Decimal("12.00")
    assert _row(db, period, amina, x1).is_manual
    assert not _row(db, period, amina, x2).is_manual
    assert hours_log.totals(db, period.id)[amina] == Decimal("14.00")


def test_typing_fewer_payslip_hours_comes_off_the_largest_rows_first(db):
    period, amina, x1, x2 = _period(PayrollPeriodStatusEnum.approved), uuid4(), uuid4(), uuid4()
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 600), _session(amina, x2, 120)])

    hours_log.set_worker_total(db, period, amina, Decimal("1"))

    assert _row(db, period, amina, x1).hours == Decimal("0.00")
    assert _row(db, period, amina, x2).hours == Decimal("1.00")
    assert hours_log.totals(db, period.id)[amina] == Decimal("1.00")


def test_typed_hours_for_a_worker_with_no_sessions_land_on_no_desktop(db):
    period, partner = _period(PayrollPeriodStatusEnum.approved), uuid4()

    hours_log.set_worker_total(db, period, partner, Decimal("6"))

    row = _row(db, period, partner, None)
    assert (row.hours, row.session_hours, row.is_manual) == (Decimal("6"), Decimal("0"), True)


def test_negative_hours_are_refused(db):
    with pytest.raises(ValueError):
        hours_log.set_worker_total(db, _period(), uuid4(), Decimal("-1"))


def test_payslip_hours_are_the_log_total(db, monkeypatch):
    from routers import payroll as payroll_router

    period, amina, x1 = _period(PayrollPeriodStatusEnum.approved), uuid4(), uuid4()
    hours_log.refresh(db, period, sessions=[_session(amina, x1, 600), _session(amina, None, 60)])
    _row(db, period, amina, x1).hours = Decimal("9.5")
    monkeypatch.setattr(
        payroll_router, "evidence_hours_for_worker",
        lambda *a, **k: pytest.fail("the log has rows, so sessions must not be read"),
    )

    assert payroll_router._payslip_hours(db, period, amina) == Decimal("10.50")


def test_only_open_and_calculated_months_follow_sessions():
    assert hours_log.refreshes(_period(PayrollPeriodStatusEnum.calculated))
    assert not hours_log.refreshes(_period(PayrollPeriodStatusEnum.approved))
    assert hours_log.is_editable(_period(PayrollPeriodStatusEnum.approved))
    assert not hours_log.is_editable(_period(PayrollPeriodStatusEnum.paid))
