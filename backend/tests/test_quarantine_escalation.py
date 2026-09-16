"""
"Unknown" must terminate in a defined state (Phase 3 Action 3 / Phase 8 A2).

An allocation whose closure cannot be confirmed stays in `ending`. Quarantine is
its exit: the machine is held out of service — not released, so nobody inherits
a possibly-live tunnel — and an admin can repair it.

The timing is the part worth testing. `RDP_ENDING_ESCALATE_SECONDS` exists so a
transient gateway failure can resolve on a later tick instead of costing a
machine and an admin's attention. An escalation clock measured from the wrong
field skips that window entirely.
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from core.config import settings
from models.enums import AllocationLifecycleEnum
from services.rdp_quarantine import (
    ENDING_ESCALATE,
    ENDING_NEEDS_STAMP,
    ENDING_WAIT,
    classify_ending,
)
from services.rdp_state import utc_now


class FakeAlloc:
    def __init__(self, entered_ending=None, status=AllocationLifecycleEnum.ending):
        self.id = "alloc-1"
        self.allocation_status = status
        self.last_gateway_observation_at = entered_ending
        self.version = 1


def deadline_now():
    return utc_now() - timedelta(seconds=settings.RDP_ENDING_ESCALATE_SECONDS)


def test_just_started_closing_waits():
    """The regression: this must not quarantine on the first tick."""
    alloc = FakeAlloc(entered_ending=utc_now())
    assert classify_ending(alloc, deadline_now()) == ENDING_WAIT


def test_inside_the_window_waits():
    half = utc_now() - timedelta(seconds=settings.RDP_ENDING_ESCALATE_SECONDS // 2)
    assert classify_ending(FakeAlloc(half), deadline_now()) == ENDING_WAIT


def test_past_the_window_escalates():
    stale = utc_now() - timedelta(seconds=settings.RDP_ENDING_ESCALATE_SECONDS + 30)
    assert classify_ending(FakeAlloc(stale), deadline_now()) == ENDING_ESCALATE


def test_boundary_escalates():
    exact = utc_now() - timedelta(seconds=settings.RDP_ENDING_ESCALATE_SECONDS)
    assert classify_ending(FakeAlloc(exact), deadline_now()) == ENDING_ESCALATE


def test_no_clock_yet_is_stamped_not_quarantined():
    """
    A row from before the stamp existed carries no evidence. Taking a machine
    out of service on no evidence is the wrong default.
    """
    assert classify_ending(FakeAlloc(None), deadline_now()) == ENDING_NEEDS_STAMP


def test_naive_timestamp_is_handled():
    """Postgres can return naive datetimes; comparison must not invert."""
    stale = (utc_now() - timedelta(seconds=settings.RDP_ENDING_ESCALATE_SECONDS + 30)).replace(
        tzinfo=None
    )
    assert classify_ending(FakeAlloc(stale), deadline_now()) == ENDING_ESCALATE

    fresh = utc_now().replace(tzinfo=None)
    assert classify_ending(FakeAlloc(fresh), deadline_now()) == ENDING_WAIT


def test_escalate_window_is_the_documented_ninety_seconds():
    assert settings.RDP_ENDING_ESCALATE_SECONDS == 90


def test_entering_ending_stamps_the_clock_once():
    """
    The disconnect path must stamp on the *transition* only. If every retry
    re-stamped, a worker repeatedly pressing Disconnect would hold a genuinely
    stuck closure out of quarantine forever.
    """
    import inspect

    from services import rdp_engine

    source = inspect.getsource(rdp_engine.disconnect)
    assert "alloc.allocation_status != AllocationLifecycleEnum.ending" in source, (
        "the ending stamp must be guarded by a transition check"
    )
    stamp = source.index("last_gateway_observation_at = utc_now()")
    guard = source.index("alloc.allocation_status != AllocationLifecycleEnum.ending")
    assert guard < stamp, "the guard must come before the stamp"


def test_quarantine_is_not_a_release():
    """
    The whole point. A quarantined allocation keeps `released_at IS NULL`, so
    the machine is never handed to the next worker.
    """
    import inspect

    from services import rdp_quarantine

    source = inspect.getsource(rdp_quarantine.quarantine_allocation)
    assert "released_at" not in source, "quarantine must never release the allocation"
    assert "RdpStatusEnum.maintenance" in source, "the machine must be held out of service"
    assert "quarantined_at" in source and "quarantine_reason" in source


def test_repair_failure_requarantines_rather_than_freeing():
    import inspect

    from services import rdp_quarantine

    source = inspect.getsource(rdp_quarantine.repair_quarantined)
    assert "quarantine_allocation" in source, (
        "a failed repair must put the machine back into quarantine, not free it"
    )


@pytest.mark.postgres
def test_escalation_writes_through_to_the_database():
    pytest.skip("covered by the Postgres CI job; see conftest POSTGRES_WHY")
