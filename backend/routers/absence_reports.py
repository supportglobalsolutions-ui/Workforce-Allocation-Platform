"""Absence reports — a worker telling us ahead of time they cannot work.

Scoping matches shifts: staff see every report, a worker sees only their own.
"""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import STAFF_ROLES, require_user
from core.security_validation import validate_absence_attachment_path
from models.absence_report import MAX_ABSENCE_ATTACHMENTS, AbsenceReport
from models.admin_users import AdminUser
from models.enums import AbsenceStatusEnum, ShiftStatusEnum
from models.notification import Notification
from models.shift import Shift
from models.worker import Worker
from schemas.absence_report import (
    AbsenceAttachmentAdd,
    AbsenceAttachmentsResponse,
    AbsenceReportAmend,
    AbsenceReportCreate,
    AbsenceReportResponse,
    AbsenceReportReview,
    AbsenceSummaryResponse,
)
from services.rdp_state import release_rdp_for_cancelled_shift
from .deps import get_admin_user, get_worker_for_user

router = APIRouter()

#: Reports that still "count" — they mark a shift and show the ! badge.
OPEN_STATUSES = (AbsenceStatusEnum.pending, AbsenceStatusEnum.accepted)


def _is_staff(current_user: dict) -> bool:
    return current_user.get("role") in STAFF_ROLES


def _scoped_stmt(current_user: dict, db: Session):
    stmt = select(AbsenceReport)
    if not _is_staff(current_user):
        worker = get_worker_for_user(db, current_user)
        stmt = stmt.where(AbsenceReport.worker_id == worker.id)
    return stmt


def _to_response(db: Session, report: AbsenceReport) -> AbsenceReportResponse:
    """Attach the display names the lists render, so the UI needs one call."""
    payload = AbsenceReportResponse.model_validate(report)
    worker = db.get(Worker, report.worker_id)
    payload.worker_name = worker.display_name if worker else None
    if report.reviewed_by:
        reviewer = db.get(AdminUser, report.reviewed_by)
        payload.reviewer_name = reviewer.display_name if reviewer else None
    return payload


def _report_for_caller(db: Session, report_id: UUID, current_user: dict) -> AbsenceReport:
    report = db.exec(
        _scoped_stmt(current_user, db).where(AbsenceReport.id == report_id)
    ).first()
    if not report:
        raise HTTPException(status_code=404, detail="Absence report not found")
    return report


@router.get("", response_model=list[AbsenceReportResponse])
def list_absence_reports(
    status_filter: Optional[AbsenceStatusEnum] = Query(None, alias="status"),
    worker_id: Optional[UUID] = None,
    shift_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _scoped_stmt(current_user, db)
    if status_filter:
        stmt = stmt.where(AbsenceReport.status == status_filter)
    if worker_id and _is_staff(current_user):
        stmt = stmt.where(AbsenceReport.worker_id == worker_id)
    if shift_id:
        stmt = stmt.where(AbsenceReport.shift_id == shift_id)
    rows = db.exec(stmt.order_by(AbsenceReport.created_at.desc())).all()
    return [_to_response(db, r) for r in rows]


@router.get("/summary", response_model=AbsenceSummaryResponse)
def absence_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Counts behind the ! markers on both dashboards."""
    pending = db.exec(
        _scoped_stmt(current_user, db).where(AbsenceReport.status == AbsenceStatusEnum.pending)
    ).all()
    open_rows = db.exec(
        _scoped_stmt(current_user, db).where(AbsenceReport.status.in_(OPEN_STATUSES))
    ).all()
    return AbsenceSummaryResponse(
        pending=len(pending),
        flagged_shift_ids=[r.shift_id for r in open_rows if r.shift_id],
    )


@router.get("/{report_id}", response_model=AbsenceReportResponse)
def get_absence_report(
    report_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    return _to_response(db, _report_for_caller(db, report_id, current_user))


@router.post("", response_model=AbsenceReportResponse, status_code=status.HTTP_201_CREATED)
def create_absence_report(
    body: AbsenceReportCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """File a report against the caller's own worker profile.

    There is deliberately no "file on behalf of" path — an absence is the
    worker's own statement, and an admin entering one would blur who said what.
    """
    worker = get_worker_for_user(db, current_user)

    if body.shift_id:
        shift = db.get(Shift, body.shift_id)
        if not shift:
            raise HTTPException(status_code=404, detail="Shift not found")
        if shift.worker_id != worker.id and not _is_staff(current_user):
            raise HTTPException(status_code=403, detail="That shift is not yours")
        # One open report per shift — a second one is a double-submit, not news.
        existing = db.exec(
            select(AbsenceReport).where(
                AbsenceReport.shift_id == body.shift_id,
                AbsenceReport.status.in_(OPEN_STATUSES),
            )
        ).first()
        if existing:
            # Not an error the worker should have to work around: the second
            # attempt is almost always a correction, so the UI turns this into
            # "amend the one you already filed".
            raise HTTPException(
                status_code=409,
                detail=(
                    "You have already reported an absence for this shift — "
                    "amend that report instead of filing a second one."
                ),
            )

    report = AbsenceReport(
        worker_id=worker.id,
        shift_id=body.shift_id,
        absence_start=body.absence_start,
        absence_end=body.absence_end,
        reason_category=body.reason_category,
        reason_text=body.reason_text,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _to_response(db, report)


@router.put("/{report_id}", response_model=AbsenceReportResponse)
def amend_absence_report(
    report_id: UUID,
    body: AbsenceReportAmend,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Let the worker correct their own pending report.

    This is the answer to the double-submit: a worker who realises they got
    the dates or the reason wrong amends the report they filed rather than
    sending a second one. Only the author may amend — an admin editing the
    text would blur whose statement it is, exactly as with filing.
    """
    worker = get_worker_for_user(db, current_user)
    report = _report_for_caller(db, report_id, current_user)

    if report.worker_id != worker.id:
        raise HTTPException(
            status_code=403, detail="Only the worker who filed a report can amend it"
        )
    if report.status != AbsenceStatusEnum.pending:
        raise HTTPException(
            status_code=409,
            detail=f"This report is already {report.status.value} and can no longer be changed.",
        )

    fields = body.model_dump(exclude_unset=True, exclude_none=True)
    if not fields:
        return _to_response(db, report)

    # The half-window case is caught by the schema; this guards a start-only
    # amend landing on top of a stored end.
    new_start = fields.get("absence_start", report.absence_start)
    new_end = fields.get("absence_end", report.absence_end)
    if new_end <= new_start:
        raise HTTPException(status_code=400, detail="Absence end must be after the start")

    for field, value in fields.items():
        setattr(report, field, value)
    report.updated_at = datetime.now(timezone.utc)
    db.add(report)
    db.commit()
    db.refresh(report)
    return _to_response(db, report)


@router.post("/{report_id}/attachments", response_model=AbsenceAttachmentsResponse)
def add_absence_attachment(
    report_id: UUID,
    body: AbsenceAttachmentAdd,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Append one PDF/JPG/PNG to a report.

    The cap lives here rather than in the browser for the same reason the
    session gallery's does: two tabs uploading at once would both read 2 and
    both append.
    """
    report = _report_for_caller(db, report_id, current_user)
    if report.status != AbsenceStatusEnum.pending:
        raise HTTPException(
            status_code=400, detail="This report has already been reviewed."
        )
    try:
        path = validate_absence_attachment_path(body.path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    current = list(report.attachment_paths or [])
    if path in current:
        return AbsenceAttachmentsResponse(
            attachment_paths=current, max_attachments=MAX_ABSENCE_ATTACHMENTS
        )
    if len(current) >= MAX_ABSENCE_ATTACHMENTS:
        raise HTTPException(
            status_code=400,
            detail=f"A report can carry at most {MAX_ABSENCE_ATTACHMENTS} files.",
        )

    # Reassign rather than append: JSONB columns are not change-tracked in place.
    report.attachment_paths = current + [path]
    report.updated_at = datetime.now(timezone.utc)
    db.add(report)
    db.commit()
    db.refresh(report)
    return AbsenceAttachmentsResponse(
        attachment_paths=list(report.attachment_paths or []),
        max_attachments=MAX_ABSENCE_ATTACHMENTS,
    )


@router.delete("/{report_id}/attachments", response_model=AbsenceAttachmentsResponse)
def remove_absence_attachment(
    report_id: UUID,
    path: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Drop a wrongly-picked file before the report is reviewed."""
    report = _report_for_caller(db, report_id, current_user)
    if report.status != AbsenceStatusEnum.pending:
        raise HTTPException(
            status_code=400, detail="This report has already been reviewed."
        )
    current = list(report.attachment_paths or [])
    remaining = [p for p in current if p != path]
    if len(remaining) == len(current):
        raise HTTPException(status_code=404, detail="That file is not on this report.")
    report.attachment_paths = remaining
    report.updated_at = datetime.now(timezone.utc)
    db.add(report)
    db.commit()
    db.refresh(report)
    return AbsenceAttachmentsResponse(
        attachment_paths=list(report.attachment_paths or []),
        max_attachments=MAX_ABSENCE_ATTACHMENTS,
    )


@router.patch("/{report_id}", response_model=AbsenceReportResponse)
def review_absence_report(
    report_id: UUID,
    body: AbsenceReportReview,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Admin accepts or declines; a worker may only withdraw their own report."""
    report = _report_for_caller(db, report_id, current_user)
    staff = _is_staff(current_user)

    if not staff and body.status != AbsenceStatusEnum.withdrawn:
        raise HTTPException(
            status_code=403, detail="Workers can only withdraw their own report"
        )
    if report.status != AbsenceStatusEnum.pending:
        raise HTTPException(
            status_code=409, detail=f"This report is already {report.status.value}."
        )
    if body.status == AbsenceStatusEnum.pending:
        raise HTTPException(status_code=400, detail="Choose a decision")
    if body.status == AbsenceStatusEnum.declined and not (body.admin_note or "").strip():
        raise HTTPException(
            status_code=400, detail="Tell the worker why the report was declined"
        )

    now = datetime.now(timezone.utc)
    report.status = body.status
    report.admin_note = (body.admin_note or "").strip() or None
    report.updated_at = now
    if staff:
        report.reviewed_by = get_admin_user(db, current_user).id
        report.reviewed_at = now

    shift_cancelled = False
    if (
        body.status == AbsenceStatusEnum.accepted
        and body.cancel_shift
        and report.shift_id
    ):
        shift = db.get(Shift, report.shift_id)
        if shift and shift.status != ShiftStatusEnum.cancelled:
            shift.status = ShiftStatusEnum.cancelled
            release_rdp_for_cancelled_shift(db, shift, commit=False)
            db.add(shift)
            shift_cancelled = True

    if staff:
        _notify_worker_of_decision(db, report, shift_cancelled=shift_cancelled)

    db.add(report)
    db.commit()
    db.refresh(report)
    return _to_response(db, report)


def _notify_worker_of_decision(
    db: Session, report: AbsenceReport, *, shift_cancelled: bool
) -> None:
    """Tell the worker the outcome through the inbox they already have.

    Riding on the existing Notification table is why the worker's notifications
    page needs no changes for this feature — same trick session evidence uses.
    """
    accepted = report.status == AbsenceStatusEnum.accepted
    when = report.absence_start.strftime("%d %b %Y")
    if accepted:
        message = f"Your absence report for {when} was accepted."
        if shift_cancelled:
            message += " The shift has been cancelled for you."
    else:
        message = f"Your absence report for {when} was declined."
    if report.admin_note:
        message += f" Admin note: {report.admin_note}"

    db.add(
        Notification(
            sender_admin_id=report.reviewed_by,
            title="Absence report accepted" if accepted else "Absence report declined",
            message=message,
            category="absence",
            target_type="specific",
            target_worker_id=report.worker_id,
        )
    )
