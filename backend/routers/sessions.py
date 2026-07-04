from datetime import datetime
from typing import Optional
from uuid import UUID

import redis as redis_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from core.redis import get_redis
from models.session import Session as WorkSession
from schemas.session import SessionCreate, SessionResponse, SessionUpdate
from services.firebase_mirror import mirror_active_session_by_id
from .deps import apply_update, get_worker_for_user

router = APIRouter()


def _scoped_stmt(current_user: dict, db: Session):
    stmt = select(WorkSession)
    if current_user.get("role") not in {"admin", "super_admin"}:
        worker = get_worker_for_user(db, current_user)
        stmt = stmt.where(WorkSession.worker_id == worker.id)
    return stmt


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    session_type: Optional[str] = Query(None, alias="type"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    stmt = _scoped_stmt(current_user, db)
    if session_type:
        stmt = stmt.where(WorkSession.session_type == session_type)
    stmt = stmt.order_by(WorkSession.start_time.desc()).limit(limit)
    return db.exec(stmt).all()


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
    return session


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
    db.add(session)
    db.commit()
    db.refresh(session)
    if session.end_time is None:
        background_tasks.add_task(mirror_active_session_by_id, session.id)
    return session


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

    apply_update(session, body)
    db.add(session)
    db.commit()
    db.refresh(session)
    background_tasks.add_task(mirror_active_session_by_id, session.id)
    return session


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

    db.add(session)
    db.commit()
    db.refresh(session)

    redis_client.set(f"heartbeat:session:{session_id}", now.isoformat(), ex=3600)
    if session.end_time is None:
        background_tasks.add_task(mirror_active_session_by_id, session.id)
    return session
