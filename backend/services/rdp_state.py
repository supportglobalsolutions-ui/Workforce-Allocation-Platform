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
from models.rdp_machine import RDPResource, RDPResourceWorker
from models.shift import Shift

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
        commit=commit,
    )


def release_rdp_for_cancelled_shift(db: Session, shift: Shift, *, commit: bool = False) -> bool:
    """Hand back a machine that was only ever *reserved* for a cancelled shift.

    The mirror of :func:`assign_rdp_for_approved_shift`, and deliberately just
    as narrow: it frees the resource only when it is still sitting in
    ``assigned`` for this worker with no open allocation. A machine that has
    moved on to active/idle is being worked on right now, so releasing it from
    here would pull the rug out from under a live session — that case is left
    to the normal allocation lifecycle and stays visible to the admin.

    Returns True when the machine was actually freed.
    """
    if not shift.rdp_resource_id:
        return False

    resource = db.get(RDPResource, shift.rdp_resource_id)
    if not resource or resource.status != RdpStatusEnum.assigned:
        return False
    if resource.assigned_worker_id != shift.worker_id:
        return False

    open_alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if open_alloc:
        return False

    transition_rdp_status(
        db,
        resource,
        RdpStatusEnum.online_free,
        assigned_worker_id=None,
        commit=commit,
    )
    return True


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
    viewer_role: str | None = None,
) -> Shift | None:
    """
    Raise HTTPException if worker cannot claim. Returns matched shift when assigned flow.
    """
    from core.permissions import STAFF_ROLES
    from services.rdp_day_budget import assert_reservation_allows_claim

    is_staff = viewer_role in STAFF_ROLES

    if resource.status == RdpStatusEnum.maintenance:
        # Quarantine / unconfirmed-close hold — never leak status enum names.
        from services.rdp_quarantine import WORKER_CHECKED_MESSAGE

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=WORKER_CHECKED_MESSAGE,
        )

    if resource.status in UNCLAIMABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"RDP resource is not claimable (status={resource.status.value})",
        )

    # Active claim schedule locks the seat to one worker (staff may override).
    assert_reservation_allows_claim(
        db, resource, worker_id, is_staff=is_staff
    )

    if resource.status == RdpStatusEnum.online_free:
        return None

    if resource.status == RdpStatusEnum.assigned:
        if resource.assigned_worker_id != worker_id and not is_staff:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This machine is assigned to another worker",
            )
        if is_staff and resource.assigned_worker_id != worker_id:
            return None
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


def worker_may_see_resource(
    db: Session,
    resource: RDPResource,
    worker_id: UUID,
) -> bool:
    """Workers see machines they are marked on, hold, or are scheduled onto."""
    if resource.assigned_worker_id == worker_id:
        return True
    marked = db.exec(
        select(RDPResourceWorker.worker_id).where(
            RDPResourceWorker.rdp_resource_id == resource.id,
            RDPResourceWorker.worker_id == worker_id,
        ).limit(1)
    ).first()
    if marked:
        return True
    open_alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.worker_id == worker_id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if open_alloc:
        return True
    shift = db.exec(
        select(Shift.id).where(
            Shift.worker_id == worker_id,
            Shift.rdp_resource_id == resource.id,
            Shift.status == ShiftStatusEnum.approved,
        ).limit(1)
    ).first()
    return shift is not None


def list_visible_rdp_resources(
    db: Session,
    *,
    viewer: dict,
    viewer_worker_id: UUID | None,
) -> list[RDPResource]:
    """Staff see every machine; workers see only assigned / held / scheduled."""
    from core.permissions import STAFF_ROLES

    all_rows = db.exec(select(RDPResource).order_by(RDPResource.nickname)).all()
    if viewer.get("role") in STAFF_ROLES:
        return list(all_rows)
    if not viewer_worker_id:
        return []
    # One query for the marked machines, so the common case skips the
    # per-row allocation and shift lookups below it.
    marked_ids = set(
        db.exec(
            select(RDPResourceWorker.rdp_resource_id).where(
                RDPResourceWorker.worker_id == viewer_worker_id
            )
        ).all()
    )
    return [
        r for r in all_rows
        if r.id in marked_ids or worker_may_see_resource(db, r, viewer_worker_id)
    ]


def require_worker_visible_or_staff(
    db: Session,
    resource: RDPResource,
    *,
    viewer: dict,
    viewer_worker_id: UUID | None,
) -> None:
    """Non-disclosing 404 when a worker probes a machine they cannot see."""
    from core.permissions import STAFF_ROLES

    if viewer.get("role") in STAFF_ROLES:
        return
    if viewer_worker_id and worker_may_see_resource(db, resource, viewer_worker_id):
        return
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="This desktop is no longer available. Return to your desktops.",
    )
