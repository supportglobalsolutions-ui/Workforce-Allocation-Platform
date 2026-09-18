"""
Assigned-only claim board visibility (Phase 2).

Workers see only machines assigned to them (or with their open alloc / shift).
Admin / executive / super_admin see the full fleet. Unassigned free machines
must not appear on a worker claim board.
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace

from models.enums import RdpStatusEnum
from services import rdp_state


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)


class FakeDb:
    """Answers allocation / shift / resource queries used by visibility helpers."""

    def __init__(self, *, resources=(), open_allocs=(), shifts=()):
        self.resources = list(resources)
        self.open_allocs = list(open_allocs)
        self.shifts = list(shifts)

    def exec(self, statement):
        text = str(statement).lower()
        if "allocation" in text:
            return FakeResult(self.open_allocs)
        if "shift" in text:
            return FakeResult(self.shifts)
        return FakeResult(self.resources)


def _machine(*, assigned_to=None, status=RdpStatusEnum.online_free):
    return SimpleNamespace(
        id=uuid.uuid4(),
        nickname="box",
        status=status,
        assigned_worker_id=assigned_to,
    )


def test_worker_does_not_see_unassigned_online_free():
    worker = uuid.uuid4()
    free = _machine(assigned_to=None, status=RdpStatusEnum.online_free)
    db = FakeDb(resources=[free])
    assert rdp_state.worker_may_see_resource(db, free, worker) is False


def test_worker_sees_machine_assigned_to_them():
    worker = uuid.uuid4()
    mine = _machine(assigned_to=worker, status=RdpStatusEnum.assigned)
    db = FakeDb(resources=[mine])
    assert rdp_state.worker_may_see_resource(db, mine, worker) is True


def test_worker_does_not_see_machine_assigned_to_someone_else():
    worker = uuid.uuid4()
    other = _machine(assigned_to=uuid.uuid4(), status=RdpStatusEnum.assigned)
    db = FakeDb(resources=[other])
    assert rdp_state.worker_may_see_resource(db, other, worker) is False


def test_list_visible_empty_when_worker_has_no_assignments():
    worker = uuid.uuid4()
    free = _machine(assigned_to=None)
    other = _machine(assigned_to=uuid.uuid4(), status=RdpStatusEnum.assigned)
    db = FakeDb(resources=[free, other])
    visible = rdp_state.list_visible_rdp_resources(
        db, viewer={"role": "user"}, viewer_worker_id=worker
    )
    assert visible == []


def test_list_visible_worker_only_gets_assigned():
    worker = uuid.uuid4()
    mine = _machine(assigned_to=worker, status=RdpStatusEnum.assigned)
    free = _machine(assigned_to=None)
    db = FakeDb(resources=[mine, free])
    visible = rdp_state.list_visible_rdp_resources(
        db, viewer={"role": "user"}, viewer_worker_id=worker
    )
    assert visible == [mine]


def test_admin_sees_every_machine():
    free = _machine(assigned_to=None)
    assigned = _machine(assigned_to=uuid.uuid4(), status=RdpStatusEnum.assigned)
    db = FakeDb(resources=[free, assigned])
    for role in ("admin", "executive", "super_admin"):
        visible = rdp_state.list_visible_rdp_resources(
            db, viewer={"role": role}, viewer_worker_id=None
        )
        assert visible == [free, assigned], role


def test_partner_is_worker_scoped_not_staff():
    worker = uuid.uuid4()
    free = _machine(assigned_to=None)
    db = FakeDb(resources=[free])
    visible = rdp_state.list_visible_rdp_resources(
        db, viewer={"role": "partner"}, viewer_worker_id=worker
    )
    assert visible == []
