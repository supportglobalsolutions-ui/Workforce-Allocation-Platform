"""The hold has to be visible and repairable, or it is just a stuck machine."""
from __future__ import annotations


def test_quarantine_module_exposes_the_hold_api():
    from services import rdp_quarantine as q

    for fn in (
        "hold_machine_unconfirmed",
        "list_held_machines",
        "repair_quarantined",
        "classify_ending",
        "quarantine_allocation",
        "escalate_stuck_endings",
    ):
        assert callable(getattr(q, fn, None)), fn


def test_admin_can_see_both_kinds_of_out_of_service():
    """
    `quarantined` (allocation stuck mid-close) and `held` (worker left, closure
    unproven) are different states and both need an admin's attention.
    """
    import inspect

    from conftest import find_endpoint

    source = inspect.getsource(find_endpoint("list_quarantined_allocations"))
    assert "list_quarantined" in source
    assert "list_held_machines" in source
    assert '"held"' in source


def test_repair_route_exists_and_is_admin_only():
    import inspect

    from conftest import find_endpoint

    source = inspect.getsource(find_endpoint("repair_rdp_resource"))
    assert "require_admin" in source
    assert "repair_quarantined" in source


def test_held_machines_are_reported_with_a_reason():
    import inspect

    from services import rdp_quarantine

    source = inspect.getsource(rdp_quarantine.list_held_machines)
    assert "reason" in source
    assert "RdpStatusEnum.maintenance" in source, (
        "only machines actually out of service should be listed as held"
    )
