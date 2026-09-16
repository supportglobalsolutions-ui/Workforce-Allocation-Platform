"""
Seat accounting for the live-session cap (Phase 3 Action 5).

The cap protects a box that cannot run more desktops than its RAM allows, so
the count behind it has to reflect what is actually running — not what our
records find convenient. Two cases are easy to get wrong:

  * a desktop inside its 5-minute grace still holds its seat (§1.6);
  * a machine *held* after an unconfirmed close has an ended allocation but may
    still have a live tunnel burning the same RAM.

Undercounting either one admits a worker onto a full box.
"""
from __future__ import annotations

import uuid

import pytest

from core.config import settings
from models.enums import RdpStatusEnum
from services import rdp_capacity


class FakeResource:
    def __init__(self, status):
        self.status = status


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeDb:
    """
    Answers the two shapes of query `rdp_capacity` issues, keyed on whether the
    statement filters on `quarantined_at` or `released_at`.
    """

    def __init__(self, *, open_ids=(), stamped_ids=(), resources=None):
        self.open_ids = list(open_ids)
        self.stamped_ids = list(stamped_ids)
        self.resources = resources or {}

    def exec(self, statement):
        text = str(statement)
        if "quarantined_at" in text:
            return FakeResult(list(self.stamped_ids))
        return FakeResult(list(self.open_ids))

    def get(self, _model, rdp_id):
        return self.resources.get(rdp_id)


A, B, C = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()


def active(*ids):
    return {i: FakeResource(RdpStatusEnum.active) for i in ids}


def held(*ids):
    return {i: FakeResource(RdpStatusEnum.maintenance) for i in ids}


# ── Open allocations ─────────────────────────────────────────────────────


def test_no_sessions_means_no_seats_used():
    db = FakeDb(resources={})
    assert rdp_capacity.occupied_seats(db) == 0


def test_open_allocations_occupy_seats():
    db = FakeDb(open_ids=[A, B], resources=active(A, B))
    assert rdp_capacity.occupied_seats(db) == 2


def test_grace_still_holds_its_seat():
    """
    A disconnect does not immediately give a seat back — the chair is being
    kept for the worker who is reconnecting (§1.6).
    """
    db = FakeDb(open_ids=[A], resources={A: FakeResource(RdpStatusEnum.idle)})
    assert rdp_capacity.occupied_seats(db) == 1


# ── Held machines: the gap this module was written to close ──────────────


def test_held_machine_still_occupies_a_seat():
    """
    Its allocation ended, but it is held precisely because a tunnel may still
    be live. Counting it as free is how a capped box overcommits.
    """
    db = FakeDb(open_ids=[], stamped_ids=[A], resources=held(A))
    assert rdp_capacity.held_machine_ids(db) == {A}
    assert rdp_capacity.occupied_seats(db) == 1


def test_hold_cleared_frees_the_seat():
    """Once repaired the machine is online_free again — seat returns."""
    db = FakeDb(open_ids=[], stamped_ids=[A], resources={A: FakeResource(RdpStatusEnum.online_free)})
    assert rdp_capacity.held_machine_ids(db) == set()
    assert rdp_capacity.occupied_seats(db) == 0


def test_manual_maintenance_is_not_counted_as_held():
    """
    A machine an admin took offline by hand carries no quarantine stamp. It is
    deliberately out of service, not secretly occupied, so it must not inflate
    the seat count.
    """
    db = FakeDb(open_ids=[], stamped_ids=[], resources=held(A))
    assert rdp_capacity.held_machine_ids(db) == set()
    assert rdp_capacity.occupied_seats(db) == 0


def test_held_machine_with_an_open_allocation_is_not_double_counted():
    db = FakeDb(open_ids=[A], stamped_ids=[A], resources=held(A))
    assert rdp_capacity.occupied_seats(db) == 1


def test_open_and_held_add_up():
    db = FakeDb(
        open_ids=[A, B],
        stamped_ids=[C],
        resources={**active(A, B), **held(C)},
    )
    assert rdp_capacity.occupied_seats(db) == 3


# ── The cap decision ────────────────────────────────────────────────────


def test_under_cap_admits(monkeypatch):
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 3, raising=False)
    db = FakeDb(open_ids=[A, B], resources=active(A, B))
    assert rdp_capacity.at_capacity(db) is False


def test_at_cap_refuses(monkeypatch):
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 2, raising=False)
    db = FakeDb(open_ids=[A, B], resources=active(A, B))
    assert rdp_capacity.at_capacity(db) is True


def test_held_machine_can_push_a_box_to_capacity(monkeypatch):
    """The concrete over-admit this prevents."""
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 3, raising=False)
    db = FakeDb(
        open_ids=[A, B],
        stamped_ids=[C],
        resources={**active(A, B), **held(C)},
    )
    assert rdp_capacity.at_capacity(db) is True, (
        "two live plus one held fills a 3-seat box"
    )


def test_cap_of_zero_is_treated_as_one(monkeypatch):
    """A misconfigured 0 must not mean 'unlimited'."""
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 0, raising=False)
    db = FakeDb(open_ids=[A], resources=active(A))
    assert rdp_capacity.at_capacity(db) is True


def test_default_cap_is_the_documented_six():
    assert settings.RDP_MAX_LIVE_SESSIONS == 6


# ── Operator visibility ─────────────────────────────────────────────────


def test_snapshot_breaks_the_number_down(monkeypatch):
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 6, raising=False)
    db = FakeDb(
        open_ids=[A, B],
        stamped_ids=[C],
        resources={
            A: FakeResource(RdpStatusEnum.active),
            B: FakeResource(RdpStatusEnum.idle),
            **held(C),
        },
    )
    snap = rdp_capacity.capacity_snapshot(db)
    assert snap["cap"] == 6
    assert snap["occupied"] == 3
    assert snap["available"] == 3
    assert snap["at_capacity"] is False
    assert snap["in_grace"] == 1, "the idle one is inside its grace window"
    assert snap["held_machines"] == 1
    assert str(C) in snap["held_machine_ids"]


def test_snapshot_never_reports_negative_availability(monkeypatch):
    monkeypatch.setattr(settings, "RDP_MAX_LIVE_SESSIONS", 1, raising=False)
    db = FakeDb(open_ids=[A, B], resources=active(A, B))
    snap = rdp_capacity.capacity_snapshot(db)
    assert snap["available"] == 0
    assert snap["at_capacity"] is True


def test_claim_uses_seat_accounting_not_a_raw_allocation_count():
    """Guard against the cap check regressing to counting open allocations."""
    import inspect

    from services import rdp_engine

    source = inspect.getsource(rdp_engine.claim)
    assert "occupied_seats" in source, "claim must count seats, including held machines"


def test_capacity_endpoint_is_admin_only():
    import inspect

    from conftest import find_endpoint

    source = inspect.getsource(find_endpoint("rdp_capacity_snapshot"))
    assert "require_admin" in source
    assert "capacity_snapshot" in source


@pytest.mark.postgres
def test_cap_plus_one_is_rejected_end_to_end():
    pytest.skip("covered by the Postgres CI job; see conftest POSTGRES_WHY")
