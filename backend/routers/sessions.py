from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

import redis as redis_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field as PydField
from sqlalchemy import or_
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from core.redis import get_redis
from models.enums import RdpStatusEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from schemas.session import (
    SessionCreate,
    SessionEvidenceUpdate,
    SessionResponse,
    SessionUpdate,
    WorkerHoursTotalsResponse,
)
from core.security_validation import validate_session_image_url
from services.admin_otp import (
    PURPOSE_DELETE_SESSIONS,
    bulk_delete_target_id,
    issue_otp,
    verify_otp,
)
from services.audit_service import record_audit
from services.email_resend import render_otp_html, render_otp_text
from services.rdp_state import resume_active_from_heartbeat
from services.security_risk import (
    BULK_HARD_MAX,
    BULK_OTP_THRESHOLD,
    after_destructive_bulk,
)
from services.session_evidence import (
    apply_image_duration,
    clear_evidence_reminders,
    evidence_complete,
    notify_evidence_incomplete,
)
from services.session_purge import purge_sessions
from services.payroll_engine import on_session_hours_changed
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


class SessionBulkDeleteRequest(BaseModel):
    session_ids: list[UUID] = PydField(min_length=1)


class SessionBulkDeleteConfirm(BaseModel):
    session_ids: list[UUID] = PydField(min_length=1)
    challenge_id: UUID | None = None
    code: str | None = None


def _normalize_session_ids(ids: list[UUID]) -> list[UUID]:
    unique = list(dict.fromkeys(ids))
    if not unique:
        raise HTTPException(status_code=400, detail="Select at least one session.")
    if len(unique) > BULK_HARD_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete more than {BULK_HARD_MAX} sessions at once.",
        )
    return unique


def _session_response(session: WorkSession) -> SessionResponse:
    resp = SessionResponse.model_validate(session)
    resp.evidence_complete = evidence_complete(session)
    return resp


def _scoped_stmt(current_user: dict, db: Session):
    stmt = select(WorkSession)
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        stmt = stmt.where(WorkSession.worker_id == worker.id)
    return stmt


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    session_type: Optional[str] = Query(None, alias="type"),
    worker_id: Optional[UUID] = Query(None),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    started_before: Optional[datetime] = Query(None),
    ended_after: Optional[datetime] = Query(None),
    include_images: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _scoped_stmt(current_user, db)
    if session_type:
        stmt = stmt.where(WorkSession.session_type == session_type)
    if worker_id and current_user.get("role") in {"admin", "super_admin"}:
        stmt = stmt.where(WorkSession.worker_id == worker_id)
    if started_before:
        stmt = stmt.where(WorkSession.start_time < started_before)
    if ended_after:
        stmt = stmt.where(
            or_(WorkSession.end_time.is_(None), WorkSession.end_time > ended_after)
        )
    stmt = stmt.order_by(WorkSession.start_time.desc(), WorkSession.id.desc()).offset(offset).limit(limit)
    sessions = db.exec(stmt).all()
    if not include_images:
        for s in sessions:
            s.start_image_url = None
            s.end_image_url = None
    return [_session_response(s) for s in sessions]


@router.post("/delete/request-otp")
def request_sessions_delete_otp(
    body: SessionBulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    ids = _normalize_session_ids(body.session_ids)
    if len(ids) <= BULK_OTP_THRESHOLD:
        raise HTTPException(
            status_code=400,
            detail=f"OTP is only required when deleting more than {BULK_OTP_THRESHOLD} sessions.",
        )
    admin = get_admin_user(db, current_user)
    target = bulk_delete_target_id(PURPOSE_DELETE_SESSIONS, ids)
    html = render_otp_html(
        title="Confirm session deletion",
        intro=(
            f"An administrator asked to permanently delete <strong>{len(ids)}</strong> sessions. "
            "Enter this code in the platform to continue."
        ),
        warning="This cannot be undone. Payroll line items tied to these sessions will be removed.",
    )
    text = render_otp_text(
        title="Confirm session deletion",
        intro=f"An administrator asked to permanently delete {len(ids)} sessions.",
        warning="This cannot be undone.",
    )
    payload = issue_otp(
        db,
        purpose=PURPOSE_DELETE_SESSIONS,
        target_id=target,
        subject=f"Confirmation code — delete {len(ids)} sessions",
        html=html,
        text=text,
        admin=admin,
    )
    payload["count"] = len(ids)
    return payload


@router.post("/delete/confirm")
def confirm_sessions_delete(
    body: SessionBulkDeleteConfirm,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    ids = _normalize_session_ids(body.session_ids)
    admin = get_admin_user(db, current_user)

    if len(ids) > BULK_OTP_THRESHOLD:
        if not body.challenge_id or not body.code:
            raise HTTPException(status_code=400, detail="Confirmation code is required for this delete.")
        verify_otp(
            db,
            challenge_id=body.challenge_id,
            purpose=PURPOSE_DELETE_SESSIONS,
            target_id=bulk_delete_target_id(PURPOSE_DELETE_SESSIONS, ids),
            code=body.code,
        )

    result = purge_sessions(db, ids, allow_active=False)
    deleted_ids = [UUID(s) for s in result["deleted"]]

    record_audit(
        db,
        actor_id=admin.id,
        action="sessions.bulk_deleted",
        target_type="session",
        target_id=admin.id,
        previous_value=result,
        reason_note=f"Deleted {result['deleted_count']} session(s)",
    )
    after_destructive_bulk(
        db,
        admin_user_id=admin.id,
        admin_email=admin.email,
        kind="sessions",
        count=result["deleted_count"],
        ids=deleted_ids,
    )
    db.commit()
    return result


@router.get("/my-hours", response_model=WorkerHoursTotalsResponse)
def my_session_hours(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Per-session hours + total for the current worker."""
    worker = get_worker_for_user(db, current_user)
    sessions = db.exec(
        select(WorkSession)
        .where(WorkSession.worker_id == worker.id, WorkSession.end_time.is_not(None))
        .order_by(WorkSession.start_time.desc())
        .limit(200)
    ).all()
    total_minutes = sum(s.duration_minutes or 0 for s in sessions)
    return WorkerHoursTotalsResponse(
        total_minutes=total_minutes,
        total_hours=(Decimal(total_minutes) / Decimal(60)).quantize(Decimal("0.01")),
        sessions=[_session_response(s) for s in sessions],
    )


@router.get("/incomplete-evidence", response_model=list[SessionResponse])
def incomplete_evidence_sessions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    sessions = db.exec(
        select(WorkSession)
        .where(WorkSession.worker_id == worker.id, WorkSession.end_time.is_not(None))
        .order_by(WorkSession.start_time.desc())
        .limit(100)
    ).all()
    return [_session_response(s) for s in sessions if not evidence_complete(s)]


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _scoped_stmt(current_user, db).where(WorkSession.id == session_id)
    session = db.exec(stmt).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return _session_response(session)


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    body: SessionCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        if body.worker_id != worker.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers may only create sessions for themselves",
            )

    session = WorkSession(**body.model_dump())
    if session.end_time and not session.duration_minutes:
        session.duration_minutes = max(
            0, int((session.end_time - session.start_time).total_seconds() // 60)
        )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.patch("/{session_id}/evidence", response_model=SessionResponse)
def submit_session_evidence(
    session_id: UUID,
    body: SessionEvidenceUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Worker submits on-image start/end times; duration is computed from those times."""
    if current_user.get("role") in {"admin", "super_admin"}:
        session = db.exec(select(WorkSession).where(WorkSession.id == session_id)).first()
    else:
        worker = get_worker_for_user(db, current_user)
        session = db.exec(
            select(WorkSession).where(
                WorkSession.id == session_id,
                WorkSession.worker_id == worker.id,
            )
        ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(session, key, value)

    if not session.image_start_at or not session.image_end_at:
        raise HTTPException(
            status_code=400,
            detail="Start time and stop / end time are required for every session.",
        )

    start = session.image_start_at
    end = session.image_end_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if end <= start:
        raise HTTPException(status_code=400, detail="Stop / end time must be after start time.")

    apply_image_duration(session)
    clear_evidence_reminders(db, session)
    db.add(session)
    db.flush()
    on_session_hours_changed(db, session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.patch("/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: UUID,
    body: SessionUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") in {"admin", "super_admin"}:
        session = db.exec(select(WorkSession).where(WorkSession.id == session_id)).first()
    else:
        worker = get_worker_for_user(db, current_user)
        session = db.exec(
            select(WorkSession).where(
                WorkSession.id == session_id,
                WorkSession.worker_id == worker.id,
            )
        ).first()

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if current_user.get("role") not in {"admin", "super_admin"}:
        restricted = {"payroll_approval_state", "payroll_period_id", "admin_notes"}
        if restricted & body.model_dump(exclude_unset=True).keys():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workers cannot update payroll or admin fields",
            )

    updates = body.model_dump(exclude_unset=True)
    for field in ("start_image_url", "end_image_url"):
        if field in updates and updates[field] is not None:
            try:
                updates[field] = validate_session_image_url(updates[field])
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
    apply_update(session, SessionUpdate(**updates))
    # Prefer image-based duration when both times exist.
    apply_image_duration(session)
    if evidence_complete(session):
        clear_evidence_reminders(db, session)
    elif session.end_time is not None:
        notify_evidence_incomplete(db, session)
    db.add(session)
    db.flush()
    on_session_hours_changed(db, session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


@router.post("/{session_id}/heartbeat", response_model=SessionResponse)
def heartbeat_session(
    session_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    stmt = _scoped_stmt(current_user, db).where(WorkSession.id == session_id)
    session = db.exec(stmt).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    now = datetime.utcnow()
    fields = dict(session.type_specific_fields or {})
    fields["last_heartbeat_at"] = now.isoformat()
    session.type_specific_fields = fields

    rdp_was_idle = False
    if session.rdp_resource_id and session.end_time is None:
        rdp = db.get(RDPResource, session.rdp_resource_id)
        rdp_was_idle = rdp is not None and rdp.status == RdpStatusEnum.idle

    db.add(session)
    db.commit()
    db.refresh(session)

    redis_client.set(f"heartbeat:session:{session_id}", now.isoformat(), ex=3600)
    if session.end_time is None:
        if rdp_was_idle and session.rdp_resource_id:
            resume_active_from_heartbeat(db, session.rdp_resource_id)
    return _session_response(session)
