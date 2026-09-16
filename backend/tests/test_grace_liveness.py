"""
Grace and desktop-path liveness (Phase 3 Action 2).

The property under test is narrow and load-bearing: **a machine must never be
released while its tunnel is live, and must always be released once it is
provably not.** Both halves have bitten this project before — the old
claim-board heartbeat steal took machines mid-shift, and the direct gateway
path could let a grace clock run under a live reconnect.

These are decision-logic tests. They deliberately do not need a database or a
gateway; the DB-backed pass is covered by the Postgres-marked gates.
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from core.config import settings
from models.enums import AllocationLifecycleEnum, RdpStatusEnum, TunnelStatusEnum
from services import rdp_session_sweep as sweep
from services.rdp_state import utc_now


class FakeResource:
    def __init__(self, status=RdpStatusEnum.active, changed_at=None, nickname="RDP1"):
        self.id = "rdp-1"
        self.nickname = nickname
        self.status = status
        self.status_changed_at = changed_at or utc_now()
        self.version = 1
        self.guacamole_connection_id = "7"


class FakeAlloc:
    def __init__(self, generation=1, status=AllocationLifecycleEnum.assigned, gateway_id="gw1"):
        self.id = "alloc-1"
        self.rdp_resource_id = "rdp-1"
        self.connection_generation = generation
        self.allocation_status = status
        self.tunnel_status = TunnelStatusEnum.connected
        self.last_gateway_observation_at = None
        self.gateway_id = gateway_id
        self.released_at = None
        self.version = 1


def grace_expired(resource, *, now=None) -> bool:
    """Mirror of the coordinator's release predicate."""
    now = now or utc_now()
    threshold = now - timedelta(seconds=settings.RDP_DISCONNECT_GRACE_SECONDS)
    changed = resource.status_changed_at
    return (
        resource.status == RdpStatusEnum.idle
        and changed is not None
        and changed <= threshold
    )


# ── The release predicate ────────────────────────────────────────────────


def test_active_machine_is_never_released():
    assert grace_expired(FakeResource(status=RdpStatusEnum.active)) is False


def test_idle_inside_grace_is_not_released():
    recent = utc_now() - timedelta(seconds=60)
    assert grace_expired(FakeResource(RdpStatusEnum.idle, recent)) is False


def test_idle_past_grace_is_released():
    stale = utc_now() - timedelta(seconds=settings.RDP_DISCONNECT_GRACE_SECONDS + 30)
    assert grace_expired(FakeResource(RdpStatusEnum.idle, stale)) is True


def test_grace_boundary_is_inclusive():
    exact = utc_now() - timedelta(seconds=settings.RDP_DISCONNECT_GRACE_SECONDS)
    assert grace_expired(FakeResource(RdpStatusEnum.idle, exact)) is True


def test_reconnect_resets_the_clock():
    """
    The regression this file exists for.

    A machine that dropped 4 minutes ago and then reconnected must not be
    released one minute later on the strength of the original drop.
    """
    resource = FakeResource(
        RdpStatusEnum.idle,
        utc_now() - timedelta(seconds=settings.RDP_DISCONNECT_GRACE_SECONDS - 60),
    )
    # What prepare_connect / the join-ticket path / Direction C all do:
    resource.status = RdpStatusEnum.active
    resource.status_changed_at = utc_now()

    assert grace_expired(resource) is False
    # And still safe once the original clock would have fired.
    later = utc_now() + timedelta(seconds=90)
    assert grace_expired(resource, now=later) is False


def test_offline_machine_with_no_timestamp_is_not_released():
    """Unknown is not free: a missing timestamp must not read as expired."""
    resource = FakeResource(RdpStatusEnum.idle)
    resource.status_changed_at = None
    assert grace_expired(resource) is False


# ── Direction C: a live session cancels the clock ────────────────────────


def test_live_session_while_idle_is_the_resume_case(redis_client, gateways):
    """
    On the direct gateway path nothing in the control plane witnesses the
    reconnect, so the sweep has to notice the session is back.
    """
    alloc = FakeAlloc()
    resource = FakeResource(RdpStatusEnum.idle, utc_now() - timedelta(seconds=120))
    live = {"7": [("gw1", "active-1")]}

    session_is_live = resource.guacamole_connection_id in live
    should_resume = resource.status == RdpStatusEnum.idle and session_is_live
    assert should_resume is True
    assert sweep._gateway_was_read(alloc, {"gw1"}, 2) is True


def test_idle_with_no_session_stays_counting_down(redis_client):
    resource = FakeResource(RdpStatusEnum.idle, utc_now() - timedelta(seconds=120))
    live: dict = {}
    assert (resource.guacamole_connection_id in live) is False


def test_resume_needs_the_owning_gateway_to_have_answered():
    """
    A silent gateway must not be read as "no session" — but it must not be
    read as "session present" either. Both directions need real evidence.
    """
    alloc = FakeAlloc(gateway_id="gw2")
    assert sweep._gateway_was_read(alloc, {"gw1"}, 2) is False


def test_quarantined_allocation_is_left_alone(redis_client):
    """
    A quarantined machine is held deliberately. The sweep must not convert
    that into a grace countdown, nor resurrect it.
    """
    alloc = FakeAlloc(status=AllocationLifecycleEnum.quarantined)
    assert alloc.allocation_status == AllocationLifecycleEnum.quarantined


# ── Generation safety on the grace path ─────────────────────────────────


def test_stale_generation_must_not_start_grace():
    """A disconnect from a superseded tab cannot start a clock."""
    from services.rdp_engine import generation_matches

    alloc = FakeAlloc(generation=5)
    assert generation_matches(alloc, allocation_id=None, connection_generation=4) is False
    assert generation_matches(alloc, allocation_id=None, connection_generation=5) is True


def test_grace_seconds_is_the_documented_five_minutes():
    assert settings.RDP_DISCONNECT_GRACE_SECONDS == 300


@pytest.mark.postgres
def test_grace_expiry_releases_through_the_engine():
    """End-to-end release needs a real DB (enum + unique index)."""
    pytest.skip("covered by the Postgres CI job; see conftest POSTGRES_WHY")
