"""RDP claim shifts: a shift booked on one specific RDP.

Normal shifts (kind="shift") are unchanged. A claim shift (kind="rdp_claim")
is requested on the worker's schedule like any shift and approved by an admin.
Once approved it holds that machine for its worker during the shift's hours
only — the machine is not locked ahead of time — and two claim shifts can never
overlap on the same machine.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import Session, select

from models.enums import ShiftStatusEnum
from models.rdp_machine import RDPResource
from models.shift import Shift
from models.worker import Worker

SHIFT_KIND = "shift"
CLAIM_KIND = "rdp_claim"
SHIFT_KINDS = (SHIFT_KIND, CLAIM_KIND)

# Pending requests already count, so two workers can't both ask for the same slot.
_HOLDING = (ShiftStatusEnum.pending, ShiftStatusEnum.approved)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def overlapping_claim_shift(
    db: Session,
    rdp_id: UUID,
    start: datetime,
    end: datetime,
    *,
    exclude_id: Optional[UUID] = None,
) -> Optional[Shift]:
    stmt = select(Shift).where(
        Shift.kind == CLAIM_KIND,
        Shift.rdp_resource_id == rdp_id,
        Shift.status.in_(_HOLDING),
        Shift.scheduled_start < end,
        Shift.scheduled_end > start,
    )
    if exclude_id:
        stmt = stmt.where(Shift.id != exclude_id)
    return db.exec(stmt).first()


def validate_claim_shift(
    db: Session,
    *,
    rdp_id: Optional[UUID],
    start: datetime,
    end: datetime,
    worker_visible: Optional[callable] = None,
    exclude_id: Optional[UUID] = None,
) -> RDPResource:
    """Raise a worker-facing HTTPException unless this claim shift can be booked."""
    if not rdp_id:
        raise HTTPException(status_code=400, detail="Choose an RDP for each RDP claim shift.")
    resource = db.get(RDPResource, rdp_id)
    if not resource:
        raise HTTPException(status_code=404, detail="That RDP no longer exists.")
    if worker_visible is not None and not worker_visible(resource):
        raise HTTPException(status_code=403, detail=f"{resource.nickname} is not available to you.")
    clash = overlapping_claim_shift(db, rdp_id, _aware(start), _aware(end), exclude_id=exclude_id)
    if clash:
        holder = db.get(Worker, clash.worker_id)
        who = holder.display_name if holder else "another worker"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{resource.nickname} is already booked by {who} from "
                f"{_aware(clash.scheduled_start):%d %b %H:%M} to {_aware(clash.scheduled_end):%H:%M} (UTC). "
                "Pick another time or RDP."
            ),
        )
    return resource


def active_claim_shift(db: Session, rdp_id: UUID, now: Optional[datetime] = None) -> Optional[Shift]:
    """The approved claim shift holding this machine right now, if any."""
    now = now or datetime.now(timezone.utc)
    return db.exec(
        select(Shift).where(
            Shift.kind == CLAIM_KIND,
            Shift.rdp_resource_id == rdp_id,
            Shift.status == ShiftStatusEnum.approved,
            Shift.scheduled_start <= now,
            Shift.scheduled_end > now,
        )
    ).first()


def assert_claim_shift_allows_claim(
    db: Session, resource: RDPResource, worker_id: UUID, *, is_staff: bool
) -> None:
    """Block other workers while an approved claim shift holds this machine."""
    holding = active_claim_shift(db, resource.id)
    if not holding or is_staff or holding.worker_id == worker_id:
        return
    holder = db.get(Worker, holding.worker_id)
    who = holder.display_name if holder else "another worker"
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"This desktop is booked for {who} until {_aware(holding.scheduled_end):%H:%M} (UTC).",
    )
