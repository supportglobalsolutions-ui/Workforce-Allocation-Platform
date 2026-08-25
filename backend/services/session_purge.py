"""Controlled purge of work sessions (and dependents needed to free FKs)."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete, update as sa_update
from sqlmodel import Session, select

from models.enums import RdpStatusEnum
from models.payroll import PayrollLineItem
from models.post_mvp import SessionTicket
from models.quality import QualityIndicatorRating
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession


def _is_active(session: WorkSession) -> bool:
    return session.end_time is None


def purge_sessions(
    db: Session,
    session_ids: list[UUID],
    *,
    allow_active: bool = False,
) -> dict:
    """
    Delete finished sessions. Removes payroll line items tied to those sessions,
    unlinks quality ratings, removes tickets, then deletes the session rows.
    Does not delete workers.
    """
    unique_ids = list(dict.fromkeys(session_ids))
    rows = db.exec(select(WorkSession).where(WorkSession.id.in_(unique_ids))).all()
    found = {r.id: r for r in rows}
    missing = [str(i) for i in unique_ids if i not in found]
    blocked_active = []
    to_delete: list[WorkSession] = []

    for sid in unique_ids:
        row = found.get(sid)
        if not row:
            continue
        if not allow_active and _is_active(row):
            blocked_active.append(str(sid))
            continue
        to_delete.append(row)

    deleted_ids = [r.id for r in to_delete]
    if deleted_ids:
        db.exec(delete(PayrollLineItem).where(PayrollLineItem.session_id.in_(deleted_ids)))
        db.exec(
            sa_update(QualityIndicatorRating)
            .where(QualityIndicatorRating.session_id.in_(deleted_ids))
            .values(session_id=None)
        )
        db.exec(delete(SessionTicket).where(SessionTicket.session_id.in_(deleted_ids)))

        for row in to_delete:
            if row.rdp_resource_id and row.end_time is None:
                resource = db.get(RDPResource, row.rdp_resource_id)
                if resource and resource.status in {RdpStatusEnum.active, RdpStatusEnum.idle}:
                    resource.status = RdpStatusEnum.online_free
                    db.add(resource)

        db.exec(delete(WorkSession).where(WorkSession.id.in_(deleted_ids)))

    db.flush()
    return {
        "deleted": [str(i) for i in deleted_ids],
        "deleted_count": len(deleted_ids),
        "missing": missing,
        "blocked_active": blocked_active,
    }
