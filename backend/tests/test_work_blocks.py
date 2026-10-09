"""Several start/end work blocks per session: paid time is their sum, breaks excluded."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from services.rdp_day_budget import _overlap_minutes  # noqa: F401 — module import check
from services.session_evidence import (
    MAX_WORK_BLOCKS,
    session_blocks,
    set_work_blocks,
    work_minutes,
)


def _t(hour, minute=0, day=15):
    return datetime(2026, 3, day, hour, minute, tzinfo=timezone.utc)


def _session(**kw):
    base = dict(work_blocks=[], image_start_at=None, image_end_at=None, duration_minutes=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_three_two_hour_blocks_pay_six_hours():
    s = _session()
    set_work_blocks(s, [(_t(8), _t(10)), (_t(12), _t(14)), (_t(16), _t(18))])
    assert work_minutes(s) == 6 * 60
    assert s.duration_minutes == 6 * 60
    # Overall span is kept for screens that show "from – to".
    assert s.image_start_at == _t(8) and s.image_end_at == _t(18)


def test_blocks_are_sorted_and_breaks_not_paid():
    s = _session()
    set_work_blocks(s, [(_t(13), _t(14)), (_t(10), _t(11))])
    assert [b["start"] for b in s.work_blocks] == [_t(10).isoformat(), _t(13).isoformat()]
    assert work_minutes(s) == 120  # not 10:00–14:00 = 240


def test_single_pair_still_works_without_blocks():
    s = _session(image_start_at=_t(9), image_end_at=_t(12, 30))
    assert session_blocks(s) == [(_t(9), _t(12, 30))]
    assert work_minutes(s) == 210


@pytest.mark.parametrize(
    "blocks, message",
    [
        ([], "at least one"),
        ([(_t(10), _t(9))], "after its start"),
        ([(_t(10), _t(12)), (_t(11), _t(13))], "overlap"),
        ([(_t(h), _t(h, 30)) for h in range(MAX_WORK_BLOCKS + 1)], "at most"),
    ],
)
def test_invalid_blocks_are_rejected(blocks, message):
    with pytest.raises(ValueError) as exc:
        set_work_blocks(_session(), blocks)
    assert message in str(exc.value)


def test_ten_blocks_allowed():
    s = _session()
    set_work_blocks(s, [(_t(h), _t(h, 30)) for h in range(MAX_WORK_BLOCKS)])
    assert work_minutes(s) == MAX_WORK_BLOCKS * 30
