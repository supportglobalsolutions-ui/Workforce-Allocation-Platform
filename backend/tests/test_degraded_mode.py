"""
Degraded mode must freeze releases, never fabricate them (Phase 8 Action 3).

The invariant under test is Principle 4: when we cannot prove who owns what,
we hold. Every assertion here is really the same question asked differently —
"can this state of the world cause a machine to be taken from someone?"
"""
from __future__ import annotations

import pytest

from core.config import settings
from services import rdp_degraded as deg


class BrokenRedis:
    """Every command fails, the way a client does when the server is gone."""

    def __getattr__(self, name):
        def explode(*args, **kwargs):
            raise ConnectionError("redis is down")
        return explode


class BrokenDb:
    def exec(self, *args, **kwargs):
        raise ConnectionError("postgres is down")


class OkDb:
    def exec(self, *args, **kwargs):
        return None


def test_healthy_stores_allow_releases(redis_client):
    health = deg.datastore_health(redis_client, OkDb())
    assert health.ok
    allowed, _ = deg.releases_allowed(redis_client, health)
    assert allowed is True


@pytest.mark.parametrize(
    "redis_obj, db_obj",
    [
        (BrokenRedis(), OkDb()),
        (None, OkDb()),
    ],
)
def test_redis_loss_blocks_releases(redis_obj, db_obj):
    health = deg.datastore_health(redis_obj, db_obj)
    assert not health.ok
    allowed, reason = deg.releases_allowed(redis_obj, health)
    assert allowed is False
    assert "degraded" in reason


def test_postgres_loss_blocks_releases(redis_client):
    health = deg.datastore_health(redis_client, BrokenDb())
    assert not health.ok
    assert health.redis_ok is True
    allowed, _ = deg.releases_allowed(redis_client, health)
    assert allowed is False


def test_recovery_window_suppresses_the_mass_release(redis_client, monkeypatch):
    """
    The edge that matters most.

    After a long outage every idle machine is already past its grace window, so
    the first healthy tick would release the entire fleet at once — with every
    one of those workers still sitting at a desktop.
    """
    monkeypatch.setattr(settings, "RDP_DEGRADED_RECOVERY_SECONDS", 300, raising=False)

    outage = deg.datastore_health(redis_client, BrokenDb())
    deg.note_health(redis_client, outage)

    recovered = deg.datastore_health(redis_client, OkDb())
    assert recovered.ok
    deg.note_health(redis_client, recovered)

    assert deg.in_recovery_window(redis_client) is True
    allowed, reason = deg.releases_allowed(redis_client, recovered)
    assert allowed is False
    assert "recovery" in reason


def test_no_recovery_window_when_nothing_was_wrong(redis_client):
    healthy = deg.datastore_health(redis_client, OkDb())
    deg.note_health(redis_client, healthy)
    assert deg.in_recovery_window(redis_client) is False
    assert deg.releases_allowed(redis_client, healthy)[0] is True


def test_unreadable_redis_counts_as_still_recovering():
    """When we cannot tell, hold the machine rather than free it."""
    assert deg.in_recovery_window(BrokenRedis()) is True


def test_status_payload_explains_itself(redis_client):
    status = deg.degraded_status(redis_client, BrokenDb())
    assert status["postgres"] == "unreachable"
    assert status["degraded"] is True
    assert status["releases_allowed"] is False
    assert status["releases_blocked_because"]
