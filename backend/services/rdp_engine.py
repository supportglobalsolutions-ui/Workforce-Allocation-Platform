"""RDP link engine — claim / connect / disconnect / force_release sequences.

Routers stay thin: parse request → call engine → shape response.
Every mutating step carries allocation_id + connection_generation so late
actors are no-ops (Phase 4 Principle 8).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import redis as redis_lib
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from core.config import settings
from core.guacamole import GuacamoleClient, raw_connection_id
from models.allocation import Allocation
from models.enums import (
    AllocationLifecycleEnum,
    RdpStatusEnum,
    ReleaseReasonEnum,
    SessionTypeEnum,
    TunnelStatusEnum,
    WorkerStatusEnum,
)
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.training import TrainingModule
from models.worker import Worker
from services.guacamole_provision import GuacamoleProvisionError, sync_connection
from services.rdp_state import utc_now, validate_worker_may_claim

logger = logging.getLogger(__name__)


def _should_restore_assignment(db: Session, resource: RDPResource) -> bool:
    """True when this session started from a standing `assigned` machine."""
    open_sessions = db.exec(
        select(WorkSession).where(
            WorkSession.rdp_resource_id == resource.id,
            WorkSession.end_time.is_(None),
        )
    ).all()
    for work_session in open_sessions:
        fields = work_session.type_specific_fields or {}
        if fields.get("restore_assignment"):
            return True
    return False


@dataclass
class RdpOutcome:
    ok: bool
    code: str
    friendly: str
    detail: str | None = None
    http_status: int = 200
    data: dict[str, Any] = field(default_factory=dict)

    def raise_if_error(self) -> dict[str, Any]:
        if self.ok:
            return self.data
        raise HTTPException(status_code=self.http_status, detail=self.friendly)


def _open_allocation(db: Session, rdp_id: UUID) -> Allocation | None:
    return db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).first()


# Proxy-path ownership of the live desktop WebSocket. Guacamole's
# activeConnections list is often empty while FastAPI is relaying pixels
# (local guacd / shared admin token), so a second tab would otherwise be
# allowed through and hang on Windows' single RDP session. Redis is the
# source of truth for "a tab of ours is already on this machine".
#
# tunnel-epoch changes on every successful connect / Switch here / End so
# a superseded relay can notice within seconds and drop itself — Guacamole
# alone will not tear down our Python proxy when the admin active list is empty.
_TUNNEL_LOCK_TTL_SECONDS = 120


def _tunnel_lock_key(rdp_id: UUID) -> str:
    return f"rdp:tunnel-owner:{rdp_id}"


def _tunnel_epoch_key(rdp_id: UUID) -> str:
    return f"rdp:tunnel-epoch:{rdp_id}"


def _decode_redis(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode()
    return str(value)


def acquire_tunnel_lock(
    redis_client: redis_lib.Redis,
    *,
    rdp_id: UUID,
    allocation_id: UUID,
    connection_generation: int,
    takeover: bool = False,
) -> str | None:
    """Claim the live-tunnel slot. Returns a new epoch, or None if held."""
    import secrets

    key = _tunnel_lock_key(rdp_id)
    value = f"{allocation_id}:{int(connection_generation)}"
    if takeover:
        redis_client.set(key, value, ex=_TUNNEL_LOCK_TTL_SECONDS)
    elif not redis_client.set(key, value, nx=True, ex=_TUNNEL_LOCK_TTL_SECONDS):
        return None
    epoch = f"{allocation_id}:{int(connection_generation)}:{secrets.token_hex(4)}"
    redis_client.set(
        _tunnel_epoch_key(rdp_id), epoch, ex=_TUNNEL_LOCK_TTL_SECONDS
    )
    return epoch


def refresh_tunnel_lock(
    redis_client: redis_lib.Redis,
    *,
    rdp_id: UUID,
    allocation_id: UUID,
    connection_generation: int,
    epoch: str | None = None,
) -> bool:
    """Keep the lock alive while the relay is running. False → we were superseded."""
    lock_key = _tunnel_lock_key(rdp_id)
    value = f"{allocation_id}:{int(connection_generation)}"
    current = _decode_redis(redis_client.get(lock_key))
    if current is not None and current != value:
        return False
    if current is None or current == value:
        redis_client.set(lock_key, value, ex=_TUNNEL_LOCK_TTL_SECONDS)
    if epoch:
        epoch_key = _tunnel_epoch_key(rdp_id)
        live = _decode_redis(redis_client.get(epoch_key))
        if live is not None and live != epoch:
            return False
        if live is None:
            # End/session cleared the epoch — this relay must die.
            return False
        redis_client.set(epoch_key, epoch, ex=_TUNNEL_LOCK_TTL_SECONDS)
    return True


def release_tunnel_lock(
    redis_client: redis_lib.Redis,
    *,
    rdp_id: UUID,
    allocation_id: UUID | None = None,
    connection_generation: int | None = None,
) -> None:
    """Drop the lock when this tab's tunnel ends (generation-aware)."""
    key = _tunnel_lock_key(rdp_id)
    epoch_key = _tunnel_epoch_key(rdp_id)
    if allocation_id is None or connection_generation is None:
        redis_client.delete(key)
        redis_client.delete(epoch_key)
        return
    value = f"{allocation_id}:{int(connection_generation)}"
    current = _decode_redis(redis_client.get(key))
    if current is None or current == value:
        redis_client.delete(key)
        redis_client.delete(epoch_key)


def tunnel_lock_held(redis_client: redis_lib.Redis, *, rdp_id: UUID) -> bool:
    return bool(redis_client.exists(_tunnel_lock_key(rdp_id)))


def tunnel_epoch_matches(
    redis_client: redis_lib.Redis, *, rdp_id: UUID, epoch: str
) -> bool:
    live = _decode_redis(redis_client.get(_tunnel_epoch_key(rdp_id)))
    return live is not None and live == epoch


def _bump_allocation_version(alloc: Allocation) -> None:
    alloc.version = int(alloc.version or 1) + 1


def _mark_allocation_ended(
    alloc: Allocation,
    *,
    reason: ReleaseReasonEnum,
    now,
) -> None:
    alloc.released_at = now
    alloc.release_reason = reason
    alloc.allocation_status = AllocationLifecycleEnum.ended
    alloc.tunnel_status = TunnelStatusEnum.none
    alloc.ended_at = now
    _bump_allocation_version(alloc)


def generation_matches(
    alloc: Allocation,
    *,
    allocation_id: UUID | None,
    connection_generation: int | None,
) -> bool:
    """Late actors must be harmless when either id or generation has moved on."""
    if allocation_id is not None and alloc.id != allocation_id:
        return False
    if connection_generation is not None and int(alloc.connection_generation) != int(
        connection_generation
    ):
        return False
    return True


def claim(
    db: Session,
    redis_client: redis_lib.Redis,
    *,
    worker: Worker,
    resource: RDPResource,
    shift_id: UUID | None = None,
    repair_fn,
    preflight_fn,
    resume_fn,
    record_login_fn,
    request_ip: str | None = None,
    viewer_role: str | None = None,
) -> RdpOutcome:
    """Eligibility → preflight → capacity → Redis lock → allocation + session."""
    from core.permissions import STAFF_ROLES

    has_mandatory_training = (
        db.exec(
            select(TrainingModule.id)
            .where(
                TrainingModule.is_active.is_(True),
                TrainingModule.is_mandatory_for_new_workers.is_(True),
            )
            .limit(1)
        ).first()
        is not None
    )
    # Staff claim for support / ops — training gate is for real workers only.
    staff_claim = viewer_role in STAFF_ROLES

    if has_mandatory_training and not worker.work_ready and not staff_claim:
        return RdpOutcome(
            ok=False,
            code="not_work_ready",
            friendly="Complete your onboarding training first — an admin must clear you to start work.",
            http_status=status.HTTP_403_FORBIDDEN,
        )
    if worker.status != WorkerStatusEnum.active:
        return RdpOutcome(
            ok=False,
            code="worker_inactive",
            friendly=(
                f"Your worker status is {worker.status.value} — "
                "you cannot claim machines until an admin sets you to active."
            ),
            http_status=status.HTTP_403_FORBIDDEN,
        )

    open_on_this = repair_fn(db, resource)
    if open_on_this:
        if open_on_this.worker_id == worker.id:
            data = resume_fn(
                db,
                redis_client,
                resource=resource,
                allocation=open_on_this,
                worker_id=worker.id,
            )
            data["connection_generation"] = int(open_on_this.connection_generation)
            data["allocation_id"] = str(open_on_this.id)
            return RdpOutcome(ok=True, code="resumed", friendly="Session resumed.", data=data)
        return RdpOutcome(
            ok=False,
            code="busy",
            friendly="This machine is in use by another worker",
            http_status=status.HTTP_409_CONFLICT,
        )

    other_open = db.exec(
        select(Allocation).where(
            Allocation.worker_id == worker.id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if other_open:
        other_resource = db.get(RDPResource, other_open.rdp_resource_id)
        name = other_resource.nickname if other_resource else str(other_open.rdp_resource_id)
        return RdpOutcome(
            ok=False,
            code="already_holding",
            friendly=f"You already have an open session on {name}. End that connection first.",
            http_status=status.HTTP_409_CONFLICT,
        )

    try:
        approved_shift = validate_worker_may_claim(
            db, resource, worker.id, shift_id=shift_id
        )
    except HTTPException as exc:
        return RdpOutcome(
            ok=False,
            code="not_eligible",
            friendly=str(exc.detail),
            http_status=exc.status_code,
        )
    if approved_shift:
        shift_id = approved_shift.id

    preflight = preflight_fn(resource)
    if not preflight["ok"]:
        return RdpOutcome(
            ok=False,
            code="unreachable",
            friendly=preflight["error"] or "This machine is not responding.",
            http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )
    if resource.guacamole_connection_id != preflight["guacamole_connection_id"]:
        resource.guacamole_connection_id = preflight["guacamole_connection_id"]
        db.add(resource)
        db.commit()
        db.refresh(resource)

    lock_key = f"lock:rdp:{resource.id}"
    acquired = redis_client.set(lock_key, "1", ex=30, nx=True)
    if not acquired:
        return RdpOutcome(
            ok=False,
            code="claim_race",
            friendly="RDP resource is currently being claimed — try again in a moment",
            http_status=status.HTTP_409_CONFLICT,
        )

    capacity_lock_key = "lock:rdp:capacity"
    capacity_acquired = redis_client.set(capacity_lock_key, "1", ex=30, nx=True)
    if not capacity_acquired:
        redis_client.delete(lock_key)
        return RdpOutcome(
            ok=False,
            code="capacity_busy",
            friendly="RDP capacity is being checked — try again in a moment",
            http_status=status.HTTP_409_CONFLICT,
        )

    try:
        # Optional numeric seat cap (RDP_MAX_LIVE_SESSIONS>0). Counts open
        # allocations plus held machines — not raw open rows alone.
        from services.rdp_capacity import at_capacity

        if at_capacity(db):
            return RdpOutcome(
                ok=False,
                code="at_capacity",
                friendly="All desktops are busy right now. Please try again in a few minutes.",
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        guacamole_error = None
        if not resource.guacamole_connection_id:
            guacamole_error = "Machine has no guacamole_connection_id configured."

        from services.rdp_gateway_cluster import pick_gateway

        gateway = pick_gateway(db, redis_client)
        if settings.RDP_GATEWAYS.strip() and gateway is None:
            return RdpOutcome(
                ok=False,
                code="at_capacity",
                friendly="All remote-desktop gateways are busy or draining. Try again shortly.",
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        now = utc_now()
        # Standing assignment (status was already `assigned`) must survive release so
        # the worker still sees the machine on the claim board. Pool claims from
        # `online_free` clear the assignee when the lock frees.
        restore_assignment = resource.status == RdpStatusEnum.assigned
        allocation = Allocation(
            worker_id=worker.id,
            rdp_resource_id=resource.id,
            shift_id=shift_id,
            guacamole_token=None,
            connection_generation=1,
            version=1,
            allocation_status=AllocationLifecycleEnum.assigned,
            tunnel_status=TunnelStatusEnum.none,
            gateway_id=gateway.id if gateway else None,
        )
        resource.status = RdpStatusEnum.active
        resource.assigned_worker_id = worker.id
        resource.status_changed_at = now
        resource.version = int(resource.version or 1) + 1

        work_session = WorkSession(
            worker_id=worker.id,
            session_type=SessionTypeEnum.gs_rdp,
            allocation_id=None,
            rdp_resource_id=resource.id,
            client_id=resource.client_id,
            start_time=now,
            type_specific_fields={"restore_assignment": restore_assignment},
        )

        db.add(allocation)
        db.add(resource)
        db.flush()
        work_session.allocation_id = allocation.id
        db.add(work_session)
        db.flush()
        record_login_fn(
            db,
            worker=worker,
            resource=resource,
            session_id=work_session.id,
            ip_address=request_ip,
        )
        try:
            db.commit()
        except IntegrityError:
            # Redis serialises normal claims, but the partial unique index is
            # the durable last line of defence across processes / failover.
            # Turn that collision into the same retryable outcome as a busy
            # Redis claim lock instead of leaking a database 500 to a worker.
            db.rollback()
            return RdpOutcome(
                ok=False,
                code="claim_race",
                friendly="RDP resource is currently being claimed — try again in a moment",
                http_status=status.HTTP_409_CONFLICT,
            )
        db.refresh(allocation)
        db.refresh(work_session)

        return RdpOutcome(
            ok=True,
            code="claimed",
            friendly="Desktop claimed.",
            data={
                "allocation_id": str(allocation.id),
                "session_id": str(work_session.id),
                "rdp_resource_id": str(resource.id),
                "worker_id": str(worker.id),
                "status": resource.status.value,
                "guacamole_url": None,
                "guacamole_viewer_path": None,
                "guacamole_error": guacamole_error,
                "resumed": False,
                "connection_generation": int(allocation.connection_generation),
            },
        )
    finally:
        redis_client.delete(lock_key)
        redis_client.delete(capacity_lock_key)


def disconnect(
    db: Session,
    resource: RDPResource,
    redis_client: redis_lib.Redis,
    *,
    worker_id: UUID | None = None,
    require_owner: bool = True,
    release_reason: ReleaseReasonEnum = ReleaseReasonEnum.completed,
    ip_address: str | None = None,
    initiated_by: str = "worker",
    admin_id: UUID | None = None,
    allocation_id: UUID | None = None,
    connection_generation: int | None = None,
    close_sessions_fn,
    record_logout_fn,
) -> RdpOutcome:
    """Close tunnel → confirm → release allocation. Generation-aware."""
    db.refresh(resource)
    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.released_at.is_(None),
        ).with_for_update()
    ).all()

    # Stale actor: generation or allocation moved on → harmless no-op.
    if open_allocs and (allocation_id is not None or connection_generation is not None):
        matching = [
            a
            for a in open_allocs
            if generation_matches(
                a,
                allocation_id=allocation_id,
                connection_generation=connection_generation,
            )
        ]
        if not matching:
            return RdpOutcome(
                ok=True,
                code="stale_actor",
                friendly="This disconnect no longer applies to the current session.",
                data={
                    "rdp_resource_id": str(resource.id),
                    "status": resource.status.value,
                    "released": False,
                    "guacamole_disconnected": False,
                    "closed_session_ids": [],
                    "already_released": True,
                    "stale": True,
                },
            )
        open_allocs = matching

    def _logout_worker() -> Worker | None:
        logout_worker_id = worker_id
        if logout_worker_id is None and open_allocs:
            logout_worker_id = open_allocs[0].worker_id
        if logout_worker_id is None:
            logout_worker_id = resource.assigned_worker_id
        return db.get(Worker, logout_worker_id) if logout_worker_id else None

    if open_allocs:
        owner_id = open_allocs[0].worker_id
        if resource.assigned_worker_id != owner_id:
            resource.assigned_worker_id = owner_id
        if resource.status == RdpStatusEnum.online_free:
            resource.status = RdpStatusEnum.active
            resource.status_changed_at = utc_now()
            db.add(resource)
        for alloc in open_allocs:
            if alloc.allocation_status != AllocationLifecycleEnum.ending:
                # Stamp the moment we *enter* ending, so quarantine escalation
                # has a real clock to measure against. Only on the transition:
                # a worker hammering Disconnect must not keep resetting it, or a
                # genuinely stuck closure would never reach quarantine.
                alloc.last_gateway_observation_at = utc_now()
            alloc.allocation_status = AllocationLifecycleEnum.ending
            _bump_allocation_version(alloc)
            db.add(alloc)
        db.commit()

    owns_via_alloc = worker_id is not None and any(
        a.worker_id == worker_id for a in open_allocs
    )
    owns_via_assignment = (
        worker_id is not None and resource.assigned_worker_id == worker_id
    )

    if require_owner and worker_id is not None:
        if not owns_via_alloc and not owns_via_assignment:
            if resource.status == RdpStatusEnum.online_free and not open_allocs:
                return RdpOutcome(
                    ok=True,
                    code="already_released",
                    friendly="Desktop already free.",
                    data={
                        "rdp_resource_id": str(resource.id),
                        "status": resource.status.value,
                        "released": False,
                        "guacamole_disconnected": False,
                        "closed_session_ids": [],
                        "already_released": True,
                    },
                )
            return RdpOutcome(
                ok=False,
                code="not_owner",
                friendly="You do not have an open claim on this machine",
                http_status=status.HTTP_403_FORBIDDEN,
            )

    # Phase 5: burn any direct-gateway join ticket before we touch the tunnel,
    # so a ticket in flight cannot mint a Guacamole token for a session we are
    # in the middle of ending. Redemption re-checks the database too, so this
    # is belt-and-braces — it only narrows the window.
    if open_allocs:
        from services.rdp_join_ticket import revoke_for_allocations

        revoke_for_allocations(redis_client, [a.id for a in open_allocs])
        # Free the proxy-path slot so a new claim/tab is not blocked by a
        # lock left behind after End / force-stop.
        release_tunnel_lock(redis_client, rdp_id=resource.id)

    guac_connection_id = resource.guacamole_connection_id
    close_outcome: dict[str, object] = {"outcome": "already_closed", "closed": 0}
    # Set when closure could not be proven on a worker End: the allocation ends
    # so the worker is free, but the machine is held instead of re-pooled.
    hold_machine = False
    if guac_connection_id:
        # Phase 7: close it on the gateway the session actually lives on. With a
        # cluster, asking the wrong node returns "already_closed" while the real
        # tunnel keeps running, and the machine would be handed to the next
        # worker with someone still on it.
        from services.rdp_gateway_cluster import client_for_allocation

        close_outcome = client_for_allocation(
            redis_client, open_allocs[0] if open_allocs else None
        ).close_and_confirm(str(guac_connection_id))
        if close_outcome.get("outcome") in {"pending", "failed"}:
            # Two requirements pull opposite ways here, so split them apart
            # (Phase 3 Action 3):
            #
            #   * a worker must always be able to leave — blocking End left the
            #     claim Live forever while the UI looked broken;
            #   * the machine must not be reused on an unproven close, or the
            #     next worker lands on a live session (Principle 5).
            #
            # Ending the *allocation* satisfies the first: the worker is free to
            # claim elsewhere immediately. Holding the *machine* satisfies the
            # second. Nobody is trapped and nobody inherits a live tunnel.
            if initiated_by == "worker":
                hold_machine = True
                logger.warning(
                    "Worker end for %s: Guacamole close %s — releasing the claim "
                    "but holding the machine out of service until confirmed",
                    resource.id,
                    close_outcome.get("outcome"),
                )
            else:
                return RdpOutcome(
                    ok=False,
                    code="close_pending",
                    friendly=(
                        "Disconnect requested, but we are still confirming the remote "
                        "connection has closed. Please try again shortly."
                    ),
                    http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=str(close_outcome),
                    data={"disconnect_outcome": close_outcome.get("outcome")},
                )

    if not open_allocs and resource.status != RdpStatusEnum.online_free:
        if require_owner and worker_id is not None and resource.assigned_worker_id not in (
            None,
            worker_id,
        ):
            return RdpOutcome(
                ok=False,
                code="not_owner",
                friendly="You do not have an open claim on this machine",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        closed_session_ids = close_sessions_fn(db, resource.id)
        logout_worker = _logout_worker()
        record_logout_fn(
            db,
            worker=logout_worker,
            resource=resource,
            session_ids=[str(sid) for sid in closed_session_ids],
            ip_address=ip_address,
            initiated_by=initiated_by,
            admin_id=admin_id,
        )
        now = utc_now()
        # Orphan repair: no open allocation — always fully free.
        resource.status = RdpStatusEnum.online_free
        resource.assigned_worker_id = None
        resource.status_changed_at = now
        resource.version = int(resource.version or 1) + 1
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return RdpOutcome(
            ok=True,
            code="released",
            friendly="Desktop released.",
            data={
                "rdp_resource_id": str(resource.id),
                "status": resource.status.value,
                "released": True,
                "guacamole_disconnected": False,
                "disconnect_outcome": close_outcome["outcome"],
                "closed_session_ids": [str(sid) for sid in closed_session_ids],
                "repaired_orphan": True,
            },
        )

    guacamole_disconnected = close_outcome["outcome"] == "closed"
    now = utc_now()
    logout_worker_id = worker_id
    if logout_worker_id is None and open_allocs:
        logout_worker_id = open_allocs[0].worker_id
    # Read restore flag before sessions are closed.
    restore = _should_restore_assignment(db, resource)
    for alloc in open_allocs:
        if worker_id is not None and alloc.worker_id != worker_id and require_owner:
            continue
        _mark_allocation_ended(alloc, reason=release_reason, now=now)
        db.add(alloc)

    closed_session_ids = close_sessions_fn(db, resource.id)
    logout_worker = _logout_worker()
    record_logout_fn(
        db,
        worker=logout_worker,
        resource=resource,
        session_ids=[str(sid) for sid in closed_session_ids],
        ip_address=ip_address,
        initiated_by=initiated_by,
        admin_id=admin_id,
    )

    if hold_machine:
        # Held, not free. The worker's allocation above is already ended, so
        # they can claim another desktop; this machine stays out of the pool
        # until closure is confirmed or an admin repairs it.
        from services.rdp_quarantine import hold_machine_unconfirmed

        hold_machine_unconfirmed(
            db,
            resource,
            open_allocs,
            reason=(
                "Closure could not be confirmed when the worker disconnected "
                f"({close_outcome.get('outcome')}). Held so nobody inherits a "
                "possibly-live tunnel."
            ),
            now=now,
        )
    elif restore and logout_worker_id:
        resource.status = RdpStatusEnum.assigned
        resource.assigned_worker_id = logout_worker_id
    else:
        resource.status = RdpStatusEnum.online_free
        resource.assigned_worker_id = None
    resource.status_changed_at = now
    resource.version = int(resource.version or 1) + 1
    db.add(resource)
    db.commit()
    db.refresh(resource)

    return RdpOutcome(
        ok=True,
        code="released",
        friendly="Desktop released.",
        data={
            "rdp_resource_id": str(resource.id),
            "status": resource.status.value,
            "released": True,
            "guacamole_disconnected": guacamole_disconnected,
            "guacamole_connection_id": str(guac_connection_id) if guac_connection_id else None,
            "disconnect_outcome": close_outcome["outcome"],
            "closed_session_ids": [str(sid) for sid in closed_session_ids],
        },
    )


def force_release(
    db: Session,
    resource: RDPResource,
    redis_client: redis_lib.Redis,
    *,
    admin_id: UUID | None,
    ip_address: str | None = None,
    close_sessions_fn,
    record_logout_fn,
) -> RdpOutcome:
    return disconnect(
        db,
        resource,
        redis_client,
        worker_id=None,
        require_owner=False,
        release_reason=ReleaseReasonEnum.force_released,
        ip_address=ip_address,
        initiated_by="admin",
        admin_id=admin_id,
        close_sessions_fn=close_sessions_fn,
        record_logout_fn=record_logout_fn,
    )


def prepare_connect(
    db: Session,
    *,
    rdp_id: UUID,
    uid: str,
    role: str,
    staff_roles: frozenset[str],
    takeover: bool = False,
) -> RdpOutcome:
    """Verify ownership, optionally take over a second tab, return connection id."""
    from core.redis import get_redis
    from models.admin_users import AdminUser

    resource = db.get(RDPResource, rdp_id)
    if not resource:
        return RdpOutcome(
            ok=False,
            code="not_found",
            friendly="RDP resource not found",
            http_status=404,
        )
    if not resource.guacamole_connection_id:
        return RdpOutcome(
            ok=False,
            code="no_connection",
            friendly="Machine has no Guacamole connection configured",
            http_status=422,
        )

    # Quarantined / held machines stay visible to the owner for messaging, but
    # must not mint a new tunnel until an admin repairs the seat.
    if resource.status == RdpStatusEnum.maintenance:
        from services.rdp_quarantine import WORKER_CHECKED_MESSAGE

        return RdpOutcome(
            ok=False,
            code="quarantined",
            friendly=WORKER_CHECKED_MESSAGE,
            http_status=409,
        )

    alloc: Allocation | None = None
    # Everyone — including staff — must claim first. Staff used to skip this and
    # could open a tunnel with no allocation (no lock / no audit claim).
    admin_user = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    worker = (
        db.exec(select(Worker).where(Worker.admin_user_id == admin_user.id)).first()
        if admin_user
        else None
    )
    if not worker:
        return RdpOutcome(
            ok=False,
            code="no_claim",
            friendly="Claim this machine first, then open the desktop.",
            http_status=403,
        )
    alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.worker_id == worker.id,
            Allocation.released_at.is_(None),
        ).with_for_update()
    ).first()
    if not alloc:
        return RdpOutcome(
            ok=False,
            code="no_claim",
            friendly="Claim this machine first, then open the desktop.",
            http_status=403,
        )

    connection_id = raw_connection_id(resource.guacamole_connection_id)
    redis_client = get_redis()
    # Phase 7: check and kill on this allocation's own gateway. The
    # already-open-elsewhere test below is only meaningful against the node
    # that would actually be holding the tunnel.
    from services.rdp_gateway_cluster import client_for_allocation

    guac = client_for_allocation(redis_client, alloc)
    try:
        if not guac.get_connection(connection_id):
            repaired = sync_connection(redis_client, resource)
            connection_id = repaired.connection_id
            resource.guacamole_connection_id = connection_id
            db.add(resource)
            db.commit()
    except GuacamoleProvisionError:
        return RdpOutcome(
            ok=False,
            code="repair_failed",
            friendly="The remote desktop connection needs repair. Please contact an admin.",
            http_status=503,
        )
    except Exception as exc:
        logger.warning("Guacamole connection check failed for %s: %s", rdp_id, exc)
        return RdpOutcome(
            ok=False,
            code="gateway_unreachable",
            friendly="Cannot reach the remote desktop gateway. Please try again shortly.",
            http_status=503,
            detail=str(exc),
        )

    active_on_connection = False
    try:
        for meta in guac.list_active_connections().values():
            if not isinstance(meta, dict):
                continue
            cid = raw_connection_id(
                str(meta.get("connectionIdentifier") or meta.get("connectionID") or "")
            )
            if cid == connection_id:
                active_on_connection = True
                break
    except Exception as exc:
        logger.warning("Active tunnel check failed for %s: %s", rdp_id, exc)
        return RdpOutcome(
            ok=False,
            code="gateway_unreachable",
            friendly="Cannot confirm the desktop connection state. Please try again shortly.",
            http_status=503,
            detail=str(exc),
        )

    # Our own relay lock catches the common case where Guacamole's admin
    # activeConnections list is empty while a tab is still painting pixels.
    proxy_tunnel_held = tunnel_lock_held(redis_client, rdp_id=rdp_id)
    already_open = (active_on_connection or proxy_tunnel_held) and not takeover

    if already_open:
        return RdpOutcome(
            ok=False,
            code="already_open",
            friendly=(
                "This desktop is already open in another tab. "
                "Switch here to move the session, or return to that tab."
            ),
            http_status=409,
            data={
                "switch_allowed": True,
                "allocation_id": str(alloc.id) if alloc else None,
                "connection_generation": int(alloc.connection_generation) if alloc else None,
            },
        )

    if (active_on_connection or proxy_tunnel_held) and takeover:
        if not alloc:
            return RdpOutcome(
                ok=False,
                code="already_open",
                friendly="This desktop is already open. End the session first.",
                http_status=409,
            )
        # Advance generation so late disconnects from the old tab are no-ops.
        alloc.connection_generation = int(alloc.connection_generation or 1) + 1
        alloc.tunnel_status = TunnelStatusEnum.connecting
        _bump_allocation_version(alloc)
        db.add(alloc)
        db.commit()
        close_outcome = guac.close_and_confirm(connection_id)
        if close_outcome.get("outcome") in {"pending", "failed"}:
            # Proxy path often cannot see/kill Guacamole actives. The new
            # tunnel epoch still drops the old FastAPI relay within seconds.
            logger.warning(
                "Takeover Guacamole close %s for %s — continuing with epoch eviction",
                close_outcome.get("outcome"),
                rdp_id,
            )
        # Old tab's lock/epoch must not block this generation.
        release_tunnel_lock(redis_client, rdp_id=rdp_id)

    # Reserve the slot before we mark connecting / open Guacamole, so a second
    # tab cannot race in during the token fetch. Guacamole's activeConnections
    # list is often empty on the FastAPI proxy path.
    tunnel_epoch: str | None = None
    if alloc:
        tunnel_epoch = acquire_tunnel_lock(
            redis_client,
            rdp_id=rdp_id,
            allocation_id=alloc.id,
            connection_generation=int(alloc.connection_generation),
            takeover=takeover,
        )
        if not tunnel_epoch:
            return RdpOutcome(
                ok=False,
                code="already_open",
                friendly=(
                    "This desktop is already open in another tab. "
                    "Switch here to move the session, or return to that tab."
                ),
                http_status=409,
                data={
                    "switch_allowed": True,
                    "allocation_id": str(alloc.id),
                    "connection_generation": int(alloc.connection_generation),
                },
            )

    if alloc:
        alloc.tunnel_status = TunnelStatusEnum.connecting
        alloc.last_gateway_observation_at = utc_now()
        _bump_allocation_version(alloc)
        db.add(alloc)

    if resource.status == RdpStatusEnum.idle:
        resource.status = RdpStatusEnum.active
        resource.status_changed_at = utc_now()
        resource.version = int(resource.version or 1) + 1
        db.add(resource)

    db.commit()

    return RdpOutcome(
        ok=True,
        code="ready",
        friendly="Ready to connect.",
        data={
            "connection_id": connection_id,
            "allocation_id": str(alloc.id) if alloc else None,
            "connection_generation": int(alloc.connection_generation) if alloc else None,
            "tunnel_epoch": tunnel_epoch,
        },
    )


def mark_tunnel_connected(db: Session, rdp_id: UUID, *, connection_generation: int | None) -> None:
    alloc = _open_allocation(db, rdp_id)
    if not alloc:
        return
    if connection_generation is not None and int(alloc.connection_generation) != int(
        connection_generation
    ):
        return
    alloc.tunnel_status = TunnelStatusEnum.connected
    alloc.last_gateway_observation_at = utc_now()
    _bump_allocation_version(alloc)
    db.add(alloc)
    db.commit()


def mark_tunnel_disconnected(db: Session, rdp_id: UUID, *, connection_generation: int | None = None) -> None:
    """Start grace only after the desktop tunnel ends for the current generation."""
    resource = db.get(RDPResource, rdp_id)
    if not resource or resource.status != RdpStatusEnum.active:
        return
    alloc = _open_allocation(db, rdp_id)
    if not alloc:
        return
    if connection_generation is not None and int(alloc.connection_generation) != int(
        connection_generation
    ):
        return
    try:
        connection_id = raw_connection_id(resource.guacamole_connection_id)
        from core.redis import get_redis
        from services.rdp_gateway_cluster import client_for_allocation

        # Ask this allocation's gateway. Querying a node that never held the
        # tunnel always answers "no active connections", which would start the
        # release clock on a session that is still live.
        active = client_for_allocation(get_redis(), alloc).list_active_connections()
        if any(
            isinstance(meta, dict)
            and raw_connection_id(
                str(meta.get("connectionIdentifier") or meta.get("connectionID") or "")
            )
            == connection_id
            for meta in active.values()
        ):
            return
    except Exception as exc:
        logger.warning("Could not confirm tunnel end for %s: %s", rdp_id, exc)
        return

    alloc.tunnel_status = TunnelStatusEnum.disconnected
    alloc.last_gateway_observation_at = utc_now()
    _bump_allocation_version(alloc)
    db.add(alloc)
    resource.status = RdpStatusEnum.idle
    resource.status_changed_at = utc_now()
    resource.version = int(resource.version or 1) + 1
    db.add(resource)
    db.commit()
