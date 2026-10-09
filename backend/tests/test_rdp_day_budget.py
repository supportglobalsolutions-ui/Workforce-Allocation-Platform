"""Outlier-style RDP day budget: EAT window, overlap clipping, claim gates."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from services import rdp_day_budget as budget


def _utc(year, month, day, hour, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


def test_eat_window_before_10_uses_previous_day_reset():
    # 09:30 EAT = 06:30 UTC on a day with no DST (Nairobi is UTC+3 year-round).
    now = _utc(2026, 3, 15, 6, 30)
    start, end, is_open = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 14, 7, 0)  # 10:00 EAT previous day
    assert end == _utc(2026, 3, 15, 7, 0)
    assert is_open


def test_eat_window_at_exactly_10_starts_new_day():
    now = _utc(2026, 3, 15, 7, 0)  # 10:00 EAT
    start, end, is_open = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 15, 7, 0)
    assert end == _utc(2026, 3, 16, 7, 0)
    assert is_open


def test_eat_window_just_after_10():
    now = _utc(2026, 3, 15, 7, 1)
    start, end, is_open = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 15, 7, 0)
    assert end == _utc(2026, 3, 16, 7, 0)
    assert is_open


def test_12h_day_window_closes_at_22_eat():
    # 10:00 + 12h → 10:00–22:00 EAT. 23:00 EAT (20:00 UTC) is closed; next opens tomorrow 10:00.
    start, end, is_open = budget.eat_day_window(_utc(2026, 3, 15, 20, 0), start_hour=10, length_hours=12)
    assert not is_open
    assert start == _utc(2026, 3, 16, 7, 0)
    assert end == _utc(2026, 3, 16, 19, 0)


def test_12h_night_window_crosses_midnight():
    # 22:00 + 12h → 22:00–10:00 EAT. 02:00 EAT (23:00 UTC prev day) is inside last night's window.
    start, end, is_open = budget.eat_day_window(_utc(2026, 3, 14, 23, 0), start_hour=22, length_hours=12)
    assert is_open
    assert start == _utc(2026, 3, 14, 19, 0)  # 22:00 EAT on the 14th
    assert end == _utc(2026, 3, 15, 7, 0)     # 10:00 EAT on the 15th


def test_overlap_minutes_clips_to_window():
    window_start = _utc(2026, 3, 15, 7, 0)
    window_end = _utc(2026, 3, 16, 7, 0)
    # Session starts 1h before window, ends 90 min into window → 90 minutes.
    start = _utc(2026, 3, 15, 6, 0)
    end = _utc(2026, 3, 15, 8, 30)
    assert budget._overlap_minutes(start, end, window_start, window_end) == 90


def test_overlap_minutes_session_entirely_outside():
    window_start = _utc(2026, 3, 15, 7, 0)
    window_end = _utc(2026, 3, 16, 7, 0)
    start = _utc(2026, 3, 14, 8, 0)
    end = _utc(2026, 3, 14, 10, 0)
    assert budget._overlap_minutes(start, end, window_start, window_end) == 0


def test_overlap_minutes_spans_reset_boundary():
    window_start = _utc(2026, 3, 15, 7, 0)
    window_end = _utc(2026, 3, 16, 7, 0)
    # Crosses into next window: only portion before window_end counts.
    start = _utc(2026, 3, 16, 6, 0)
    end = _utc(2026, 3, 16, 8, 0)
    assert budget._overlap_minutes(start, end, window_start, window_end) == 60


def _machine(hours, start_hour=10):
    return SimpleNamespace(id=uuid.uuid4(), daily_limit_hours=Decimal(str(hours)), daily_window_start_hour=start_hour)


def _db_with(*sessions):
    db = MagicMock()
    db.exec.return_value.all.return_value = list(sessions)
    return db


def test_time_left_counts_down_with_the_clock():
    # 10:00–22:00 EAT window, nothing used. At 11:00 EAT only 11h are left.
    result = budget.budget_for_rdp(_db_with(), _machine(12), now=_utc(2026, 3, 15, 8, 0))
    assert result.window_open
    assert result.used_minutes == 0
    assert result.remaining_minutes == 11 * 60


def test_time_left_is_capped_by_unused_hours():
    # 10:00–14:00 EAT (4h). 2h used by 12:00 EAT, 2h of clock left → 2h left.
    session = SimpleNamespace(image_start_at=_utc(2026, 3, 15, 7, 0), image_end_at=_utc(2026, 3, 15, 9, 0))
    result = budget.budget_for_rdp(_db_with(session), _machine(4), now=_utc(2026, 3, 15, 9, 0))
    assert result.limit_minutes == 240
    assert result.used_minutes == 120
    assert result.remaining_minutes == 120


def test_used_hours_win_when_smaller_than_clock():
    # 12h window, 3h used by 12:00 EAT: 10h of clock left but only 9h unused → 9h.
    session = SimpleNamespace(image_start_at=_utc(2026, 3, 15, 7, 0), image_end_at=_utc(2026, 3, 15, 10, 0))
    result = budget.budget_for_rdp(_db_with(session), _machine(12), now=_utc(2026, 3, 15, 9, 0))
    assert result.remaining_minutes == 9 * 60


def test_closed_window_has_nothing_left():
    # 23:00 EAT is outside 10:00–22:00.
    result = budget.budget_for_rdp(_db_with(), _machine(12), now=_utc(2026, 3, 15, 20, 0))
    assert not result.window_open
    assert result.remaining_minutes == 0


def test_assert_worker_blocked_when_remaining_zero():
    # 4h window 10:00–14:00 EAT fully used (240 min) while it is still open.
    session = SimpleNamespace(image_start_at=_utc(2026, 3, 15, 7, 0), image_end_at=_utc(2026, 3, 15, 11, 0))
    with pytest.raises(HTTPException) as exc:
        budget.assert_worker_may_use_budget(
            _db_with(session), _machine(4), is_staff=False, now=_utc(2026, 3, 15, 10, 30),
        )
    assert exc.value.status_code == 409
    assert "no time left" in exc.value.detail.lower()


def test_assert_worker_blocked_outside_window():
    with pytest.raises(HTTPException) as exc:
        budget.assert_worker_may_use_budget(_db_with(), _machine(12), is_staff=False, now=_utc(2026, 3, 15, 20, 0))
    assert exc.value.status_code == 409
    assert "opens at" in exc.value.detail.lower()


def test_assert_staff_bypasses_zero_budget():
    result = budget.assert_worker_may_use_budget(_db_with(), _machine(12), is_staff=True, now=_utc(2026, 3, 15, 20, 0))
    assert result.remaining_minutes == 0


def test_reservation_blocks_other_worker():
    rdp_id = uuid.uuid4()
    holder = uuid.uuid4()
    claimant = uuid.uuid4()
    resource = SimpleNamespace(id=rdp_id)
    now = _utc(2026, 3, 15, 12, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        rdp_resource_id=rdp_id,
        worker_id=holder,
        starts_at=_utc(2026, 3, 15, 11, 0),
        ends_at=_utc(2026, 3, 15, 14, 0),
        cancelled_at=None,
    )
    db = MagicMock()
    db.exec.return_value.first.return_value = row
    db.get.return_value = SimpleNamespace(display_name="Alice")
    with pytest.raises(HTTPException) as exc:
        budget.assert_reservation_allows_claim(
            db, resource, claimant, is_staff=False, now=now
        )
    assert exc.value.status_code == 409
    assert "reserved" in exc.value.detail.lower()


def test_reservation_allows_holder_and_staff():
    rdp_id = uuid.uuid4()
    holder = uuid.uuid4()
    resource = SimpleNamespace(id=rdp_id)
    now = _utc(2026, 3, 15, 12, 0)
    row = SimpleNamespace(
        id=uuid.uuid4(),
        rdp_resource_id=rdp_id,
        worker_id=holder,
        starts_at=_utc(2026, 3, 15, 11, 0),
        ends_at=_utc(2026, 3, 15, 14, 0),
        cancelled_at=None,
    )
    db = MagicMock()
    db.exec.return_value.first.return_value = row
    assert (
        budget.assert_reservation_allows_claim(
            db, resource, holder, is_staff=False, now=now
        )
        is row
    )
    assert (
        budget.assert_reservation_allows_claim(
            db, resource, uuid.uuid4(), is_staff=True, now=now
        )
        is row
    )


def test_protected_super_admin_default_includes_jeffrey():
    """Default in Settings (not live .env override) must list Jeffrey Ronald."""
    from core.config import Settings

    default = Settings.model_fields["PROTECTED_SUPER_ADMIN_EMAILS"].default
    assert "dcm.ltd0@gmail.com" in default
