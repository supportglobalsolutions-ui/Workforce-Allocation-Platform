"""
Placement, drain, gateway loss and admission control (Phase 7 + Phase 8 A4).

These were throwaway scripts during Phase 7; folding them in means they run on
every change rather than the one afternoon they were written.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from core.config import settings
from services import rdp_gateway_cluster as gc


@pytest.fixture
def counts(monkeypatch):
    """Control the per-gateway seat tallies without touching a database."""
    state: dict[str, int] = {}
    monkeypatch.setattr(gc, "live_count_by_gateway", lambda db: dict(state))
    return state


def test_places_on_the_least_loaded(gateways, redis_client, counts):
    counts.update({"gw1": 1, "gw2": 0})
    assert gc.pick_gateway(None, redis_client).id == "gw2"


def test_reconnect_stays_sticky(gateways, redis_client, counts):
    counts.update({"gw1": 1, "gw2": 0})
    assert gc.pick_gateway(None, redis_client, preferred_id="gw1").id == "gw1"


def test_drain_stops_new_work_and_moves_reconnects(gateways, redis_client, counts):
    counts.update({"gw1": 0, "gw2": 0})
    gc.set_draining(redis_client, "gw1", draining=True)
    assert gc.pick_gateway(None, redis_client).id == "gw2"
    assert gc.pick_gateway(None, redis_client, preferred_id="gw1").id == "gw2"


def test_unhealthy_gateway_is_skipped(gateways, redis_client, counts):
    counts.update({"gw1": 0, "gw2": 0})
    gc.record_gateway_health(redis_client, "gw2", healthy=False)
    assert gc.pick_gateway(None, redis_client).id == "gw1"
    # Even a sticky reconnect must move off a node that is gone.
    assert gc.pick_gateway(None, redis_client, preferred_id="gw2").id == "gw1"


def test_unprobed_gateway_stays_usable(gateways, redis_client, counts):
    """A dead coordinator must not empty the pool (Principle 4)."""
    counts.update({"gw1": 0, "gw2": 0})
    assert gc.is_unhealthy(redis_client, gateways[1]) is False
    assert gc.pick_gateway(None, redis_client) is not None


def test_all_down_refuses_rather_than_guessing(gateways, redis_client, counts):
    counts.update({"gw1": 0, "gw2": 0})
    gc.record_gateway_health(redis_client, "gw1", healthy=False)
    gc.record_gateway_health(redis_client, "gw2", healthy=False)
    assert gc.pick_gateway(None, redis_client) is None


def test_over_capacity_still_places(gateways, redis_client, counts):
    """Full is not the same as gone — reconnects must still land somewhere."""
    counts.update({"gw1": 99, "gw2": 99})
    assert gc.pick_gateway(None, redis_client) is not None


def test_strict_lookup_guards_drain(gateways):
    assert gc.find_gateway("gw1") is not None
    assert gc.find_gateway("typo") is None
    assert gc.find_gateway(None) is None
    # get_gateway keeps its fallback, which clients rely on.
    assert gc.get_gateway("typo") is not None


# ── Admission control (Phase 8 Action 4) ─────────────────────────────────


def test_admission_allows_up_to_the_limit(redis_client, monkeypatch):
    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 3, raising=False)
    verdicts = [gc.admit_connect(redis_client, "gw1")[0] for _ in range(5)]
    assert verdicts[:3] == [True, True, True]
    assert verdicts[3:] == [False, False]


def test_refusal_carries_a_wait_hint(redis_client, monkeypatch):
    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 1, raising=False)
    gc.admit_connect(redis_client, "gw1")
    admitted, retry_after_ms = gc.admit_connect(redis_client, "gw1")
    assert admitted is False
    assert retry_after_ms >= 1000


def test_buckets_are_per_gateway(redis_client, monkeypatch):
    """Saturating one node must not lock workers out of a healthy one."""
    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 1, raising=False)
    gc.admit_connect(redis_client, "gw1")
    assert gc.admit_connect(redis_client, "gw1")[0] is False
    assert gc.admit_connect(redis_client, "gw2")[0] is True


def test_admission_fails_open(monkeypatch):
    """A broken limiter must not become an outage of its own."""
    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 1, raising=False)

    class BrokenRedis:
        def incr(self, *a, **k):
            raise ConnectionError("down")

    assert gc.admit_connect(BrokenRedis(), "gw1")[0] is True


def test_admission_disabled_when_limit_is_zero(redis_client, monkeypatch):
    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 0, raising=False)
    assert all(gc.admit_connect(redis_client, "gw1")[0] for _ in range(50))


def test_admission_is_atomic_under_contention(redis_client, monkeypatch):
    """
    Concurrent connects must not over-admit within one bucket.

    Time is pinned: the limiter uses a whole-second fixed window, so a real
    clock lets a fast run straddle two buckets and legitimately admit 2x the
    limit. Freezing it keeps the test about atomicity rather than timing.
    """
    import time as time_module

    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 5, raising=False)
    monkeypatch.setattr(time_module, "time", lambda: 1_700_000_000.0)

    with ThreadPoolExecutor(max_workers=16) as pool:
        verdicts = list(
            pool.map(lambda _: gc.admit_connect(redis_client, "gw1")[0], range(40))
        )
    assert sum(1 for ok in verdicts if ok) == 5


def test_admission_window_rolls_over(redis_client, monkeypatch):
    """A new second is a new allowance — the limiter is a rate, not a quota."""
    import time as time_module

    monkeypatch.setattr(settings, "RDP_GATEWAY_ADMIT_PER_SECOND", 2, raising=False)

    monkeypatch.setattr(time_module, "time", lambda: 1_700_000_000.0)
    assert [gc.admit_connect(redis_client, "gw1")[0] for _ in range(3)] == [True, True, False]

    monkeypatch.setattr(time_module, "time", lambda: 1_700_000_001.0)
    assert gc.admit_connect(redis_client, "gw1")[0] is True
