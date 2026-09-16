"""
The final guard before a release (Phase 3 Action 2).

`still_releasable` is the last thing standing between a reconnecting worker and
having their live tunnel killed. The coordinator builds a list of expired-grace
candidates, then releases them one by one; a reconnect landing in that gap
flips the machine back to `active` **without** bumping
`connection_generation`, so the staleness check inside `disconnect()` cannot
see it. This guard is the one that can.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models.enums import RdpStatusEnum
from services.rdp_coordinator import still_releasable


def now() -> datetime:
    return datetime.now(timezone.utc)


class FakeResource:
    def __init__(self, status, changed_at):
        self.nickname = "RDP1"
        self.status = status
        self.status_changed_at = changed_at


class FakeDb:
    """Re-read is a no-op unless a test says otherwise."""

    def __init__(self, on_refresh=None, fail=False):
        self.on_refresh = on_refresh
        self.fail = fail
        self.refreshed = False

    def refresh(self, obj):
        self.refreshed = True
        if self.fail:
            raise ConnectionError("db gone")
        if self.on_refresh:
            self.on_refresh(obj)


THRESHOLD = now() - timedelta(seconds=300)


def test_expired_idle_machine_is_releasable():
    resource = FakeResource(RdpStatusEnum.idle, now() - timedelta(seconds=600))
    assert still_releasable(FakeDb(), resource, THRESHOLD) is True


def test_reconnect_during_the_tick_blocks_the_release():
    """The bug this guard exists for."""
    resource = FakeResource(RdpStatusEnum.idle, now() - timedelta(seconds=600))

    def reconnected(obj):
        obj.status = RdpStatusEnum.active
        obj.status_changed_at = now()

    assert still_releasable(FakeDb(on_refresh=reconnected), resource, THRESHOLD) is False


def test_clock_restarted_during_the_tick_blocks_the_release():
    """Still idle, but the countdown restarted — not this machine's turn."""
    resource = FakeResource(RdpStatusEnum.idle, now() - timedelta(seconds=600))

    def clock_reset(obj):
        obj.status_changed_at = now()

    assert still_releasable(FakeDb(on_refresh=clock_reset), resource, THRESHOLD) is False


def test_it_actually_re_reads():
    """A guard that trusts the snapshot is no guard at all."""
    db = FakeDb()
    still_releasable(db, FakeResource(RdpStatusEnum.idle, now() - timedelta(seconds=600)), THRESHOLD)
    assert db.refreshed is True


def test_unreadable_row_is_not_released():
    """Unknown is not free (Principle 4)."""
    resource = FakeResource(RdpStatusEnum.idle, now() - timedelta(seconds=600))
    assert still_releasable(FakeDb(fail=True), resource, THRESHOLD) is False


def test_missing_timestamp_is_not_released():
    assert still_releasable(FakeDb(), FakeResource(RdpStatusEnum.idle, None), THRESHOLD) is False


def test_naive_timestamp_is_compared_correctly():
    """Postgres can hand back naive datetimes; they must not crash or invert."""
    naive_old = (now() - timedelta(seconds=600)).replace(tzinfo=None)
    assert still_releasable(FakeDb(), FakeResource(RdpStatusEnum.idle, naive_old), THRESHOLD) is True

    naive_new = now().replace(tzinfo=None)
    assert still_releasable(FakeDb(), FakeResource(RdpStatusEnum.idle, naive_new), THRESHOLD) is False


def test_non_idle_states_are_never_released_by_grace():
    for status in (
        RdpStatusEnum.active,
        RdpStatusEnum.online_free,
        RdpStatusEnum.maintenance,
        RdpStatusEnum.admin_locked,
    ):
        resource = FakeResource(status, now() - timedelta(seconds=600))
        assert still_releasable(FakeDb(), resource, THRESHOLD) is False, status


def test_guard_is_wired_into_the_tick():
    """Fail loudly if a refactor drops the call."""
    import inspect

    from services import rdp_coordinator

    source = inspect.getsource(rdp_coordinator.run_coordinator_tick)
    assert "still_releasable" in source
    assert "skipped_reconnected" in source


def test_sweep_runs_before_grace_expiry():
    """
    Ordering matters: Direction C must resurrect live sessions before anything
    in the same tick is considered for release.
    """
    import inspect

    from services import rdp_coordinator

    source = inspect.getsource(rdp_coordinator.run_coordinator_tick)
    assert source.index("run_session_sweep") < source.index("idle_resources")
