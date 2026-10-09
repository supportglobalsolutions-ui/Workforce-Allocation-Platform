from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import false
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import STAFF_ROLES, require_user
from models.admin_users import AdminUser
from models.enums import ShiftStatusEnum
from models.notification import Notification
from models.shift import Shift
from models.shift_change_request import ShiftChangeRequest
from models.worker import Worker
from schemas.shift import (
    ShiftChangeRequestCreate,
    ShiftChangeRequestResponse,
    ShiftChangeRequestReview,
    ShiftChangeSummary,
    ShiftCreate,
    ShiftPendingRequest,
    ShiftResponse,
    ShiftUpdate,
)
from services.audit_service import record_audit
from services.cost_ledger import is_worker_approved
from models.rdp_machine import RDPResource
from services.claim_shifts import CLAIM_KIND, validate_claim_shift
from services.rdp_state import (
    assign_rdp_for_approved_shift,
    release_rdp_for_cancelled_shift,
    worker_may_see_resource,
)
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _is_staff(current_user: dict) -> bool:
    return current_user.get("role") in STAFF_ROLES


def _acting_worker(db: Session, current_user: dict) -> Optional[Worker]:
    """The worker making this request, or None for an admin acting as themselves."""
    if _is_staff(current_user):
        return None
    return get_worker_for_user(db, current_user)


def _pending_requests_by_shift(db: Session, shift_ids: list[UUID]) -> dict[UUID, ShiftChangeRequest]:
    if not shift_ids:
        return {}
    rows = db.exec(
        select(ShiftChangeRequest).where(
            ShiftChangeRequest.shift_id.in_(shift_ids),
            ShiftChangeRequest.status == "pending",
        )
    ).all()
    return {r.shift_id: r for r in rows}


def _shift_names(db: Session, shifts: list[Shift]) -> tuple[dict, dict]:
    """Worker and RDP display names for a batch of shifts (two queries)."""
    worker_ids = {s.worker_id for s in shifts}
    rdp_ids = {s.rdp_resource_id for s in shifts if s.rdp_resource_id}
    workers = {
        w.id: w.display_name
        for w in db.exec(select(Worker).where(Worker.id.in_(worker_ids))).all()
    } if worker_ids else {}
    rdps = {
        r.id: r.nickname for r in db.exec(select(RDPResource).where(RDPResource.id.in_(rdp_ids))).all()
    } if rdp_ids else {}
    return workers, rdps


def _shift_responses(db: Session, shifts: list[Shift]) -> list[ShiftResponse]:
    pending = _pending_requests_by_shift(db, [s.id for s in shifts])
    workers, rdps = _shift_names(db, shifts)
    out = []
    for shift in shifts:
        payload = ShiftResponse.model_validate(shift)
        payload.worker_name = workers.get(shift.worker_id)
        payload.rdp_nickname = rdps.get(shift.rdp_resource_id) if shift.rdp_resource_id else None
        req = pending.get(shift.id)
        if req:
            payload.pending_request = ShiftPendingRequest.model_validate(req)
        out.append(payload)
    return out


def _scoped_stmt(current_user: dict, db: Session):
    stmt = select(Shift)
    if current_user.get("role") not in STAFF_ROLES:
        worker = get_worker_for_user(db, current_user)
        stmt = stmt.where(Shift.worker_id == worker.id)
        # Members not approved for this work month see no shifts.
        if not is_worker_approved(db, worker.id):
            stmt = stmt.where(false())
    return stmt


MAX_SHIFT_HOURS = 24


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _check_new_times(shift: Shift, body: ShiftUpdate, is_staff: bool) -> None:
    """Workers may move only their own pending, not-yet-started shifts."""
    start = _aware(body.scheduled_start or shift.scheduled_start)
    end = _aware(body.scheduled_end or shift.scheduled_end)
    if end <= start:
        raise HTTPException(status_code=400, detail="End time must be after the start time.")
    if end - start > timedelta(hours=MAX_SHIFT_HOURS):
        raise HTTPException(status_code=400, detail=f"A shift can be at most {MAX_SHIFT_HOURS} hours long.")
    if is_staff:
        return
    if shift.status != ShiftStatusEnum.pending:
        raise HTTPException(
            status_code=400,
            detail="Only pending shifts can be edited. Report an absence or ask an admin to change this one.",
        )
    now = datetime.now(timezone.utc)
    if _aware(shift.scheduled_start) <= now:
        raise HTTPException(status_code=400, detail="This shift has already started, so it can't be edited.")
    if start <= now:
        raise HTTPException(status_code=400, detail="The new start time must be in the future.")


@router.get("", response_model=list[ShiftResponse])
def list_shifts(
    status_filter: Optional[str] = Query(None, alias="status"),
    upcoming: bool = False,
    kind: Annotated[Optional[str], Query(description='"shift" or "rdp_claim"')] = None,
    worker_id: Annotated[Optional[UUID], Query(description="Admins: one member's shifts")] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _scoped_stmt(current_user, db)
    if status_filter:
        stmt = stmt.where(Shift.status == status_filter)
    if kind:
        stmt = stmt.where(Shift.kind == kind)
    if worker_id and current_user.get("role") in STAFF_ROLES:
        stmt = stmt.where(Shift.worker_id == worker_id)
    if upcoming:
        stmt = stmt.where(Shift.scheduled_start >= datetime.utcnow())
    return _shift_responses(db, db.exec(stmt.order_by(Shift.scheduled_start)).all())


# ── change requests (approved shifts) ────────────────────────────────────────
# Declared before "/{shift_id}" so these paths are not parsed as a shift id.

def _request_stmt(current_user: dict, db: Session):
    stmt = select(ShiftChangeRequest)
    worker = _acting_worker(db, current_user)
    if worker is not None:
        stmt = stmt.where(ShiftChangeRequest.worker_id == worker.id)
    return stmt


def _request_response(db: Session, req: ShiftChangeRequest) -> ShiftChangeRequestResponse:
    payload = ShiftChangeRequestResponse.model_validate(req)
    worker = db.get(Worker, req.worker_id)
    payload.worker_name = worker.display_name if worker else None
    if req.reviewed_by:
        reviewer = db.get(AdminUser, req.reviewed_by)
        payload.reviewer_name = reviewer.display_name if reviewer else None
    shift = db.get(Shift, req.shift_id)
    if shift:
        payload.shift_start = shift.scheduled_start
        payload.shift_end = shift.scheduled_end
        payload.shift_status = shift.status.value if shift.status else None
    return payload


@router.get("/change-requests", response_model=list[ShiftChangeRequestResponse])
def list_change_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _request_stmt(current_user, db)
    if status_filter:
        stmt = stmt.where(ShiftChangeRequest.status == status_filter)
    rows = db.exec(stmt.order_by(ShiftChangeRequest.created_at.desc()).limit(500)).all()
    return [_request_response(db, r) for r in rows]


@router.get("/change-requests/summary", response_model=ShiftChangeSummary)
def change_request_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Counts behind the Shift changes badge and the red ! on admin Shifts."""
    rows = db.exec(
        _request_stmt(current_user, db)
        .join(Shift, Shift.id == ShiftChangeRequest.shift_id)
        .where(ShiftChangeRequest.status == "pending", Shift.status != ShiftStatusEnum.cancelled)
    ).all()
    return ShiftChangeSummary(pending=len(rows), flagged_shift_ids=[r.shift_id for r in rows])


@router.delete("/change-requests/{request_id}", response_model=ShiftChangeRequestResponse)
def withdraw_change_request(
    request_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = _acting_worker(db, current_user)
    if worker is None:
        raise HTTPException(status_code=403, detail="Only the worker who sent a request can withdraw it")
    req = db.exec(
        select(ShiftChangeRequest).where(
            ShiftChangeRequest.id == request_id, ShiftChangeRequest.worker_id == worker.id,
        )
    ).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"This request is already {req.status}.")
    req.status = "cancelled"
    db.add(req)
    db.commit()
    db.refresh(req)
    return _request_response(db, req)


@router.patch("/change-requests/{request_id}", response_model=ShiftChangeRequestResponse)
def review_change_request(
    request_id: UUID,
    body: ShiftChangeRequestReview,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if not _is_staff(current_user):
        raise HTTPException(status_code=403, detail="Only admins can approve or reject requests")
    req = db.get(ShiftChangeRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail=f"This request is already {req.status}.")
    note = (body.admin_note or "").strip() or None
    if body.decision == "reject" and not note:
        raise HTTPException(status_code=400, detail="Tell the worker why the request was rejected")

    shift = db.get(Shift, req.shift_id)
    if not shift or shift.status == ShiftStatusEnum.cancelled:
        req.status = "cancelled"
        db.add(req)
        db.commit()
        raise HTTPException(status_code=409, detail="This shift has been cancelled, so the request was closed.")

    admin = get_admin_user(db, current_user)
    now = datetime.now(timezone.utc)
    before = {
        "start": shift.scheduled_start.isoformat(),
        "end": shift.scheduled_end.isoformat(),
        "status": shift.status.value,
    }

    if body.decision == "approve":
        if req.kind == "edit":
            if shift.kind == CLAIM_KIND:
                validate_claim_shift(
                    db,
                    rdp_id=shift.rdp_resource_id,
                    start=req.new_start,
                    end=req.new_end,
                    exclude_id=shift.id,
                )
            shift.scheduled_start = req.new_start
            shift.scheduled_end = req.new_end
            shift.approved_by = admin.id
            shift.approved_at = now
        else:
            shift.status = ShiftStatusEnum.cancelled
            release_rdp_for_cancelled_shift(db, shift, commit=False)
        db.add(shift)

    req.status = "approved" if body.decision == "approve" else "rejected"
    req.reviewed_by = admin.id
    req.reviewed_at = now
    req.admin_note = note
    db.add(req)

    record_audit(
        db,
        actor_id=admin.id,
        action=f"shifts.{req.kind}_request_{req.status}",
        target_type="shift",
        target_id=shift.id,
        previous_value=before,
        new_value={
            "start": shift.scheduled_start.isoformat(),
            "end": shift.scheduled_end.isoformat(),
            "status": shift.status.value,
            "worker_reason": req.reason,
        },
        reason_note=note,
    )
    _notify_worker_of_request_decision(db, req)
    db.commit()
    db.refresh(req)
    return _request_response(db, req)


def _notify_worker_of_request_decision(db: Session, req: ShiftChangeRequest) -> None:
    when = _aware(req.old_start).strftime("%d %b %Y %H:%M")
    what = "change" if req.kind == "edit" else "delete"
    approved = req.status == "approved"
    if approved and req.kind == "edit":
        new_when = f"{_aware(req.new_start).strftime('%d %b %Y %H:%M')}–{_aware(req.new_end).strftime('%H:%M')}"
        message = f"Your request to change the shift on {when} was approved. It now runs {new_when} (UTC)."
    elif approved:
        message = f"Your request to delete the shift on {when} was approved. The shift has been cancelled."
    else:
        message = f"Your request to {what} the shift on {when} was rejected. The shift is unchanged."
    if req.admin_note:
        message += f" Admin note: {req.admin_note}"
    db.add(
        Notification(
            sender_admin_id=req.reviewed_by,
            title=f"Shift {what} request {'approved' if approved else 'rejected'}",
            message=message,
            category="shift",
            target_type="specific",
            target_worker_id=req.worker_id,
        )
    )


@router.post("/{shift_id}/change-requests", response_model=ShiftChangeRequestResponse)
def send_change_request(
    shift_id: UUID,
    body: ShiftChangeRequestCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """A worker asks to change or delete their own approved shift; sending again amends the open request."""
    worker = _acting_worker(db, current_user)
    if worker is None:
        raise HTTPException(status_code=403, detail="Admins can edit shifts directly")
    shift = db.exec(select(Shift).where(Shift.id == shift_id, Shift.worker_id == worker.id)).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift.status != ShiftStatusEnum.approved:
        raise HTTPException(
            status_code=409,
            detail="Only approved shifts need a request. Edit or delete pending shifts directly.",
        )
    now = datetime.now(timezone.utc)
    if _aware(shift.scheduled_start) <= now:
        raise HTTPException(status_code=400, detail="This shift has already started, so it can't be changed.")

    new_start = new_end = None
    if body.kind == "edit":
        start = _aware(body.scheduled_start or shift.scheduled_start)
        end = _aware(body.scheduled_end or shift.scheduled_end)
        if end <= start:
            raise HTTPException(status_code=400, detail="End time must be after the start time.")
        if end - start > timedelta(hours=MAX_SHIFT_HOURS):
            raise HTTPException(status_code=400, detail=f"A shift can be at most {MAX_SHIFT_HOURS} hours long.")
        if start <= now:
            raise HTTPException(status_code=400, detail="The new start time must be in the future.")
        if start == _aware(shift.scheduled_start) and end == _aware(shift.scheduled_end):
            raise HTTPException(status_code=400, detail="These are the shift's current times; nothing to change.")
        new_start, new_end = start, end

    reason = (body.reason or "").strip() or None
    req = db.exec(
        select(ShiftChangeRequest).where(
            ShiftChangeRequest.shift_id == shift.id, ShiftChangeRequest.status == "pending",
        )
    ).first()
    if req is None:
        req = ShiftChangeRequest(
            shift_id=shift.id,
            worker_id=worker.id,
            old_start=shift.scheduled_start,
            old_end=shift.scheduled_end,
            kind=body.kind,
        )
    req.kind = body.kind
    req.new_start = new_start
    req.new_end = new_end
    req.reason = reason
    req.created_at = now
    db.add(req)
    db.commit()
    db.refresh(req)
    return _request_response(db, req)


@router.get("/{shift_id}", response_model=ShiftResponse)
def get_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    shift = db.exec(
        _scoped_stmt(current_user, db).where(Shift.id == shift_id)
    ).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    return _shift_responses(db, [shift])[0]


@router.post("", response_model=ShiftResponse, status_code=status.HTTP_201_CREATED)
def create_shift(
    body: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    is_staff = current_user.get("role") in STAFF_ROLES
    if not is_staff:
        # Only admins approve: a worker's submission always starts pending.
        body.status = ShiftStatusEnum.pending
        worker = get_worker_for_user(db, current_user)
        if body.worker_id != worker.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers may only submit shifts for themselves",
            )
        if not is_worker_approved(db, worker.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not approved for this work month yet — an admin must approve you first.",
            )

    # Submitting the same availability twice is a double-click, not a second
    # shift. Returning the existing row keeps the submit loop working while
    # making the operation idempotent — the roster stays clean either way.
    existing = db.exec(
        select(Shift).where(
            Shift.worker_id == body.worker_id,
            Shift.scheduled_start == body.scheduled_start,
            Shift.scheduled_end == body.scheduled_end,
            Shift.status != ShiftStatusEnum.cancelled,
        )
    ).first()
    if existing:
        return existing

    if body.kind == CLAIM_KIND:
        validate_claim_shift(
            db,
            rdp_id=body.rdp_resource_id,
            start=body.scheduled_start,
            end=body.scheduled_end,
            worker_visible=None if is_staff else (
                lambda r: worker_may_see_resource(db, r, body.worker_id)
            ),
        )

    shift = Shift(**body.model_dump())
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift


@router.patch("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: UUID,
    body: ShiftUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") in STAFF_ROLES:
        shift = db.exec(select(Shift).where(Shift.id == shift_id)).first()
    else:
        worker = get_worker_for_user(db, current_user)
        shift = db.exec(
            select(Shift).where(Shift.id == shift_id, Shift.worker_id == worker.id)
        ).first()

    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")

    previous_status: ShiftStatusEnum = shift.status
    changes = body.model_dump(exclude_unset=True)
    is_staff = current_user.get("role") in STAFF_ROLES

    if not is_staff:
        restricted = {"status", "approved_by", "approved_at", "rdp_resource_id"}
        if restricted & changes.keys():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers cannot approve or reject shifts",
            )

    if {"scheduled_start", "scheduled_end"} & changes.keys():
        _check_new_times(shift, body, is_staff)

    apply_update(shift, body)

    becoming_live = shift.status in (ShiftStatusEnum.pending, ShiftStatusEnum.approved)
    if shift.kind == CLAIM_KIND and becoming_live and (
        {"scheduled_start", "scheduled_end", "rdp_resource_id"} & changes.keys()
        or (shift.status == ShiftStatusEnum.approved and previous_status != ShiftStatusEnum.approved)
    ):
        validate_claim_shift(
            db,
            rdp_id=shift.rdp_resource_id,
            start=shift.scheduled_start,
            end=shift.scheduled_end,
            exclude_id=shift.id,
        )

    if (
        shift.kind != CLAIM_KIND
        and shift.status == ShiftStatusEnum.approved
        and previous_status != ShiftStatusEnum.approved
        and shift.rdp_resource_id
    ):
        # Normal shifts keep their old behaviour. Claim shifts hold the machine
        # only during their hours (see services/claim_shifts.py).
        assign_rdp_for_approved_shift(db, shift, commit=False)

    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _shift_responses(db, [shift])[0]


@router.delete("/{shift_id}", response_model=ShiftResponse)
def delete_shift(
    shift_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """A worker removes their own pending shift. The row is kept, marked cancelled."""
    worker = _acting_worker(db, current_user)
    stmt = select(Shift).where(Shift.id == shift_id)
    if worker is not None:
        stmt = stmt.where(Shift.worker_id == worker.id)
    shift = db.exec(stmt).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
    if shift.status == ShiftStatusEnum.cancelled:
        return _shift_responses(db, [shift])[0]
    if worker is not None and shift.status != ShiftStatusEnum.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This shift is already approved. Send a delete request instead.",
        )
    shift.status = ShiftStatusEnum.cancelled
    release_rdp_for_cancelled_shift(db, shift, commit=False)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return _shift_responses(db, [shift])[0]
