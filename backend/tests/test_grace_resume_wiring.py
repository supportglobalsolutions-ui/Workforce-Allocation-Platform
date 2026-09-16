"""The resume path must be wired, not just written (Phase 3 Action 2)."""
from __future__ import annotations

from services import rdp_session_sweep as sweep


def test_sweep_reports_cancelled_grace():
    """A resume has to be visible in the tick stats, or it is unobservable."""
    payload = sweep.SweepStats().as_dict()
    assert "grace_cancelled" in payload
    assert sweep.SweepStats(grace_cancelled=1).interesting is True


def test_join_ticket_path_cancels_grace_on_reconnect():
    """
    Guard against the fast path being dropped in a refactor.

    Without it, a reconnect on the direct gateway path waits up to a full
    coordinator tick before the release clock is cancelled — and the
    coordinator may fire inside that window.
    """
    import inspect

    from services import rdp_gateway

    source = inspect.getsource(rdp_gateway.issue_join_ticket)
    assert "RdpStatusEnum.idle" in source, "join ticket must notice a machine in grace"
    assert "RdpStatusEnum.active" in source, "join ticket must cancel the grace clock"


def test_gateway_module_imports_cleanly():
    from services import rdp_gateway

    assert callable(rdp_gateway.issue_join_ticket)
    assert callable(rdp_gateway.verify_join_ticket)


def test_sweep_handles_idle_before_the_active_only_guard():
    """
    Direction C must be reached for `idle` machines.

    The original code returned early on `status != active`, which is exactly
    why a live reconnect went unnoticed. Assert the idle branch comes first.
    """
    import inspect

    source = inspect.getsource(sweep.run_session_sweep)
    idle_branch = source.index("RdpStatusEnum.idle and session_is_live")
    active_guard = source.index("resource.status != RdpStatusEnum.active")
    assert idle_branch < active_guard, (
        "the active-only guard must not short-circuit the resume branch"
    )
