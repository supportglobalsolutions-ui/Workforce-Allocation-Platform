import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import redis as redis_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import STAFF_ROLES, require_admin, require_user
from core.rate_limit import check_rate_limit
from core.redis import get_redis
from services.rdp_degraded import is_datastore_error
from models.allocation import Allocation
from models.enums import RdpStatusEnum
from models.rdp_machine import RDPClaimReservation, RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from schemas.rdp import (
    CREDENTIAL_FIELDS,
    RDPResourceCreate,
    RDPResourceResponse,
    RdpClaimReservationCreate,
    RdpClaimReservationResponse,
    RdpForceReleaseBody,
    RdpJoinTicket,
)
from services import rdp_join_ticket
from services.rdp_day_budget import reservations_overlap
from services.rdp_gateway import issue_join_ticket
from services.rdp_engine import (
    claim as engine_claim,
    disconnect as engine_disconnect,
    force_release as engine_force_release,
)
from services.rdp_state import (
    list_visible_rdp_resources,
    require_worker_visible_or_staff,
    worker_may_see_resource,
)
from services.rdp_support import (
    close_open_sessions_for_rdp,
    preflight_rdp,
    provision_guacamole,
    record_rdp_login,
    record_rdp_logout,
    repair_rdp_state,
    request_ip,
    resume_existing_claim,
    rdp_response,
    set_allowed_workers,
    viewer_worker_id,
)
from routers.rdp_tunnel import router as rdp_tunnel_router
from routers.rdp_ops import router as rdp_ops_router
from routers.rdp_admin import router as rdp_admin_router
from .deps import get_admin_user, get_worker_for_user

logger = logging.getLogger(__name__)
router = APIRouter()
router.include_router(rdp_tunnel_router)
router.include_router(rdp_ops_router)
router.include_router(rdp_admin_router)


def _datastore_retry(operation: str, exc: BaseException) -> None:
    """Give a worker a safe retry contract during Redis/Postgres outages."""
    if not is_datastore_error(exc):
        raise exc
    logger.warning("RDP %s deferred: datastore unavailable (%s)", operation, type(exc).__name__)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Remote desktop service is temporarily unavailable. Please try again shortly.",
        headers={"Retry-After": "5"},
    ) from exc


@router.get("/my-active")
def get_my_active_rdp(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
):
    """Worker's currently claimed RDP (open allocation), if any."""
    worker = get_worker_for_user(db, current_user)
    alloc = db.exec(
        select(Allocation)
        .where(
            Allocation.worker_id == worker.id,
            Allocation.released_at.is_(None),
        )
        .order_by(Allocation.claimed_at.desc())
    ).first()
    if not alloc:
        return None

    resource = db.get(RDPResource, alloc.rdp_resource_id)
    if not resource:
        return None

    repair_rdp_state(db, resource)

    work_session = db.exec(
        select(WorkSession).where(
            WorkSession.allocation_id == alloc.id,
            WorkSession.end_time.is_(None),
        )
    ).first()

    # The desktop tab opens the WebSocket tunnel and mints its own token, so
    # there is nothing to fetch from Guacamole here. This endpoint is polled on
    # every session-page load — a round-trip per call was pure latency.
    guacamole_viewer_path = (
        f"/worker/rdp-session/{resource.id}/desktop"
        if resource.guacamole_connection_id
        else None
    )

    return {
        "allocation_id": str(alloc.id),
        "rdp_resource_id": str(resource.id),
        "session_id": str(work_session.id) if work_session else None,
        "nickname": resource.nickname,
        "status": resource.status.value,
        "guacamole_viewer_path": guacamole_viewer_path,
    }




@router.get("", response_model=list[RDPResourceResponse])
def list_rdp_resources(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    # Distinct local name: assigning to `viewer_worker_id` would make the
    # imported helper a local variable within this function, and the call on
    # the right-hand side would then read it before assignment.
    caller_worker_id = viewer_worker_id(db, current_user)
    return [
        rdp_response(db, resource, viewer=current_user, viewer_worker_id=caller_worker_id)
        for resource in list_visible_rdp_resources(
            db, viewer=current_user, viewer_worker_id=caller_worker_id
        )
    ]


@router.post("", response_model=RDPResourceResponse, status_code=status.HTTP_201_CREATED)
def create_rdp_resource(
    body: RDPResourceCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    existing = db.exec(
        select(RDPResource).where(RDPResource.nickname == body.nickname.strip())
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An RDP machine with nickname '{body.nickname}' already exists",
        )
    resource = RDPResource(
        **body.model_dump(exclude=CREDENTIAL_FIELDS | {"allowed_worker_ids"})
    )
    db.add(resource)
    db.commit()
    db.refresh(resource)
    set_allowed_workers(db, resource, body.allowed_worker_ids)
    if body.auto_provision and not body.guacamole_connection_id and resource.monitor_host:
        error = provision_guacamole(db, resource, redis_client, body)
        if error:
            resource.health_notes = (
                f"{resource.health_notes}\n{error}" if resource.health_notes else error
            )
            db.add(resource)
            db.commit()
            db.refresh(resource)
    return rdp_response(db, resource)


@router.get("/{rdp_id}", response_model=RDPResourceResponse)
def get_rdp_resource(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    # See list_rdp_resources: must not shadow the imported helper.
    caller_worker_id = viewer_worker_id(db, current_user)
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This desktop is no longer available. Return to your desktops.",
        )
    require_worker_visible_or_staff(
        db, resource, viewer=current_user, viewer_worker_id=caller_worker_id
    )
    return rdp_response(
        db,
        resource,
        viewer=current_user,
        viewer_worker_id=caller_worker_id,
    )


def _reservation_response(db: Session, row: RDPClaimReservation) -> RdpClaimReservationResponse:
    worker = db.get(Worker, row.worker_id)
    resource = db.get(RDPResource, row.rdp_resource_id)
    return RdpClaimReservationResponse(
        id=row.id,
        rdp_resource_id=row.rdp_resource_id,
        worker_id=row.worker_id,
        worker_name=worker.display_name if worker else None,
        rdp_nickname=resource.nickname if resource else None,
        starts_at=row.starts_at,
        ends_at=row.ends_at,
        created_at=row.created_at,
        cancelled_at=row.cancelled_at,
    )


@router.get("/reservations/mine", response_model=list[RdpClaimReservationResponse])
def list_my_reservations(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Upcoming (and active) claim schedules for the current worker."""
    worker = get_worker_for_user(db, current_user)
    now = datetime.now(timezone.utc)
    rows = db.exec(
        select(RDPClaimReservation)
        .where(
            RDPClaimReservation.worker_id == worker.id,
            RDPClaimReservation.cancelled_at.is_(None),
            RDPClaimReservation.ends_at > now,
        )
        .order_by(RDPClaimReservation.starts_at)
    ).all()
    return [_reservation_response(db, r) for r in rows]


@router.get("/{rdp_id}/reservations", response_model=list[RdpClaimReservationResponse])
def list_rdp_reservations(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    resource = db.get(RDPResource, rdp_id)
    if not resource:
        raise HTTPException(status_code=404, detail="RDP resource not found")
    caller_worker_id = viewer_worker_id(db, current_user)
    require_worker_visible_or_staff(
        db, resource, viewer=current_user, viewer_worker_id=caller_worker_id
    )
    now = datetime.now(timezone.utc)
    is_staff = current_user.get("role") in STAFF_ROLES
    q = select(RDPClaimReservation).where(
        RDPClaimReservation.rdp_resource_id == rdp_id,
        RDPClaimReservation.cancelled_at.is_(None),
        RDPClaimReservation.ends_at > now,
    )
    if not is_staff and caller_worker_id:
        q = q.where(RDPClaimReservation.worker_id == caller_worker_id)
    rows = db.exec(q.order_by(RDPClaimReservation.starts_at)).all()
    return [_reservation_response(db, r) for r in rows]


@router.post(
    "/{rdp_id}/reservations",
    response_model=RdpClaimReservationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_rdp_reservation(
    rdp_id: UUID,
    body: RdpClaimReservationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    resource = db.get(RDPResource, rdp_id)
    if not resource:
        raise HTTPException(status_code=404, detail="RDP resource not found")

    is_staff = current_user.get("role") in STAFF_ROLES
    caller_worker = None
    try:
        caller_worker = get_worker_for_user(db, current_user)
    except HTTPException:
        if not is_staff:
            raise

    if not is_staff:
        if not caller_worker or not worker_may_see_resource(db, resource, caller_worker.id):
            raise HTTPException(status_code=403, detail="You cannot schedule this desktop.")
        if body.worker_id != caller_worker.id:
            raise HTTPException(
                status_code=403,
                detail="Workers may only create claim schedules for themselves.",
            )
    else:
        target = db.get(Worker, body.worker_id)
        if not target:
            raise HTTPException(status_code=404, detail="Worker not found")

    starts = body.starts_at
    ends = body.ends_at
    if starts.tzinfo is None:
        starts = starts.replace(tzinfo=timezone.utc)
    if ends.tzinfo is None:
        ends = ends.replace(tzinfo=timezone.utc)
    if ends <= starts:
        raise HTTPException(status_code=422, detail="ends_at must be after starts_at.")

    limit_hours = Decimal(str(resource.daily_limit_hours or 12))
    max_seconds = float(limit_hours) * 3600
    if (ends - starts).total_seconds() > max_seconds + 1:
        raise HTTPException(
            status_code=422,
            detail=f"Reservation cannot exceed this desktop's daily limit ({limit_hours}h).",
        )

    if reservations_overlap(db, rdp_id, starts, ends):
        raise HTTPException(
            status_code=409,
            detail="That time overlaps another claim schedule on this desktop.",
        )

    created_by = None
    if is_staff:
        try:
            admin = get_admin_user(db, current_user)
            created_by = admin.id
        except Exception:
            created_by = None

    row = RDPClaimReservation(
        rdp_resource_id=rdp_id,
        worker_id=body.worker_id,
        starts_at=starts,
        ends_at=ends,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _reservation_response(db, row)


@router.delete("/{rdp_id}/reservations/{reservation_id}", status_code=status.HTTP_200_OK)
def cancel_rdp_reservation(
    rdp_id: UUID,
    reservation_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    row = db.get(RDPClaimReservation, reservation_id)
    if not row or row.rdp_resource_id != rdp_id:
        raise HTTPException(status_code=404, detail="Reservation not found")
    if row.cancelled_at:
        return {"cancelled": True, "id": str(row.id)}

    is_staff = current_user.get("role") in STAFF_ROLES
    if not is_staff:
        worker = get_worker_for_user(db, current_user)
        if row.worker_id != worker.id:
            raise HTTPException(status_code=403, detail="You can only cancel your own schedules.")

    row.cancelled_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return {"cancelled": True, "id": str(row.id)}


@router.post("/{rdp_id}/claim", status_code=status.HTTP_201_CREATED)
def claim_rdp_resource(
    rdp_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    shift_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
):
    """Claim an online-free RDP machine (sequence owned by rdp_engine)."""
    try:
        check_rate_limit(request, scope="rdp-claim", limit=20, window_seconds=3600)
        worker = get_worker_for_user(db, current_user)
        resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This desktop is no longer available. Return to your desktops.",
            )
        require_worker_visible_or_staff(
            db,
            resource,
            viewer=current_user,
            viewer_worker_id=worker.id if current_user.get("role") not in STAFF_ROLES else None,
        )
        outcome = engine_claim(
            db,
            redis_client,
            worker=worker,
            resource=resource,
            shift_id=shift_id,
            repair_fn=repair_rdp_state,
            preflight_fn=preflight_rdp,
            resume_fn=resume_existing_claim,
            record_login_fn=record_rdp_login,
            request_ip=request_ip(request),
            viewer_role=current_user.get("role"),
        )
        return outcome.raise_if_error()
    except HTTPException:
        raise
    except (SQLAlchemyError, redis_lib.RedisError) as exc:
        _datastore_retry("claim", exc)


@router.post("/{rdp_id}/end-connection")
def end_rdp_connection(
    rdp_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
    allocation_id: UUID | None = None,
    connection_generation: int | None = None,
):
    """Release DB claim, close work session, and disconnect live Guacamole session."""
    try:
        worker = get_worker_for_user(db, current_user)
        resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

        is_admin = current_user.get("role") in STAFF_ROLES
        admin_id = None
        if is_admin:
            admin_id = get_admin_user(db, current_user).id
        outcome = engine_disconnect(
            db,
            resource,
            redis_client,
            worker_id=worker.id,
            require_owner=not is_admin,
            ip_address=request_ip(request),
            initiated_by="admin" if is_admin else "worker",
            admin_id=admin_id,
            allocation_id=allocation_id,
            connection_generation=connection_generation,
            close_sessions_fn=close_open_sessions_for_rdp,
            record_logout_fn=record_rdp_logout,
        )
        return outcome.raise_if_error()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("end-connection failed for %s: %s", rdp_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Something went wrong ending the session. Please try again.",
        ) from exc


@router.post("/{rdp_id}/release")
def release_rdp_resource(
    rdp_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
):
    """Alias for end-connection (backward compatible)."""
    return end_rdp_connection(rdp_id, request, background_tasks, db, current_user, redis_client)


@router.post("/{rdp_id}/force-release")
def force_release_rdp_resource(
    rdp_id: UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
    body: RdpForceReleaseBody = RdpForceReleaseBody(),
):
    """Admin force-release. Reason is optional."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    admin = get_admin_user(db, current_user)
    outcome = engine_force_release(
        db,
        resource,
        redis_client,
        admin_id=admin.id,
        ip_address=request_ip(request),
        close_sessions_fn=close_open_sessions_for_rdp,
        record_logout_fn=record_rdp_logout,
    )
    result = outcome.raise_if_error()
    db.refresh(resource)
    reason = (body.reason or "").strip() or "Admin force release"
    note = f"Force release: {reason}"
    resource.health_notes = f"{resource.health_notes}\n{note}" if resource.health_notes else note
    # Force release returns the seat to a claimable state — but only when the
    # gateway confirmed the tunnel is down. If closure could not be proven the
    # engine deliberately held the machine, and re-pooling here would hand the
    # next worker a session that may still be live.
    closure_confirmed = bool(result.get("guacamole_disconnected")) or (
        result.get("disconnect_outcome") in {"closed", "already_closed"}
    )
    if closure_confirmed and resource.status in {
        RdpStatusEnum.maintenance,
        RdpStatusEnum.admin_locked,
    }:
        from services.rdp_state import transition_rdp_status

        transition_rdp_status(
            db,
            resource,
            RdpStatusEnum.assigned if resource.assigned_worker_id else RdpStatusEnum.online_free,
            commit=False,
        )
    db.add(resource)
    db.commit()

    return {**result, "reason": reason, "status": resource.status.value}


@router.post("/{rdp_id}/join-ticket", response_model=RdpJoinTicket)
def create_rdp_join_ticket(
    rdp_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
):
    """
    Short-lived, single-use pass to open this desktop directly on `guac.`
    (Phase 5 Action 1).

    Bound to worker + allocation + machine + connection + generation, so it
    cannot be used for another machine, by another worker, or after the
    session it belongs to has ended.

    A caller outside the rollout cohort gets `mode: "proxy"` and a 200 — not
    an error — and the viewer keeps using the FastAPI ws-tunnel.
    """
    try:
        worker = get_worker_for_user(db, current_user)
        # Keyed per worker, not per IP. `check_rate_limit` keys on IP by default,
        # which would make a whole office behind one NAT share a single budget —
        # and the viewer spends up to 6 tickets on one flaky connect (jittered
        # retries, Phase 8 Action 4) plus a silent refresh every few minutes. Ten
        # workers on one address would trip the limit during a gateway blip, i.e.
        # exactly when they are trying to reconnect.
        check_rate_limit(
            request,
            scope="rdp-join-ticket",
            limit=120,
            window_seconds=3600,
            key_suffix=str(worker.id),
            detail=(
                "Too many reconnect attempts in the last hour. "
                "Wait a moment and reopen the desktop."
            ),
        )
        resource = db.get(RDPResource, rdp_id)
        if not resource:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This desktop is no longer available. Return to your desktops.",
            )
        require_worker_visible_or_staff(
            db,
            resource,
            viewer=current_user,
            viewer_worker_id=worker.id if current_user.get("role") not in STAFF_ROLES else None,
        )

        outcome = issue_join_ticket(
            db,
            redis_client,
            worker=worker,
            email=current_user.get("email"),
            resource=resource,
        )
        if not outcome.ok:
            # Admission control refusals carry a wait hint so the fleet spreads
            # itself instead of every viewer retrying on the same tick (Phase 8
            # Action 4). Retry-After is seconds per RFC 9110; the millisecond
            # value in the body is what the viewer actually schedules on.
            retry_after_ms = int(outcome.data.get("retry_after_ms") or 0)
            headers = (
                {"Retry-After": str(max(1, round(retry_after_ms / 1000)))}
                if retry_after_ms
                else None
            )
            raise HTTPException(
                status_code=outcome.http_status,
                detail=outcome.friendly,
                headers=headers,
            )
        return RdpJoinTicket(**outcome.data)
    except HTTPException:
        raise
    except (SQLAlchemyError, redis_lib.RedisError) as exc:
        _datastore_retry("join-ticket", exc)
