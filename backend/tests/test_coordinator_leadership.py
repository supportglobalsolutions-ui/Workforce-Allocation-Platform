"""
Exactly one coordinator does the work, and a restart hands over cleanly
(Phase 4 Action 2, Phase 7 Action 2).
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from services import rdp_coordinator as coord


def test_leader_is_granted_once(redis_client):
    assert coord.try_become_leader(redis_client) is True


def test_leader_renews_its_own_lease(redis_client):
    assert coord.try_become_leader(redis_client) is True
    assert coord.try_become_leader(redis_client) is True


def test_a_second_instance_stands_down(redis_client, monkeypatch):
    monkeypatch.setattr(coord, "_instance_id", lambda: "hostA:1")
    assert coord.try_become_leader(redis_client) is True
    monkeypatch.setattr(coord, "_instance_id", lambda: "hostB:2")
    assert coord.try_become_leader(redis_client) is False


def test_only_one_winner_under_contention(redis_client, monkeypatch):
    """
    Several coordinators starting at once — a rolling deploy.

    Two leaders would run grace expiry twice over the same allocations, which
    is exactly the duplicated-lifecycle problem the coordinator exists to stop.
    """
    counter = {"n": 0}

    def unique_id():
        counter["n"] += 1
        return f"host{counter['n']}:{counter['n']}"

    monkeypatch.setattr(coord, "_instance_id", unique_id)
    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _: coord.try_become_leader(redis_client), range(10)))
    assert sum(1 for won in results if won) == 1


def test_holder_releases_its_lease(redis_client):
    assert coord.try_become_leader(redis_client) is True
    assert coord.release_leadership(redis_client) is True
    assert redis_client.get(coord._LEADER_KEY) is None


def test_non_holder_cannot_steal_the_lease(redis_client, monkeypatch):
    """A restarting instance must never evict the live leader."""
    monkeypatch.setattr(coord, "_instance_id", lambda: "hostA:1")
    coord.try_become_leader(redis_client)
    monkeypatch.setattr(coord, "_instance_id", lambda: "hostB:2")
    assert coord.release_leadership(redis_client) is False
    assert redis_client.get(coord._LEADER_KEY).decode() == "hostA:1"


def test_release_without_a_lease_is_harmless(redis_client):
    assert coord.release_leadership(redis_client) is False


def test_release_survives_a_dead_redis():
    class BrokenRedis:
        def get(self, *a, **k):
            raise ConnectionError("down")

    assert coord.release_leadership(BrokenRedis()) is False
