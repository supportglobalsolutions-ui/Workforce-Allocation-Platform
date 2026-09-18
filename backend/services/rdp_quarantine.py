"""
The defined exit from "unknown" (Phase 8 Action 2).

`close_and_confirm` refuses to report success while a tunnel might still be
live — correct, and the reason a machine is never handed to the next worker on
top of someone else's session. But until now that caution had no exit: the API
answered 503, the allocation stayed `ending`, and a control↔media partition
could strand a machine indefinitely with nothing surfacing it.

Quarantine is that exit. It is deliberately **not** a release:

  * the machine is held out of service, so nobody inherits a live tunnel;
  * it is not counted as free, so capacity stays honest;
  * it is visible to admins with the reason, and repairable in one click.

An allocation reaches it by sitting in `ending` for longer than
`RDP_ENDING_ESCALATE_SECONDS`, and leaves it either by a successful repair
(closure finally confirmed → released) or by an admin force-releasing it in
full knowledge of what that means.
"""
from __future__ import annotations

import logging
from datetime import timedelta, timezone
from uuid import UUID

import redis as redis_lib
from sqlmodel import Session, select

from core.config import settings

# Calm worker-facing copy. Claim board, viewer error map, and API details all
# use this exact sentence so FRIENDLY_RULES can match it.
WORKER_CHECKED_MESSAGE = "This desktop is being checked by an admin"
from models.allocation import Allocation
from models.enums import AllocationLifecycleEnum, RdpStatusEnum
from models.rdp_machine import RDPResource
from services.rdp_state import utc_now

logger = logging.getLogger(__name__)

MAX_REASON_LENGTH = 300


def _as_utc(value):
    """Postgres can hand back naive datetimes; comparisons need them aware."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


# Outcomes of judging one stuck-in-`ending` allocation.
ENDING_ESCALATE = "escalate"      # past the deadline — quarantine it
ENDING_WAIT = "wait"              # inside the window — give the blip a chance
ENDING_NEEDS_STAMP = "needs_stamp"  # no clock yet — start one, decide later


def classify_ending(alloc, deadline) -> str:
    """
    How long has this allocation been trying to close, and does that matter yet?

    Measured from `last_gateway_observation_at`, which the disconnect path
    stamps when the allocation *enters* `ending`. Using the resource's
    `status_changed_at` instead would read the moment the session went active —
    usually hours earlier — and quarantine on the first tick, skipping the
    window that exists so a transient gateway failure can resolve itself.
    """
    entered_ending = _as_utc(getattr(alloc, "last_gateway_observation_at", None))
    if entered_ending is None:
        return ENDING_NEEDS_STAMP
    return ENDING_WAIT if entered_ending > deadline else ENDING_ESCALATE


def hold_machine_unconfirmed(
    db: Session,
    resource: RDPResource,
    allocations: list,
    *,
    reason: str,
    now=None,
) -> None:
    """
    Hold a *machine* while freeing the *worker* (Phase 3 Action 3).

    Used when a worker ends a session and Guacamole cannot prove the tunnel is
    gone. The two requirements in tension — never trap a worker, never reuse an
    unconfirmed machine — are separable, and this is the separation:

      * the caller has already ended the allocation, so the worker may claim
        another desktop immediately;
      * the machine goes to `maintenance`, out of the claimable pool, with the
        reason stamped on the (now ended) allocation so admins can see why.

    The quarantine stamp lives on the allocation even though it is released —
    that is what `list_held_machines` joins on, and it keeps the audit trail
    attached to the session that caused the hold.
    """
    stamp = now or utc_now()
    resource.status = RdpStatusEnum.maintenance
    resource.assigned_worker_id = None
    note = f"Held {stamp.isoformat()}: {reason}"
    resource.health_notes = (
        f"{resource.health_notes}\n{note}" if resource.health_notes else note
    )
    db.add(resource)

    for alloc in allocations:
        alloc.quarantined_at = stamp
        alloc.quarantine_reason = reason[:MAX_REASON_LENGTH]
        db.add(alloc)

    from services.audit_service import record_audit

    record_audit(
        db,
        action="rdp.machine_held",
        target_type="rdp_access",
        target_id=resource.id,
        new_value={
            "rdp_nickname": resource.nickname,
            "reason": reason[:MAX_REASON_LENGTH],
            "allocation_ids": [str(a.id) for a in allocations],
            "at": stamp.isoformat(),
        },
    )
    logger.warning(
        "Machine %s held out of service: %s", resource.nickname, reason
    )


def list_held_machines(db: Session) -> list[dict]:
    """
    Machines out of service because a closure was never confirmed.

    Distinct from `list_quarantined`, which covers allocations still open and
    stuck mid-close. These have no open allocation — the worker left cleanly —
    but the machine must not be handed on until someone confirms the tunnel is
    really gone.
    """
    rows = db.exec(
        select(Allocation)
        .where(Allocation.quarantined_at.is_not(None))
        .order_by(Allocation.quarantined_at.desc())
    ).all()

    out: list[dict] = []
    seen: set = set()
    for alloc in rows:
        if alloc.rdp_resource_id in seen:
            continue
        resource = db.get(RDPResource, alloc.rdp_resource_id)
        if resource is None or resource.status != RdpStatusEnum.maintenance:
            continue
        seen.add(alloc.rdp_resource_id)
        out.append(
            {
                "rdp_resource_id": str(resource.id),
                "nickname": resource.nickname,
                "status": resource.status.value,
                "worker_id": str(alloc.worker_id),
                "allocation_id": str(alloc.id),
                "allocation_released": alloc.released_at is not None,
                "held_at": alloc.quarantined_at.isoformat() if alloc.quarantined_at else None,
                "reason": alloc.quarantine_reason,
            }
        )
    return out


def is_quarantine_held(db: Session, rdp_id) -> bool:
    """True while the machine is still maintenance-held after an unconfirmed close."""
    resource = db.get(RDPResource, rdp_id)
    if resource is None or resource.status != RdpStatusEnum.maintenance:
        return False
    held = db.exec(
        select(Allocation)
        .where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.quarantined_at.is_not(None),
        )
        .limit(1)
    ).first()
    return held is not None


def quarantine_allocation(
    db: Session,
    allocation: Allocation,
    *,
    reason: str,
) -> None:
    """Move one allocation into quarantine. Idempotent."""
    if allocation.allocation_status == AllocationLifecycleEnum.quarantined:
        return
    now = utc_now()
    allocation.allocation_status = AllocationLifecycleEnum.quarantined
    allocation.quarantined_at = now
    allocation.quarantine_reason = reason[:MAX_REASON_LENGTH]
    allocation.version = int(allocation.version or 1) + 1
    db.add(allocation)

    resource = db.get(RDPResource, allocation.rdp_resource_id)
    if resource is not None:
        # Held out of service. Not free, not claimable, and not pretending the
        # worker is still connected.
        resource.status = RdpStatusEnum.maintenance
        resource.status_changed_at = now
        resource.version = int(resource.version or 1) + 1
        db.add(resource)

    from services.audit_service import record_audit

    record_audit(
        db,
        action="rdp.quarantined",
        target_type="rdp_access",
        target_id=allocation.rdp_resource_id,
        new_value={
            "allocation_id": str(allocation.id),
            "worker_id": str(allocation.worker_id),
            "connection_generation": int(allocation.connection_generation),
            "reason": allocation.quarantine_reason,
            "at": now.isoformat(),
        },
    )
    db.commit()
    logger.warning(
        "Quarantined allocation %s on %s: %s",
        allocation.id,
        resource.nickname if resource else allocation.rdp_resource_id,
        allocation.quarantine_reason,
    )


def escalate_stuck_endings(db: Session, redis_client: redis_lib.Redis) -> int:
    """
    Quarantine allocations that have been `ending` past the deadline.

    Returns how many were escalated. Callers must already have confirmed that
    releasing actions are allowed — an outage is not a reason to quarantine
    everyone (the tunnels are probably fine; it is our view that is broken).
    """
    deadline = utc_now() - timedelta(
        seconds=max(int(settings.RDP_ENDING_ESCALATE_SECONDS), 10)
    )
    stuck = db.exec(
        select(Allocation).where(
            Allocation.released_at.is_(None),
            Allocation.allocation_status == AllocationLifecycleEnum.ending,
        )
    ).all()

    escalated = 0
    for alloc in stuck:
        verdict = classify_ending(alloc, deadline)
        if verdict == ENDING_WAIT:
            continue
        if verdict == ENDING_NEEDS_STAMP:
            # Row from before the stamp existed. Start its clock now and let a
            # later tick decide, rather than taking a machine out of service on
            # evidence we do not have.
            alloc.last_gateway_observation_at = utc_now()
            db.add(alloc)
            db.commit()
            continue
        quarantine_allocation(
            db,
            alloc,
            reason=(
                "Tunnel closure could not be confirmed within "
                f"{settings.RDP_ENDING_ESCALATE_SECONDS}s — the gateway may be "
                "unreachable. Machine held out of service pending repair."
            ),
        )
        escalated += 1
    return escalated


def repair_quarantined(
    db: Session,
    redis_client: redis_lib.Redis,
    rdp_id: UUID,
    *,
    admin_id: UUID | None = None,
) -> dict:
    """
    Retry the closure that failed, on the allocation's own gateway.

    Success releases the machine properly through the normal disconnect path,
    so audit, work sessions and capacity all unwind exactly as they would have.
    Failure leaves it quarantined with an updated reason — never a silent free.
    """
    from routers.rdp import _close_open_sessions_for_rdp, _record_rdp_logout
    from services.rdp_engine import disconnect

    resource = db.get(RDPResource, rdp_id)
    if resource is None:
        return {"ok": False, "code": "not_found", "friendly": "RDP resource not found"}

    alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if alloc is None:
        # No open allocation. Either nothing was ever wrong, or the machine is
        # *held* after a worker End whose closure we could not prove. Those are
        # different: a held machine must not go back in the pool until the
        # tunnel is confirmed gone, or repair just re-creates the hazard.
        if resource.status != RdpStatusEnum.maintenance:
            return {
                "ok": True,
                "code": "already_clear",
                "friendly": "This desktop was already free.",
                "status": resource.status.value,
            }

        from services.rdp_gateway_cluster import client_for_allocation

        last_held = db.exec(
            select(Allocation)
            .where(
                Allocation.rdp_resource_id == rdp_id,
                Allocation.quarantined_at.is_not(None),
            )
            .order_by(Allocation.quarantined_at.desc())
        ).first()

        outcome = {"outcome": "already_closed"}
        if resource.guacamole_connection_id:
            outcome = client_for_allocation(redis_client, last_held).close_and_confirm(
                str(resource.guacamole_connection_id)
            )
        if outcome.get("outcome") not in {"closed", "already_closed"}:
            return {
                "ok": False,
                "code": "still_unconfirmed",
                "friendly": (
                    "Still cannot confirm the remote connection has closed. "
                    "The desktop stays out of service."
                ),
                "detail": str(outcome),
            }

        resource.status = RdpStatusEnum.online_free
        resource.status_changed_at = utc_now()
        resource.version = int(resource.version or 1) + 1
        db.add(resource)

        from services.audit_service import record_audit

        record_audit(
            db,
            actor_id=admin_id,
            action="rdp.machine_hold_cleared",
            target_type="rdp_access",
            target_id=rdp_id,
            new_value={
                "rdp_nickname": resource.nickname,
                "confirmed": str(outcome.get("outcome")),
                "at": utc_now().isoformat(),
            },
        )
        db.commit()
        return {
            "ok": True,
            "code": "hold_cleared",
            "friendly": "Closure confirmed — desktop returned to service.",
            "status": resource.status.value,
            "disconnect_outcome": str(outcome.get("outcome")),
        }

    was_quarantined = alloc.allocation_status == AllocationLifecycleEnum.quarantined

    # Put it back in `ending` so the disconnect path treats it normally; if the
    # retry fails we re-quarantine below with a fresh reason.
    alloc.allocation_status = AllocationLifecycleEnum.ending
    db.add(alloc)
    db.commit()

    outcome = disconnect(
        db,
        resource,
        redis_client,
        worker_id=None,
        require_owner=False,
        initiated_by="admin",
        admin_id=admin_id,
        close_sessions_fn=_close_open_sessions_for_rdp,
        record_logout_fn=_record_rdp_logout,
    )

    if outcome.ok:
        from services.audit_service import record_audit

        record_audit(
            db,
            actor_id=admin_id,
            action="rdp.quarantine_repaired",
            target_type="rdp_access",
            target_id=rdp_id,
            new_value={
                "allocation_id": str(alloc.id),
                "was_quarantined": was_quarantined,
                "at": utc_now().isoformat(),
            },
        )
        db.commit()
        return {
            "ok": True,
            "code": "repaired",
            "friendly": "Desktop recovered and released.",
            **outcome.data,
        }

    db.refresh(alloc)
    if alloc.released_at is None:
        quarantine_allocation(
            db,
            alloc,
            reason=f"Repair attempt failed: {outcome.friendly}",
        )
    return {
        "ok": False,
        "code": outcome.code,
        "friendly": outcome.friendly,
        "detail": outcome.detail,
    }


def list_quarantined(db: Session) -> list[dict]:
    """Admin view: what is held, why, and since when."""
    rows = db.exec(
        select(Allocation).where(
            Allocation.released_at.is_(None),
            Allocation.allocation_status == AllocationLifecycleEnum.quarantined,
        )
    ).all()
    out: list[dict] = []
    for alloc in rows:
        resource = db.get(RDPResource, alloc.rdp_resource_id)
        out.append(
            {
                "allocation_id": str(alloc.id),
                "rdp_resource_id": str(alloc.rdp_resource_id),
                "nickname": resource.nickname if resource else None,
                "worker_id": str(alloc.worker_id),
                "gateway_id": alloc.gateway_id,
                "connection_generation": int(alloc.connection_generation),
                "quarantined_at": alloc.quarantined_at.isoformat() if alloc.quarantined_at else None,
                "reason": alloc.quarantine_reason,
            }
        )
    return out
