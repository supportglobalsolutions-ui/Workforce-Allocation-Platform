from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.audit_log import AuditLog
from schemas.audit_log import AuditLogResponse

router = APIRouter()


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    action: str | None = None,
    target_type: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if target_type:
        stmt = stmt.where(AuditLog.target_type == target_type)
    return db.exec(stmt.order_by(AuditLog.created_at.desc()).limit(limit)).all()


@router.get("/{entry_id}", response_model=AuditLogResponse)
def get_audit_log(
    entry_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    entry = db.exec(select(AuditLog).where(AuditLog.id == entry_id)).first()
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Audit log entry not found")
    return entry


@router.post("", status_code=status.HTTP_405_METHOD_NOT_ALLOWED)
def create_audit_log_forbidden():
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Audit log is append-only. Events are recorded by the server, not by API clients.",
    )


@router.patch("/{entry_id}", status_code=status.HTTP_405_METHOD_NOT_ALLOWED)
def update_audit_log_forbidden(entry_id: UUID):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Audit log entries cannot be changed.",
    )


@router.delete("/{entry_id}", status_code=status.HTTP_405_METHOD_NOT_ALLOWED)
def delete_audit_log_forbidden(entry_id: UUID):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail="Audit log entries cannot be deleted.",
    )
