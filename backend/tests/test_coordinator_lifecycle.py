"""
The coordinator as a *process* (Phase 4 Action 2).

Leader election is tested elsewhere. This covers the two things that only
matter once it runs under systemd: shutting down cleanly enough to hand the
lease over, and being observable enough that enabling it can be verified.
"""
from __future__ import annotations

import asyncio
import inspect
import json
import time

import pytest

from core.config import settings
from services import rdp_coordinator as coord


# ── Clean shutdown: the reason release_leadership exists at all ──────────


def test_stop_signals_are_handled():
    """
    `systemctl stop` sends SIGTERM, and Python's default disposition exits the
    process without running `finally`. Without a handler the loop's
    `release_leadership()` never runs and a deploy leaves the lease to expire.
    """
    source = inspect.getsource(coord._run_until_signalled)
    assert "SIGTERM" in source
    assert "SIGINT" in source
    assert "add_signal_handler" in source


def test_shutdown_cancels_the_loop_rather_than_killing_it():
    """Cancellation is what lets the loop's finally drop the lease."""
    source = inspect.getsource(coord._run_until_signalled)
    assert "task.cancel()" in source
    assert "return_exceptions=True" in source, "must await the cancelled task"


def test_entrypoint_runs_the_signal_aware_wrapper():
    source = inspect.getsource(coord.main)
    assert "_run_until_signalled" in source, (
        "main() must not call run_rdp_coordinator_loop directly — that path "
        "cannot release the lease on SIGTERM"
    )


def test_loop_releases_the_lease_in_a_finally():
    source = inspect.getsource(coord.run_rdp_coordinator_loop)
    assert "finally:" in source
    assert "release_leadership" in source


@pytest.mark.parametrize("has_windows_fallback", [True])
def test_windows_has_a_signal_fallback(has_windows_fallback):
    """
    `add_signal_handler` raises NotImplementedError on Windows, where most of
    this is developed. Without the fallback, importing/running the coordinator
    locally would crash on startup.
    """
    source = inspect.getsource(coord._run_until_signalled)
    assert "NotImplementedError" in source
    assert "call_soon_threadsafe" in source, (
        "the C-level handler must hop back to the loop thread"
    )


def test_cancelling_the_loop_releases_the_lease(redis_client, monkeypatch):
    """Exercise the real path: cancel the task, assert the lease is gone."""
    monkeypatch.setattr(coord, "get_redis", lambda: redis_client)
    monkeypatch.setattr(coord, "run_coordinator_tick", lambda: {"skipped": 1})

    async def scenario():
        task = asyncio.create_task(coord.run_rdp_coordinator_loop())
        await asyncio.sleep(0.05)
        coord.try_become_leader(redis_client)
        assert redis_client.get(coord._LEADER_KEY) is not None
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    asyncio.run(scenario())
    assert redis_client.get(coord._LEADER_KEY) is None, (
        "a cancelled loop must drop its lease so a standby takes over at once"
    )


# ── Observability: makes the VPS enablement verifiable ──────────────────


def test_no_heartbeat_reports_not_alive(redis_client):
    status = coord.coordinator_status(redis_client)
    assert status["alive"] is False
    assert "workforce-rdp-coordinator" in status["reason"]


def test_heartbeat_reports_alive_and_fresh(redis_client):
    coord.record_heartbeat(redis_client, status="ok")
    status = coord.coordinator_status(redis_client)
    assert status["alive"] is True
    assert status["status"] == "ok"
    assert status["last_tick_seconds_ago"] <= 2
    assert status["overdue"] is False


def test_leader_is_identified(redis_client):
    coord.try_become_leader(redis_client)
    coord.record_heartbeat(redis_client, status="ok")
    status = coord.coordinator_status(redis_client)
    assert status["is_leader"] is True
    assert status["leader"] == coord._instance_id()


def test_a_stale_heartbeat_is_flagged_overdue(redis_client, monkeypatch):
    monkeypatch.setattr(settings, "RDP_LIFECYCLE_INTERVAL_SECONDS", 60, raising=False)
    redis_client.setex(
        coord._HEARTBEAT_KEY,
        3600,
        json.dumps(
            {
                "instance": "old:1",
                "at": int(time.time()) - 600,
                "status": "ok",
                "interval_seconds": 60,
                "in_api": False,
            }
        ),
    )
    status = coord.coordinator_status(redis_client)
    assert status["alive"] is True
    assert status["overdue"] is True, "10 minutes with a 60s interval is overdue"


def test_degraded_ticks_still_heartbeat(redis_client):
    """
    "Alive but blocked" must be distinguishable from "dead". During an outage
    the coordinator deliberately does nothing — that is not the same as being
    gone, and an operator needs to tell them apart.
    """
    coord.record_heartbeat(redis_client, status="degraded", detail="datastore degraded")
    status = coord.coordinator_status(redis_client)
    assert status["alive"] is True
    assert status["status"] == "degraded"
    assert status["detail"] == "datastore degraded"


def test_running_inside_api_is_reported(redis_client, monkeypatch):
    """Production wants the standalone unit; this surfaces the misconfiguration."""
    monkeypatch.setattr(settings, "RDP_RUN_COORDINATOR_IN_API", True, raising=False)
    coord.record_heartbeat(redis_client, status="ok")
    assert coord.coordinator_status(redis_client)["running_inside_api"] is True

    redis_client.delete(coord._HEARTBEAT_KEY)
    monkeypatch.setattr(settings, "RDP_RUN_COORDINATOR_IN_API", False, raising=False)
    coord.record_heartbeat(redis_client, status="ok")
    assert coord.coordinator_status(redis_client)["running_inside_api"] is False


def test_unreadable_redis_is_unknown_not_dead():
    """We cannot see it, which is not the same as it not being there."""
    class BrokenRedis:
        def get(self, *a, **k):
            raise ConnectionError("down")

    status = coord.coordinator_status(BrokenRedis())
    assert status["alive"] is None
    assert "Redis" in status["reason"]


def test_heartbeat_failure_never_breaks_the_tick():
    """Losing observability must not lose the work it describes."""
    class BrokenRedis:
        def setex(self, *a, **k):
            raise ConnectionError("down")

    coord.record_heartbeat(BrokenRedis(), status="ok")  # must not raise


def test_tick_records_a_heartbeat_on_success():
    source = inspect.getsource(coord.run_coordinator_tick)
    assert "record_heartbeat" in source


def test_status_endpoint_is_admin_only():
    from conftest import find_endpoint

    source = inspect.getsource(find_endpoint("rdp_coordinator_status"))
    assert "require_admin" in source
    assert "coordinator_status" in source
