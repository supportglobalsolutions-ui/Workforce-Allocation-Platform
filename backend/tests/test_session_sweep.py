"""
The sweep's safety rules (Phase 8 Action 1).

The sweep is the only thing that can start a release clock on a session nobody
is watching, so every rule that stops it doing that wrongly is tested here.
Database-backed pass behaviour is covered by the Postgres-marked tests; these
cover the decision logic, which is where the damage would be done.
"""
from __future__ import annotations

import pytest

from core.config import settings
from services import rdp_session_sweep as sweep


class Alloc:
    def __init__(self, gateway_id=None):
        self.gateway_id = gateway_id


# ── Miss counting: one flaky call is not evidence ────────────────────────


def test_first_miss_does_not_reach_the_threshold(redis_client, monkeypatch):
    monkeypatch.setattr(settings, "RDP_SWEEP_CONFIRMATIONS", 2, raising=False)
    assert sweep._record_miss(redis_client, "rdp-1") == 1


def test_misses_accumulate_until_confirmed(redis_client):
    assert sweep._record_miss(redis_client, "rdp-1") == 1
    assert sweep._record_miss(redis_client, "rdp-1") == 2
    assert sweep._record_miss(redis_client, "rdp-1") == 3


def test_seeing_a_session_clears_the_streak(redis_client):
    sweep._record_miss(redis_client, "rdp-1")
    sweep._record_miss(redis_client, "rdp-1")
    sweep.clear_miss(redis_client, "rdp-1")
    assert sweep._record_miss(redis_client, "rdp-1") == 1


def test_misses_are_tracked_per_machine(redis_client):
    sweep._record_miss(redis_client, "rdp-1")
    sweep._record_miss(redis_client, "rdp-1")
    assert sweep._record_miss(redis_client, "rdp-2") == 1


def test_unrecordable_miss_never_counts():
    """If Redis cannot answer we must not act on an unverifiable observation."""
    class BrokenRedis:
        def incr(self, *a, **k):
            raise ConnectionError("down")

    assert sweep._record_miss(BrokenRedis(), "rdp-1") == 0


# ── Rule 3: an unreachable gateway is unknown, not empty ─────────────────


def test_silent_gateway_means_do_not_judge():
    """The node that would hold this session never answered — say nothing."""
    alloc = Alloc(gateway_id="gw2")
    assert sweep._gateway_was_read(alloc, reachable={"gw1"}, gateway_count=2) is False


def test_the_owning_gateway_answering_is_enough():
    alloc = Alloc(gateway_id="gw2")
    assert sweep._gateway_was_read(alloc, reachable={"gw2"}, gateway_count=2) is True


def test_no_sticky_placement_requires_a_full_picture():
    """
    Pre-Phase-7 rows carry no gateway_id, so the session could be anywhere.
    Only a complete answer from every node is safe to act on.
    """
    alloc = Alloc(gateway_id=None)
    assert sweep._gateway_was_read(alloc, reachable={"gw1"}, gateway_count=2) is False
    assert sweep._gateway_was_read(alloc, reachable={"gw1", "gw2"}, gateway_count=2) is True


def test_no_gateway_answered_at_all():
    assert sweep._gateway_was_read(Alloc("gw1"), reachable=set(), gateway_count=2) is False


# ── Reporting ────────────────────────────────────────────────────────────


def test_quiet_sweep_is_not_interesting():
    assert sweep.SweepStats().interesting is False


@pytest.mark.parametrize(
    "stats",
    [
        sweep.SweepStats(marked_idle=1),
        sweep.SweepStats(orphans_found=1),
        sweep.SweepStats(orphans_killed=1),
        sweep.SweepStats(errors=["gw1: ConnectionError"]),
    ],
)
def test_anything_worth_knowing_is_logged(stats):
    assert stats.interesting is True


def test_stats_round_trip_to_a_dict():
    stats = sweep.SweepStats(gateways_seen=2, marked_idle=1, live_sessions=5)
    payload = stats.as_dict()
    assert payload["gateways_seen"] == 2
    assert payload["marked_idle"] == 1
    assert payload["live_sessions"] == 5


def test_error_list_is_capped_for_logging():
    stats = sweep.SweepStats(errors=[f"gw{i}: boom" for i in range(20)])
    assert len(stats.as_dict()["errors"]) == 5
