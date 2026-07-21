import asyncio
import logging
import urllib.parse
from datetime import datetime, timezone
from urllib.parse import unquote
from uuid import UUID

import httpx
import redis as redis_lib
import websockets as ws_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from starlette.background import BackgroundTask

from core.config import settings
from core.database import engine, get_db
from core.firebase_admin import verify_firebase_token
from core.guacamole import GuacamoleClient
from core.permissions import require_admin, require_user
from core.redis import get_redis
from models.admin_users import AdminUser
from models.allocation import Allocation
from models.enums import RdpStatusEnum, ReleaseReasonEnum, SessionCloseEnum, SessionTypeEnum, WorkerStatusEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from schemas.rdp import (
    RDPResourceCreate,
    RDPResourceResponse,
    RDPResourceUpdate,
    RdpForceReleaseBody,
)
from services.firebase_mirror import (
    delete_active_session,
    mirror_active_session_by_id,
    mirror_rdp_status_by_id,
)
from services.rdp_state import (
    transition_rdp_status,
    validate_worker_may_claim,
)
from .deps import apply_update, get_worker_for_user

logger = logging.getLogger(__name__)
router = APIRouter()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _disconnect_guacamole(redis_client: redis_lib.Redis, resource: RDPResource) -> bool:
    if not resource.guacamole_connection_id:
        return False
    try:
        guac = GuacamoleClient(redis_client)
        killed = guac.kill_active_connections(resource.guacamole_connection_id)
        return killed > 0
    except Exception as exc:
        logger.warning("Guacamole disconnect failed for rdp %s: %s", resource.id, exc)
        return False


def _close_open_sessions_for_rdp(db: Session, rdp_id: UUID) -> list[UUID]:
    """Close open WorkSessions tied to this RDP. Returns closed session ids."""
    closed_ids: list[UUID] = []
    open_sessions = db.exec(
        select(WorkSession).where(
            WorkSession.rdp_resource_id == rdp_id,
            WorkSession.end_time.is_(None),
        )
    ).all()
    now = _utc_now()
    for work_session in open_sessions:
        work_session.end_time = now
        work_session.close_status = SessionCloseEnum.completed
        if work_session.start_time:
            start = work_session.start_time
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            elif start.tzinfo != timezone.utc:
                start = start.astimezone(timezone.utc)
            end_utc = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
            work_session.duration_minutes = max(0, int((end_utc - start).total_seconds() // 60))
        if work_session.type_specific_fields is None:
            work_session.type_specific_fields = {}
        db.add(work_session)
        closed_ids.append(work_session.id)
    return closed_ids


def _open_allocation(db: Session, rdp_id: UUID) -> Allocation | None:
    return db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).first()


def _repair_rdp_state(db: Session, resource: RDPResource) -> bool:
    """
    Fix inconsistent RDP rows after a partial claim/release failure.
    Returns True if the resource row was updated.
    """
    open_alloc = _open_allocation(db, resource.id)
    busy_statuses = {
        RdpStatusEnum.assigned,
        RdpStatusEnum.active,
        RdpStatusEnum.idle,
    }
    repaired = False
    now = _utc_now()

    if open_alloc is None and resource.status in busy_statuses:
        resource.status = RdpStatusEnum.online_free
        resource.assigned_worker_id = None
        resource.status_changed_at = now
        db.add(resource)
        _close_open_sessions_for_rdp(db, resource.id)
        repaired = True
    elif open_alloc is not None:
        if resource.status == RdpStatusEnum.online_free or resource.assigned_worker_id != open_alloc.worker_id:
            resource.status = RdpStatusEnum.active
            resource.assigned_worker_id = open_alloc.worker_id
            resource.status_changed_at = now
            db.add(resource)
            repaired = True

    if repaired:
        db.commit()
        db.refresh(resource)
    return repaired


def _guacamole_viewer_paths(
    redis_client: redis_lib.Redis, connection_id: str
) -> tuple[str | None, str | None, str | None, str | None]:
    """Returns (url, viewer_path, token, error)."""
    try:
        guac = GuacamoleClient(redis_client)
        token = guac.get_token()
        url = guac.get_connection_url(connection_id)
        viewer_path = guac.get_proxied_connection_path(connection_id)
        return url, viewer_path, token, None
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        return None, None, None, err


def _build_claim_payload(
    *,
    allocation: Allocation,
    work_session: WorkSession | None,
    resource: RDPResource,
    worker_id: UUID,
    guacamole_url: str | None,
    guacamole_viewer_path: str | None,
    guacamole_error: str | None,
    resumed: bool = False,
) -> dict:
    return {
        "allocation_id": str(allocation.id),
        "session_id": str(work_session.id) if work_session else None,
        "rdp_resource_id": str(resource.id),
        "worker_id": str(worker_id),
        "status": resource.status.value,
        "guacamole_url": guacamole_url,
        "guacamole_viewer_path": guacamole_viewer_path,
        "guacamole_error": guacamole_error,
        "resumed": resumed,
    }


def _resume_existing_claim(
    db: Session,
    redis_client: redis_lib.Redis,
    *,
    resource: RDPResource,
    allocation: Allocation,
    worker_id: UUID,
) -> dict:
    """Return claim payload for an allocation the worker already holds."""
    if resource.assigned_worker_id != worker_id:
        resource.assigned_worker_id = worker_id
    if resource.status == RdpStatusEnum.online_free:
        resource.status = RdpStatusEnum.active
    resource.status_changed_at = _utc_now()
    db.add(resource)

    work_session = db.exec(
        select(WorkSession).where(
            WorkSession.allocation_id == allocation.id,
            WorkSession.end_time.is_(None),
        )
    ).first()
    if not work_session:
        work_session = db.exec(
            select(WorkSession).where(
                WorkSession.rdp_resource_id == resource.id,
                WorkSession.worker_id == worker_id,
                WorkSession.end_time.is_(None),
            )
        ).first()
    if not work_session:
        now = _utc_now()
        work_session = WorkSession(
            worker_id=worker_id,
            session_type=SessionTypeEnum.gs_rdp,
            allocation_id=allocation.id,
            rdp_resource_id=resource.id,
            client_id=resource.client_id,
            start_time=now,
            type_specific_fields={},
        )
        db.add(work_session)

    db.commit()
    db.refresh(resource)
    if work_session:
        db.refresh(work_session)

    guacamole_url, guacamole_viewer_path, _, guacamole_error = (None, None, None, None)
    if resource.guacamole_connection_id:
        guacamole_url, guacamole_viewer_path, _, guacamole_error = _guacamole_viewer_paths(
            redis_client, resource.guacamole_connection_id
        )

    return _build_claim_payload(
        allocation=allocation,
        work_session=work_session,
        resource=resource,
        worker_id=worker_id,
        guacamole_url=guacamole_url,
        guacamole_viewer_path=guacamole_viewer_path,
        guacamole_error=guacamole_error,
        resumed=True,
    )


def _end_rdp_connection(
    db: Session,
    resource: RDPResource,
    redis_client: redis_lib.Redis,
    *,
    worker_id: UUID | None = None,
    require_owner: bool = True,
    release_reason: ReleaseReasonEnum = ReleaseReasonEnum.completed,
) -> dict:
    db.refresh(resource)
    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.released_at.is_(None),
        )
    ).all()

    # Sync status with an open allocation (partial claim/release drift).
    if open_allocs:
        owner_id = open_allocs[0].worker_id
        if resource.assigned_worker_id != owner_id:
            resource.assigned_worker_id = owner_id
        if resource.status == RdpStatusEnum.online_free:
            resource.status = RdpStatusEnum.active
            resource.status_changed_at = _utc_now()
            db.add(resource)

    owns_via_alloc = (
        worker_id is not None and any(a.worker_id == worker_id for a in open_allocs)
    )
    owns_via_assignment = (
        worker_id is not None and resource.assigned_worker_id == worker_id
    )

    # Orphan: machine marked busy but no open allocation — close stray sessions and reset.
    if not open_allocs and resource.status != RdpStatusEnum.online_free:
        if require_owner and worker_id is not None and resource.assigned_worker_id not in (
            None,
            worker_id,
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have an open claim on this machine",
            )
        closed_session_ids = _close_open_sessions_for_rdp(db, resource.id)
        now = _utc_now()
        resource.status = RdpStatusEnum.online_free
        resource.assigned_worker_id = None
        resource.status_changed_at = now
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return {
            "rdp_resource_id": str(resource.id),
            "status": resource.status.value,
            "released": True,
            "guacamole_disconnected": False,
            "closed_session_ids": [str(sid) for sid in closed_session_ids],
            "repaired_orphan": True,
        }

    if require_owner and worker_id is not None:
        if not owns_via_alloc and not owns_via_assignment:
            if resource.status == RdpStatusEnum.online_free and not open_allocs:
                return {
                    "rdp_resource_id": str(resource.id),
                    "status": resource.status.value,
                    "released": False,
                    "guacamole_disconnected": False,
                    "closed_session_ids": [],
                    "already_released": True,
                }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have an open claim on this machine",
            )

    guacamole_disconnected = _disconnect_guacamole(redis_client, resource)

    now = _utc_now()
    for alloc in open_allocs:
        if (
            worker_id is not None
            and alloc.worker_id != worker_id
            and require_owner
        ):
            continue
        alloc.released_at = now
        alloc.release_reason = release_reason
        db.add(alloc)

    closed_session_ids = _close_open_sessions_for_rdp(db, resource.id)

    resource.status = RdpStatusEnum.online_free
    resource.assigned_worker_id = None
    resource.status_changed_at = now
    db.add(resource)
    db.commit()
    db.refresh(resource)

    return {
        "rdp_resource_id": str(resource.id),
        "status": resource.status.value,
        "released": True,
        "guacamole_disconnected": guacamole_disconnected,
        "closed_session_ids": [str(sid) for sid in closed_session_ids],
    }


@router.get("/my-active")
def get_my_active_rdp(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
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

    _repair_rdp_state(db, resource)

    work_session = db.exec(
        select(WorkSession).where(
            WorkSession.allocation_id == alloc.id,
            WorkSession.end_time.is_(None),
        )
    ).first()

    guacamole_viewer_path: str | None = None
    if resource.guacamole_connection_id:
        try:
            guac = GuacamoleClient(redis_client)
            guacamole_viewer_path = guac.get_proxied_connection_path(
                resource.guacamole_connection_id
            )
        except Exception:
            guacamole_viewer_path = None

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
    _: dict = Depends(require_user),
):
    return db.exec(select(RDPResource).order_by(RDPResource.nickname)).all()


@router.api_route("/tunnel", methods=["GET", "POST"])
async def proxy_guacamole_tunnel(
    request: Request,
    current_user: dict = Depends(require_user),
):
    """
    Proxy the Guacamole HTTP tunnel for the guacamole-common-js viewer.
    Streams responses so remote-desktop frames arrive in real time.
    Auth: Firebase Bearer token (sent by the viewer as an extra tunnel header).
    """
    _ = current_user
    guac_base = settings.GUACAMOLE_URL.rstrip("/")
    query = str(request.url.query)
    if query:
        # Guacamole matches the raw query string ("connect", "read:<uuid>", ...).
        # Proxies (e.g. Next.js rewrites) may percent-encode it or append "=",
        # so restore the original form before forwarding.
        query = unquote(query)
        if query.endswith("=") and "&" not in query and "=" not in query[:-1]:
            query = query[:-1]
    target = f"{guac_base}/tunnel"
    if query:
        target = f"{target}?{query}"

    fwd_headers = {
        k: v for k, v in request.headers.items() if k.lower() == "content-type"
    }
    body = await request.body()

    client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, read=None, write=None, pool=None))
    try:
        upstream_req = client.build_request(
            request.method, target, content=body, headers=fwd_headers
        )
        upstream = await client.send(upstream_req, stream=True)
    except Exception:
        await client.aclose()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Guacamole tunnel is unreachable",
        )

    excluded = {"transfer-encoding", "connection", "content-encoding", "content-length"}
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in excluded
    }

    if upstream.status_code >= 400:
        err_body = await upstream.aread()
        await upstream.aclose()
        await client.aclose()
        logger.warning(
            "Guacamole tunnel %s -> %s: %s",
            query or request.method,
            upstream.status_code,
            err_body[:500],
        )
        return StreamingResponse(
            iter([err_body]),
            status_code=upstream.status_code,
            headers=resp_headers,
        )

    async def _close() -> None:
        await upstream.aclose()
        await client.aclose()

    return StreamingResponse(
        upstream.aiter_raw(),
        status_code=upstream.status_code,
        headers=resp_headers,
        background=BackgroundTask(_close),
    )


@router.get("/{rdp_id}", response_model=RDPResourceResponse)
def get_rdp_resource(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    return resource


@router.post("", response_model=RDPResourceResponse, status_code=status.HTTP_201_CREATED)
def create_rdp_resource(
    body: RDPResourceCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    existing = db.exec(
        select(RDPResource).where(RDPResource.nickname == body.nickname.strip())
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An RDP machine with nickname '{body.nickname}' already exists",
        )
    resource = RDPResource(**body.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    return resource


@router.patch("/{rdp_id}", response_model=RDPResourceResponse)
def update_rdp_resource(
    rdp_id: UUID,
    body: RDPResourceUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    if body.nickname is not None:
        nickname = body.nickname.strip()
        if nickname != resource.nickname:
            taken = db.exec(
                select(RDPResource).where(RDPResource.nickname == nickname)
            ).first()
            if taken:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"An RDP machine with nickname '{nickname}' already exists",
                )

    apply_update(resource, body)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    return resource


@router.post("/{rdp_id}/claim", status_code=status.HTTP_201_CREATED)
def claim_rdp_resource(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    shift_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """
    Claim an online-free RDP machine.
    Creates allocation + work session; returns proxied viewer path for in-app embed.
    """
    worker = get_worker_for_user(db, current_user)
    if not worker.work_ready:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete your onboarding training first — an admin must clear you to start work.",
        )
    if worker.status != WorkerStatusEnum.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your worker status is {worker.status.value} — you cannot claim machines until an admin sets you to active.",
        )
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    _repair_rdp_state(db, resource)

    open_on_this = _open_allocation(db, resource.id)
    if open_on_this:
        if open_on_this.worker_id == worker.id:
            return _resume_existing_claim(
                db, redis_client, resource=resource, allocation=open_on_this, worker_id=worker.id
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This machine is in use by another worker",
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
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have an open session on {name}. End that connection first.",
        )

    approved_shift = validate_worker_may_claim(
        db, resource, worker.id, shift_id=shift_id
    )
    if approved_shift:
        shift_id = approved_shift.id

    lock_key = f"lock:rdp:{rdp_id}"
    acquired = redis_client.set(lock_key, "1", ex=30, nx=True)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="RDP resource is currently being claimed — try again in a moment",
        )

    try:
        guacamole_url: str | None = None
        guacamole_viewer_path: str | None = None
        guacamole_token: str | None = None
        guacamole_error: str | None = None

        if not resource.guacamole_connection_id:
            guacamole_error = "Machine has no guacamole_connection_id configured."
        else:
            guacamole_url, guacamole_viewer_path, guacamole_token, guacamole_error = (
                _guacamole_viewer_paths(redis_client, resource.guacamole_connection_id)
            )
            if guacamole_error:
                logger.warning(
                    "Guacamole URL fetch failed for rdp %s: %s", rdp_id, guacamole_error
                )

        now = _utc_now()
        allocation = Allocation(
            worker_id=worker.id,
            rdp_resource_id=resource.id,
            shift_id=shift_id,
            guacamole_token=guacamole_token,
        )
        resource.status = RdpStatusEnum.active
        resource.assigned_worker_id = worker.id
        resource.status_changed_at = now

        work_session = WorkSession(
            worker_id=worker.id,
            session_type=SessionTypeEnum.gs_rdp,
            allocation_id=None,
            rdp_resource_id=resource.id,
            client_id=resource.client_id,
            start_time=now,
            type_specific_fields={},
        )

        db.add(allocation)
        db.add(resource)
        db.flush()
        work_session.allocation_id = allocation.id
        db.add(work_session)
        db.commit()
        db.refresh(allocation)
        db.refresh(work_session)

        background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
        background_tasks.add_task(mirror_active_session_by_id, work_session.id)

        return _build_claim_payload(
            allocation=allocation,
            work_session=work_session,
            resource=resource,
            worker_id=worker.id,
            guacamole_url=guacamole_url,
            guacamole_viewer_path=guacamole_viewer_path,
            guacamole_error=guacamole_error,
            resumed=False,
        )
    finally:
        redis_client.delete(lock_key)


@router.post("/{rdp_id}/end-connection")
def end_rdp_connection(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """Release DB claim, close work session, and disconnect live Guacamole session."""
    try:
        worker = get_worker_for_user(db, current_user)
        resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
        if not resource:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

        is_admin = current_user.get("role") in {"admin", "super_admin"}
        result = _end_rdp_connection(
            db,
            resource,
            redis_client,
            worker_id=worker.id,
            require_owner=not is_admin,
        )

        background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
        for sid in result.get("closed_session_ids", []):
            background_tasks.add_task(delete_active_session, UUID(str(sid)))

        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("end-connection failed for rdp %s: %s", rdp_id, exc)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to end connection: {type(exc).__name__}",
        ) from exc


@router.post("/{rdp_id}/release")
def release_rdp_resource(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """Alias for end-connection (backward compatible)."""
    return end_rdp_connection(rdp_id, background_tasks, db, current_user, redis_client)


@router.post("/{rdp_id}/lock")
def lock_rdp_resource(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Leadership/admin lock — blocks new claims."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    transition_rdp_status(db, resource, RdpStatusEnum.admin_locked)
    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    return {"rdp_resource_id": str(resource.id), "status": resource.status.value}


@router.post("/{rdp_id}/unlock")
def unlock_rdp_resource(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Clear admin lock; return to online_free or assigned if worker reserved."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    if resource.status != RdpStatusEnum.admin_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Machine is not locked (status={resource.status.value})",
        )
    new_status = (
        RdpStatusEnum.assigned if resource.assigned_worker_id else RdpStatusEnum.online_free
    )
    transition_rdp_status(db, resource, new_status)
    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    return {"rdp_resource_id": str(resource.id), "status": resource.status.value}


@router.post("/{rdp_id}/maintenance")
def maintenance_rdp_resource(
    rdp_id: UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Place machine in maintenance mode."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    transition_rdp_status(db, resource, RdpStatusEnum.maintenance)
    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    return {"rdp_resource_id": str(resource.id), "status": resource.status.value}


@router.post("/{rdp_id}/force-release")
def force_release_rdp_resource(
    rdp_id: UUID,
    body: RdpForceReleaseBody,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """Admin force-release with mandatory reason."""
    if not body.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Release reason is required",
        )
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    result = _end_rdp_connection(
        db,
        resource,
        redis_client,
        worker_id=None,
        require_owner=False,
        release_reason=ReleaseReasonEnum.force_released,
    )
    db.refresh(resource)
    note = f"Force release: {body.reason.strip()}"
    resource.health_notes = f"{resource.health_notes}\n{note}" if resource.health_notes else note
    db.add(resource)
    db.commit()

    background_tasks.add_task(mirror_rdp_status_by_id, resource.id)
    for sid in result.get("closed_session_ids", []):
        background_tasks.add_task(delete_active_session, UUID(str(sid)))

    return {**result, "reason": body.reason.strip()}


@router.get("/{rdp_id}/tunnel-info")
def get_rdp_tunnel_info(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """Return tunnel connect params for guacamole-common-js custom viewer."""
    worker = get_worker_for_user(db, current_user)
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    open_alloc = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.worker_id == worker.id,
            Allocation.released_at.is_(None),
        )
    ).first()
    is_admin = current_user.get("role") in {"admin", "super_admin"}
    if not open_alloc and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have an open claim on this machine",
        )
    if not resource.guacamole_connection_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Machine has no guacamole_connection_id configured",
        )

    guac = GuacamoleClient(redis_client)
    info = guac.get_tunnel_connect_info(resource.guacamole_connection_id)
    return {
        "tunnel_url": "/api/rdp/tunnel",
        "token": info["token"],
        "data_source": info["data_source"],
        "connection_id": info["connection_id"],
    }


@router.websocket("/{rdp_id}/ws-tunnel")
async def rdp_ws_tunnel(websocket: WebSocket, rdp_id: UUID):
    """
    WebSocket proxy for guacamole-common-js WebSocketTunnel.
    The Guacamole auth token never leaves the server — the browser only sends its
    Firebase ID token (as ?firebaseToken=...) plus display hint params.

    Flow:
      1. Verify Firebase token from query param (or DEV bypass).
      2. Confirm the worker has an open allocation for this RDP.
      3. Fetch Guacamole auth token server-side.
      4. Open a WebSocket to Guacamole and relay frames bidirectionally.
    """
    params = websocket.query_params
    firebase_token = params.get("firebaseToken")

    # --- 1. Authenticate ---
    if firebase_token:
        try:
            decoded = verify_firebase_token(firebase_token)
            uid: str = decoded["uid"]
            role: str = decoded.get("role", "user")
        except Exception:
            await websocket.close(code=4001, reason="Invalid auth token")
            return
    elif settings.DEV_AUTH_BYPASS and not settings.is_production:
        uid = "dev-test-user"
        role = settings.DEV_AUTH_ROLE if settings.DEV_AUTH_ROLE in {"user", "admin", "super_admin"} else "user"
    else:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    # --- 2. Extract display hints (forwarded from guacamole-common-js connect data) ---
    width = params.get("GUAC_WIDTH", "1024")
    height = params.get("GUAC_HEIGHT", "768")
    dpi = params.get("GUAC_DPI", "96")
    images: list[str] = params.getlist("GUAC_IMAGE") or ["image/png", "image/jpeg"]

    # --- 3. Verify DB state and ownership ---
    with Session(engine) as db:
        resource = db.get(RDPResource, rdp_id)
        if not resource:
            await websocket.close(code=4004, reason="RDP resource not found")
            return
        if not resource.guacamole_connection_id:
            await websocket.close(code=4002, reason="Machine has no Guacamole connection configured")
            return

        is_admin = role in {"admin", "super_admin"}
        is_dev_bypass = uid == "dev-test-user"

        if not is_admin and not is_dev_bypass:
            admin_user = db.exec(
                select(AdminUser).where(AdminUser.firebase_uid == uid)
            ).first()
            worker = (
                db.exec(select(Worker).where(Worker.admin_user_id == admin_user.id)).first()
                if admin_user else None
            )
            if not worker:
                await websocket.close(code=4003, reason="Worker profile not found")
                return

            open_alloc = db.exec(
                select(Allocation).where(
                    Allocation.rdp_resource_id == rdp_id,
                    Allocation.worker_id == worker.id,
                    Allocation.released_at.is_(None),
                )
            ).first()
            if not open_alloc:
                await websocket.close(code=4003, reason="No open claim on this machine")
                return

        connection_id = resource.guacamole_connection_id

    # --- 4. Fetch Guacamole token server-side ---
    redis_client = get_redis()
    try:
        guac = GuacamoleClient(redis_client)
        info = guac.get_tunnel_connect_info(connection_id)
        guac_token = info["token"]
        data_source = info["data_source"]
    except Exception as exc:
        logger.warning("Failed to get Guacamole token for rdp %s: %s", rdp_id, exc)
        await websocket.close(code=1011, reason="Cannot reach Guacamole server")
        return

    # --- 5. Build Guacamole WebSocket URL ---
    guac_base = settings.GUACAMOLE_URL.rstrip("/")
    guac_ws_base = guac_base.replace("http://", "ws://").replace("https://", "wss://")
    guac_qs = urllib.parse.urlencode(
        [
            ("token", guac_token),
            ("GUAC_DATA_SOURCE", data_source),
            ("GUAC_ID", connection_id),
            ("GUAC_TYPE", "c"),
            ("GUAC_WIDTH", width),
            ("GUAC_HEIGHT", height),
            ("GUAC_DPI", dpi),
        ]
        + [("GUAC_IMAGE", img) for img in images]
    )
    guac_ws_url = f"{guac_ws_base}/websocket-tunnel?{guac_qs}"

    # --- 6. Accept the browser WebSocket ---
    await websocket.accept(subprotocol="guacamole")

    # --- 7. Open upstream connection to Guacamole and relay ---
    async def relay_client_to_guac(guac_ws: ws_lib.ClientConnection) -> None:
        try:
            async for data in websocket.iter_text():
                await guac_ws.send(data)
        except (WebSocketDisconnect, Exception):
            pass

    async def relay_guac_to_client(guac_ws: ws_lib.ClientConnection) -> None:
        try:
            async for msg in guac_ws:
                if isinstance(msg, str):
                    await websocket.send_text(msg)
                else:
                    await websocket.send_bytes(msg)
        except Exception:
            pass

    try:
        async with ws_lib.connect(guac_ws_url, subprotocols=["guacamole"]) as guac_ws:
            c2g = asyncio.create_task(relay_client_to_guac(guac_ws))
            g2c = asyncio.create_task(relay_guac_to_client(guac_ws))
            _done, pending = await asyncio.wait([c2g, g2c], return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
    except Exception as exc:
        logger.warning("WS tunnel error for rdp %s: %s", rdp_id, exc)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
