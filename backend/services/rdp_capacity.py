"""
Seat accounting for the live-session cap (Phase 3 Action 5).

`RDP_MAX_LIVE_SESSIONS` exists to stop a small box being asked to run more
desktops than its RAM allows — each live desktop is ~30–50 MB in guacd plus
CPU. The cap is only as good as the count behind it, and "how many desktops are
really running" is not the same question as "how many allocations are open".

Two things occupy a seat:

**Open allocations.** Including ones inside their 5-minute disconnect grace:
the allocation is not released, the seat is being held *for* the returning
worker, and freeing it would let someone else take the chair they are coming
back to (§1.6).

**Held machines.** A machine put out of service because a closure could not be
confirmed (Phase 3 Action 3) has an *ended* allocation — the worker left — but
the whole reason it is held is that a tunnel **may still be live** on the
gateway, consuming the same RAM. Counting only open allocations would declare
that seat free and admit someone onto a box that is already full. On a 6-seat
cap, a couple of held machines is the difference between fitting and an OOM.
"""
from __future__ import annotations

import logging
from uuid import UUID

from sqlmodel import Session, select

from core.config import settings
from models.allocation import Allocation
from models.enums import RdpStatusEnum
from models.rdp_machine import RDPResource

logger = logging.getLogger(__name__)


def open_allocation_count(db: Session) -> int:
    """Allocations nobody has released, grace included."""
    return len(db.exec(select(Allocation).where(Allocation.released_at.is_(None))).all())


def held_machine_ids(db: Session) -> set[UUID]:
    """
    Machines out of service after an unconfirmed close.

    Identified by the pair of facts that define the state: the machine is in
    `maintenance`, and some allocation of it carries a quarantine stamp. A
    machine an admin put into maintenance by hand has no such stamp and is not
    counted — it is deliberately offline, not secretly occupied.
    """
    stamped = db.exec(
        select(Allocation.rdp_resource_id).where(Allocation.quarantined_at.is_not(None))
    ).all()
    if not stamped:
        return set()

    candidates = {row if not isinstance(row, tuple) else row[0] for row in stamped}
    held: set[UUID] = set()
    for rdp_id in candidates:
        resource = db.get(RDPResource, rdp_id)
        if resource is not None and resource.status == RdpStatusEnum.maintenance:
            held.add(rdp_id)
    return held


def occupied_seats(db: Session) -> int:
    """
    Seats that are not available, for cap purposes.

    A held machine with an open allocation would otherwise be double-counted,
    so held ids that already have an open allocation are not added twice.
    """
    open_ids = {
        row if not isinstance(row, tuple) else row[0]
        for row in db.exec(
            select(Allocation.rdp_resource_id).where(Allocation.released_at.is_(None))
        ).all()
    }
    held = held_machine_ids(db)
    return len(open_ids) + len(held - open_ids)


def at_capacity(db: Session) -> bool:
    return occupied_seats(db) >= max(int(settings.RDP_MAX_LIVE_SESSIONS), 1)


def capacity_snapshot(db: Session) -> dict:
    """
    Operator view of the cap. Makes the number observable, which is what a
    measured load test needs — you cannot size a limit you cannot see.
    """
    cap = max(int(settings.RDP_MAX_LIVE_SESSIONS), 1)
    open_count = open_allocation_count(db)
    held = held_machine_ids(db)
    occupied = occupied_seats(db)

    # Grace is a machine-status property, so count via the resource.
    grace_count = 0
    for row in db.exec(
        select(Allocation.rdp_resource_id).where(Allocation.released_at.is_(None))
    ).all():
        rdp_id = row if not isinstance(row, tuple) else row[0]
        resource = db.get(RDPResource, rdp_id)
        if resource is not None and resource.status == RdpStatusEnum.idle:
            grace_count += 1

    return {
        "cap": cap,
        "occupied": occupied,
        "available": max(cap - occupied, 0),
        "at_capacity": occupied >= cap,
        "open_allocations": open_count,
        "in_grace": grace_count,
        "held_machines": len(held),
        "held_machine_ids": [str(i) for i in sorted(held, key=str)],
        "note": (
            "Held machines occupy a seat: their closure was never confirmed, so a "
            "tunnel may still be running on the gateway."
        ),
    }
