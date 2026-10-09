"""Workers delete pending shifts directly; approved shifts need an admin-approved request."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, select

import models  # noqa: F401 — registers every table
from models.enums import ShiftStatusEnum
from models.notification import Notification
from models.shift import Shift
from models.shift_change_request import ShiftChangeRequest
from routers import shifts as shifts_router
from schemas.shift import ShiftChangeRequestCreate, ShiftChangeRequestReview

NOW = datetime.now(timezone.utc)
WORKER = {"uid": "worker-a", "role": "worker"}
OTHER_WORKER = {"uid": "worker-b", "role": "worker"}
ADMIN = {"uid": "admin-1", "role": "admin"}


@pytest.fixture
def ctx(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _functions(conn, _record):
        conn.create_function("now", 0, lambda: datetime.now(timezone.utc).isoformat(" "))
        conn.create_function("gen_random_uuid", 0, lambda: uuid4().hex)

    tables = [SQLModel.metadata.tables[n] for n in ("shifts", "shift_change_requests", "notifications")]
    SQLModel.metadata.create_all(engine, tables=tables)

    workers = {"worker-a": SimpleNamespace(id=uuid4()), "worker-b": SimpleNamespace(id=uuid4())}
    admin = SimpleNamespace(id=uuid4())
    audits: list[dict] = []
    monkeypatch.setattr(shifts_router, "get_worker_for_user", lambda db, user: workers[user["uid"]])
    monkeypatch.setattr(shifts_router, "get_admin_user", lambda db, user: admin)
    monkeypatch.setattr(shifts_router, "record_audit", lambda db, **kw: audits.append(kw))
    monkeypatch.setattr(shifts_router, "_request_response", lambda db, req: req)
    # workers / rdp_resources use Postgres-only types; names are cosmetic here.
    monkeypatch.setattr(shifts_router, "_shift_names", lambda db, shifts: ({}, {}))

    with Session(engine, expire_on_commit=False) as db:
        yield SimpleNamespace(db=db, workers=workers, admin=admin, audits=audits)


def _shift(ctx, status=ShiftStatusEnum.approved, worker="worker-a", starts_in=timedelta(days=2), hours=6):
    start = NOW + starts_in
    shift = Shift(
        worker_id=ctx.workers[worker].id,
        scheduled_start=start,
        scheduled_end=start + timedelta(hours=hours),
        status=status,
    )
    ctx.db.add(shift)
    ctx.db.commit()
    return shift


def _edit(start_in: timedelta, hours: float, reason=None) -> ShiftChangeRequestCreate:
    start = NOW + start_in
    return ShiftChangeRequestCreate(
        kind="edit", scheduled_start=start, scheduled_end=start + timedelta(hours=hours), reason=reason,
    )


def _aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def test_worker_deletes_pending_shift_directly(ctx):
    shift = _shift(ctx, status=ShiftStatusEnum.pending)
    result = shifts_router.delete_shift(shift.id, db=ctx.db, current_user=WORKER)
    assert result.status == ShiftStatusEnum.cancelled
    assert ctx.db.get(Shift, shift.id).status == ShiftStatusEnum.cancelled


def test_worker_cannot_delete_approved_shift_directly(ctx):
    shift = _shift(ctx)
    with pytest.raises(HTTPException) as exc:
        shifts_router.delete_shift(shift.id, db=ctx.db, current_user=WORKER)
    assert exc.value.status_code == 409
    assert ctx.db.get(Shift, shift.id).status == ShiftStatusEnum.approved


def test_sending_again_updates_the_open_request(ctx):
    shift = _shift(ctx)
    first = shifts_router.send_change_request(shift.id, _edit(timedelta(days=3), 4), db=ctx.db, current_user=WORKER)
    second = shifts_router.send_change_request(
        shift.id, _edit(timedelta(days=4), 5, reason="Wrong day"), db=ctx.db, current_user=WORKER,
    )
    assert first.id == second.id
    rows = ctx.db.exec(select(ShiftChangeRequest).where(ShiftChangeRequest.shift_id == shift.id)).all()
    assert len(rows) == 1
    assert rows[0].reason == "Wrong day"
    assert _aware(rows[0].new_start) == NOW + timedelta(days=4)

    listed = shifts_router.list_shifts(status_filter=None, upcoming=False, db=ctx.db, current_user=ADMIN)
    assert listed[0].pending_request.id == first.id
    summary = shifts_router.change_request_summary(db=ctx.db, current_user=ADMIN)
    assert summary.pending == 1 and summary.flagged_shift_ids == [shift.id]


def test_pending_shift_needs_no_request(ctx):
    shift = _shift(ctx, status=ShiftStatusEnum.pending)
    with pytest.raises(HTTPException) as exc:
        shifts_router.send_change_request(shift.id, _edit(timedelta(days=3), 4), db=ctx.db, current_user=WORKER)
    assert exc.value.status_code == 409


def test_approving_an_edit_applies_the_new_times(ctx):
    shift = _shift(ctx)
    req = shifts_router.send_change_request(shift.id, _edit(timedelta(days=3), 4), db=ctx.db, current_user=WORKER)
    shifts_router.review_change_request(
        req.id, ShiftChangeRequestReview(decision="approve"), db=ctx.db, current_user=ADMIN,
    )
    updated = ctx.db.get(Shift, shift.id)
    assert _aware(updated.scheduled_start) == NOW + timedelta(days=3)
    assert _aware(updated.scheduled_end) == NOW + timedelta(days=3, hours=4)
    assert updated.status == ShiftStatusEnum.approved
    assert updated.approved_by == ctx.admin.id
    assert ctx.db.get(ShiftChangeRequest, req.id).status == "approved"
    assert ctx.audits[-1]["action"] == "shifts.edit_request_approved"
    note = ctx.db.exec(select(Notification)).one()
    assert note.target_worker_id == ctx.workers["worker-a"].id and note.category == "shift"


def test_approving_a_delete_cancels_the_shift(ctx):
    shift = _shift(ctx)
    req = shifts_router.send_change_request(
        shift.id, ShiftChangeRequestCreate(kind="delete"), db=ctx.db, current_user=WORKER,
    )
    shifts_router.review_change_request(
        req.id, ShiftChangeRequestReview(decision="approve"), db=ctx.db, current_user=ADMIN,
    )
    assert ctx.db.get(Shift, shift.id).status == ShiftStatusEnum.cancelled
    assert ctx.audits[-1]["action"] == "shifts.delete_request_approved"


def test_rejecting_leaves_the_shift_unchanged(ctx):
    shift = _shift(ctx)
    original_start = _aware(shift.scheduled_start)
    req = shifts_router.send_change_request(shift.id, _edit(timedelta(days=3), 4), db=ctx.db, current_user=WORKER)

    with pytest.raises(HTTPException) as exc:
        shifts_router.review_change_request(
            req.id, ShiftChangeRequestReview(decision="reject"), db=ctx.db, current_user=ADMIN,
        )
    assert exc.value.status_code == 400

    shifts_router.review_change_request(
        req.id, ShiftChangeRequestReview(decision="reject", admin_note="Roster is full"),
        db=ctx.db, current_user=ADMIN,
    )
    updated = ctx.db.get(Shift, shift.id)
    assert _aware(updated.scheduled_start) == original_start
    assert updated.status == ShiftStatusEnum.approved
    assert ctx.db.get(ShiftChangeRequest, req.id).status == "rejected"
    assert "Roster is full" in ctx.db.exec(select(Notification)).one().message


def test_worker_can_withdraw_their_request(ctx):
    shift = _shift(ctx)
    req = shifts_router.send_change_request(
        shift.id, ShiftChangeRequestCreate(kind="delete"), db=ctx.db, current_user=WORKER,
    )
    shifts_router.withdraw_change_request(req.id, db=ctx.db, current_user=WORKER)
    assert ctx.db.get(ShiftChangeRequest, req.id).status == "cancelled"
    assert shifts_router.change_request_summary(db=ctx.db, current_user=ADMIN).pending == 0


def test_worker_cannot_touch_another_workers_shift(ctx):
    shift = _shift(ctx, worker="worker-b")
    pending = _shift(ctx, status=ShiftStatusEnum.pending, worker="worker-b")
    with pytest.raises(HTTPException) as exc:
        shifts_router.send_change_request(shift.id, _edit(timedelta(days=3), 4), db=ctx.db, current_user=WORKER)
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        shifts_router.delete_shift(pending.id, db=ctx.db, current_user=WORKER)
    assert exc.value.status_code == 404

    req = shifts_router.send_change_request(
        shift.id, ShiftChangeRequestCreate(kind="delete"), db=ctx.db, current_user=OTHER_WORKER,
    )
    with pytest.raises(HTTPException) as exc:
        shifts_router.withdraw_change_request(req.id, db=ctx.db, current_user=WORKER)
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException) as exc:
        shifts_router.review_change_request(
            req.id, ShiftChangeRequestReview(decision="approve"), db=ctx.db, current_user=WORKER,
        )
    assert exc.value.status_code == 403
