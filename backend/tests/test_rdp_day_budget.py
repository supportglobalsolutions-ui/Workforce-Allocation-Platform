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
    start, end = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 14, 7, 0)  # 10:00 EAT previous day
    assert end == _utc(2026, 3, 15, 7, 0)


def test_eat_window_at_exactly_10_starts_new_day():
    now = _utc(2026, 3, 15, 7, 0)  # 10:00 EAT
    start, end = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 15, 7, 0)
    assert end == _utc(2026, 3, 16, 7, 0)


def test_eat_window_just_after_10():
    now = _utc(2026, 3, 15, 7, 1)
    start, end = budget.eat_day_window(now)
    assert start == _utc(2026, 3, 15, 7, 0)
    assert end == _utc(2026, 3, 16, 7, 0)


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


def test_budget_remaining_under_custom_limits():
    rdp_id = uuid.uuid4()
    resource = SimpleNamespace(id=rdp_id, daily_limit_hours=Decimal("4"))
    db = MagicMock()
    session = SimpleNamespace(
        image_start_at=_utc(2026, 3, 15, 8, 0),
        image_end_at=_utc(2026, 3, 15, 10, 0),  # 120 minutes inside window
    )
    db.exec.return_value.all.return_value = [session]
    now = _utc(2026, 3, 15, 12, 0)
    result = budget.budget_for_rdp(db, resource, now=now)
    assert result.limit_minutes == 240
    assert result.used_minutes == 120
    assert result.remaining_minutes == 120


def test_budget_remaining_12h_and_odd_6h():
    rdp_id = uuid.uuid4()
    db = MagicMock()
    session = SimpleNamespace(
        image_start_at=_utc(2026, 3, 15, 8, 0),
        image_end_at=_utc(2026, 3, 15, 11, 0),  # 180 min
    )
    db.exec.return_value.all.return_value = [session]
    now = _utc(2026, 3, 15, 12, 0)

    twelve = budget.budget_for_rdp(
        db, SimpleNamespace(id=rdp_id, daily_limit_hours=Decimal("12")), now=now
    )
    assert twelve.limit_minutes == 720
    assert twelve.remaining_minutes == 540

    six = budget.budget_for_rdp(
        db, SimpleNamespace(id=rdp_id, daily_limit_hours=Decimal("6")), now=now
    )
    assert six.limit_minutes == 360
    assert six.remaining_minutes == 180


def test_assert_worker_blocked_when_remaining_zero():
    rdp_id = uuid.uuid4()
    resource = SimpleNamespace(id=rdp_id, daily_limit_hours=Decimal("4"))
    db = MagicMock()
    session = SimpleNamespace(
        image_start_at=_utc(2026, 3, 15, 8, 0),
        image_end_at=_utc(2026, 3, 15, 12, 0),  # 240 min = full 4h
    )
    db.exec.return_value.all.return_value = [session]
    now = _utc(2026, 3, 15, 14, 0)
    with pytest.raises(HTTPException) as exc:
        budget.assert_worker_may_use_budget(db, resource, is_staff=False, now=now)
    assert exc.value.status_code == 409
    assert "no reported time left" in exc.value.detail.lower()


def test_assert_staff_bypasses_zero_budget():
    rdp_id = uuid.uuid4()
    resource = SimpleNamespace(id=rdp_id, daily_limit_hours=Decimal("4"))
    db = MagicMock()
    session = SimpleNamespace(
        image_start_at=_utc(2026, 3, 15, 8, 0),
        image_end_at=_utc(2026, 3, 15, 12, 0),
    )
    db.exec.return_value.all.return_value = [session]
    now = _utc(2026, 3, 15, 14, 0)
    result = budget.assert_worker_may_use_budget(db, resource, is_staff=True, now=now)
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
