"""RDP operational state transitions — PostgreSQL source of truth."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from models.allocation import Allocation
from models.enums import RdpStatusEnum, ShiftStatusEnum
from models.rdp_machine import RDPResource
from models.shift import Shift
from services.firebase_mirror import mirror_rdp_status

logger = logging.getLogger(__name__)

UNCLAIMABLE_STATUSES = frozenset({
    RdpStatusEnum.offline,
    RdpStatusEnum.unhealthy,
    RdpStatusEnum.admin_locked,
    RdpStatusEnum.maintenance,
    RdpStatusEnum.active,
    RdpStatusEnum.idle,
})

CLAIMABLE_STATUSES = frozenset({
    RdpStatusEnum.online_free,
    RdpStatusEnum.assigned,
})

PROTECTED_FROM_HEALTH = frozenset({
    RdpStatusEnum.admin_locked,
    RdpStatusEnum.maintenance,
})

BUSY_WITH_ALLOCATION = frozenset({
    RdpStatusEnum.assigned,
    RdpStatusEnum.active,
    RdpStatusEnum.idle,
})


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def transition_rdp_status(
    db: Session,
    resource: RDPResource,
    new_status: RdpStatusEnum,
    *,
    assigned_worker_id: UUID | None | object = ...,
    mirror: bool = True,
    commit: bool = True,
) -> RDPResource:
    """
    Apply a status change with status_changed_at and optional assigned_worker_id.
    Pass assigned_worker_id=None explicitly to clear the worker.
    Omit assigned_worker_id to leave it unchanged.
    """
    now = utc_now()
    resource.status = new_status
    resource.status_changed_at = now
    if assigned_worker_id is not ...:
        resource.assigned_worker_id = assigned_worker_id  # type: ignore[assignment]
    db.add(resource)
    if commit:
        db.commit()
        db.refresh(resource)
        if mirror:
            mirror_rdp_status(resource)
    return resource


def assign_rdp_for_approved_shift(db: Session, shift: Shift, *, commit: bool = False) -> None:
    """When a shift is approved with an RDP, reserve the machine for that worker."""
    if shift.status != ShiftStatusEnum.approved or not shift.rdp_resource_id:
        return

    resource = db.get(RDPResource, shift.rdp_resource_id)
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Shift references an RDP resource that does not exist",
        )

    if resource.status != RdpStatusEnum.online_free:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"RDP {resource.nickname} is not available for assignment (status={resource.status.value})",
        )

    open_alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if open_alloc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"RDP {resource.nickname} has an open allocation",
        )

    transition_rdp_status(
        db,
        resource,
        RdpStatusEnum.assigned,
        assigned_worker_id=shift.worker_id,
        mirror=False,
        commit=commit,
    )


def find_claimable_shift(
    db: Session,
    *,
    worker_id: UUID,
    rdp_id: UUID,
    shift_id: UUID | None,
    now: datetime | None = None,
) -> Shift | None:
    """Return an approved shift that authorizes claim, or None if direct claim allowed."""
    now = now or utc_now()
    stmt = select(Shift).where(
        Shift.worker_id == worker_id,
        Shift.rdp_resource_id == rdp_id,
        Shift.status == ShiftStatusEnum.approved,
    )
    if shift_id:
        stmt = stmt.where(Shift.id == shift_id)
    shifts = db.exec(stmt).all()
    for shift in shifts:
        start = _normalize_dt(shift.scheduled_start)
        end = _normalize_dt(shift.scheduled_end)
        if start <= now <= end:
            return shift
    return None


def validate_worker_may_claim(
    db: Session,
    resource: RDPResource,
    worker_id: UUID,
    *,
    shift_id: UUID | None = None,
) -> Shift | None:
    """
    Raise HTTPException if worker cannot claim. Returns matched shift when assigned flow.
    """
    if resource.status in UNCLAIMABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"RDP resource is not claimable (status={resource.status.value})",
        )

    if resource.status == RdpStatusEnum.online_free:
        return None

    if resource.status == RdpStatusEnum.assigned:
        if resource.assigned_worker_id != worker_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This machine is assigned to another worker",
            )
        shift = find_claimable_shift(
            db, worker_id=worker_id, rdp_id=resource.id, shift_id=shift_id
        )
        if not shift:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No approved shift window is active for this machine",
            )
        return shift

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"RDP resource is not claimable (status={resource.status.value})",
    )


def resume_active_from_heartbeat(db: Session, rdp_id: UUID, *, commit: bool = True) -> None:
    """If machine was idle, mark active again when heartbeat arrives."""
    resource = db.get(RDPResource, rdp_id)
    if resource and resource.status == RdpStatusEnum.idle:
        transition_rdp_status(db, resource, RdpStatusEnum.active, commit=commit)
