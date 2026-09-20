"""
Force stop is the admin's last resort, so it must never be the thing that fails.

A worker End deliberately refuses to re-pool a machine whose closure the
gateway would not confirm, and an admin-initiated end used to answer 503 in
that same case — nothing torn down, session still live, button looking broken.
That is precisely when an admin needs the seat gone. `force=True` keeps the
safety (the machine is held, not handed to the next worker) while guaranteeing
the teardown actually happens.
"""
from __future__ import annotations

import uuid

import pytest

from models.enums import AllocationLifecycleEnum, RdpStatusEnum
from services import rdp_engine


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class FakeDb:
    """Just enough session for `disconnect` — allocations come from a list."""

    def __init__(self, allocs):
        self.allocs = list(allocs)
        self.committed = 0

    def refresh(self, _obj):
        return None

    def exec(self, _statement):
        return FakeResult(self.allocs)

    def add(self, _obj):
        return None

    def get(self, _model, _pk):
        return None

    def commit(self):
        self.committed += 1


def _resource():
    return type(
        "R",
        (),
        {
            "id": uuid.uuid4(),
            "nickname": "RDP1",
            "status": RdpStatusEnum.active,
            "assigned_worker_id": uuid.uuid4(),
            "guacamole_connection_id": "7",
            "status_changed_at": None,
            "version": 1,
        },
    )()


def _alloc(resource_id):
    return type(
        "A",
        (),
        {
            "id": uuid.uuid4(),
            "rdp_resource_id": resource_id,
            "worker_id": uuid.uuid4(),
            "released_at": None,
            "allocation_status": AllocationLifecycleEnum.assigned,
            "version": 1,
            "last_gateway_observation_at": None,
            "connection_generation": 1,
        },
    )()


@pytest.fixture
def wiring(monkeypatch):
    """Stub every seam `disconnect` reaches for, and record the hold."""
    held: list[str] = []

    def fake_client_for_allocation(_redis, _alloc):
        return type("C", (), {"close_and_confirm": lambda _self, _cid: fake_client_for_allocation.outcome})()

    fake_client_for_allocation.outcome = {"outcome": "pending", "closed": 0}

    monkeypatch.setattr(
        "services.rdp_gateway_cluster.client_for_allocation", fake_client_for_allocation
    )
    monkeypatch.setattr(
        "services.rdp_join_ticket.revoke_for_allocations", lambda *a, **k: None
    )
    monkeypatch.setattr(rdp_engine, "release_tunnel_lock", lambda *a, **k: None)
    monkeypatch.setattr(rdp_engine, "_should_restore_assignment", lambda *a, **k: False)
    monkeypatch.setattr(
        "services.rdp_quarantine.hold_machine_unconfirmed",
        lambda db, resource, allocs, reason, now: held.append(reason),
    )
    return fake_client_for_allocation, held


def _run(db, resource, *, force):
    return rdp_engine.disconnect(
        db,
        resource,
        redis_client=None,
        worker_id=None,
        require_owner=False,
        initiated_by="admin",
        admin_id=uuid.uuid4(),
        force=force,
        close_sessions_fn=lambda _db, _rid: [],
        record_logout_fn=lambda *a, **k: None,
    )


def test_unconfirmed_close_still_tears_down_when_forced(wiring):
    """The regression: admin force stop answered 503 and changed nothing."""
    _, held = wiring
    resource = _resource()
    db = FakeDb([_alloc(resource.id)])

    outcome = _run(db, resource, force=True)

    assert outcome.ok is True
    assert outcome.code == "released"
    # Torn down, but not handed to the next worker — closure was never proven.
    assert held, "an unproven close must hold the machine"


def test_unforced_admin_end_still_refuses_on_an_unproven_close(wiring):
    """Ordinary End keeps the old contract — only force stop overrides it."""
    _, held = wiring
    resource = _resource()
    db = FakeDb([_alloc(resource.id)])

    outcome = _run(db, resource, force=False)

    assert outcome.ok is False
    assert outcome.code == "close_pending"
    assert outcome.http_status == 503
    assert not held


def test_confirmed_close_releases_without_holding(wiring):
    client, held = wiring
    client.outcome = {"outcome": "closed", "closed": 1}
    resource = _resource()
    db = FakeDb([_alloc(resource.id)])

    outcome = _run(db, resource, force=True)

    assert outcome.ok is True
    assert outcome.data["guacamole_disconnected"] is True
    assert not held
    assert resource.status == RdpStatusEnum.online_free


def test_force_release_asks_for_the_override():
    """Wiring check: the admin entry point is the one that sets force."""
    import inspect

    source = inspect.getsource(rdp_engine.force_release)
    assert "force=True" in source
