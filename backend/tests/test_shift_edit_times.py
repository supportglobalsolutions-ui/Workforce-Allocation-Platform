"""Workers can move their own pending, future shifts; nothing else."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from models.enums import ShiftStatusEnum
from routers.shifts import _check_new_times
from schemas.shift import ShiftUpdate

NOW = datetime.now(timezone.utc)


def _shift(status=ShiftStatusEnum.pending, starts_in=timedelta(days=1), hours=6):
    start = NOW + starts_in
    return SimpleNamespace(status=status, scheduled_start=start, scheduled_end=start + timedelta(hours=hours))


def _update(start_in: timedelta, hours: float) -> ShiftUpdate:
    start = NOW + start_in
    return ShiftUpdate(scheduled_start=start, scheduled_end=start + timedelta(hours=hours))


def test_worker_can_move_pending_future_shift():
    _check_new_times(_shift(), _update(timedelta(days=2), 4), is_staff=False)


@pytest.mark.parametrize(
    ("shift", "update", "message"),
    [
        (_shift(status=ShiftStatusEnum.approved), _update(timedelta(days=2), 4), "Only pending"),
        (_shift(starts_in=timedelta(hours=-1)), _update(timedelta(days=2), 4), "already started"),
        (_shift(), _update(timedelta(hours=-2), 4), "in the future"),
        (_shift(), _update(timedelta(days=2), -1), "after the start"),
        (_shift(), _update(timedelta(days=2), 30), "at most 24 hours"),
    ],
)
def test_worker_edit_rules(shift, update, message):
    with pytest.raises(HTTPException) as exc:
        _check_new_times(shift, update, is_staff=False)
    assert message in exc.value.detail


def test_staff_can_move_approved_shift():
    _check_new_times(_shift(status=ShiftStatusEnum.approved), _update(timedelta(days=2), 4), is_staff=True)
