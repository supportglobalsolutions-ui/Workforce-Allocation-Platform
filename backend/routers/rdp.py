import logging
from datetime import datetime, timezone
from uuid import UUID

import redis as redis_lib
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlmodel import Session, select

from core.config import settings
from core.database import get_db
from core.guacamole import GuacamoleClient
from core.permissions import require_admin, require_user
from core.redis import get_redis
from models.allocation import Allocation
from models.enums import RdpStatusEnum, ReleaseReasonEnum, SessionCloseEnum, SessionTypeEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from schemas.rdp import RDPResourceCreate, RDPResourceResponse, RDPResourceUpdate
from services.firebase_mirror import (
    delete_active_session,
    mirror_active_session_by_id,
    mirror_rdp_status_by_id,
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
            work_session.duration_minutes = max(0, int((now - start).total_seconds() // 60))
        db.add(work_session)
        closed_ids.append(work_session.id)
    return closed_ids


def _end_rdp_connection(
    db: Session,
    resource: RDPResource,
    redis_client: redis_lib.Redis,
    *,
    worker_id: UUID | None = None,
    require_owner: bool = True,
) -> dict:
    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.released_at.is_(None),
        )
    ).all()

    if require_owner and worker_id is not None:
        if not open_allocs or all(a.worker_id != worker_id for a in open_allocs):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have an open claim on this machine",
            )

    guacamole_disconnected = _disconnect_guacamole(redis_client, resource)

    now = _utc_now()
    for alloc in open_allocs:
        if worker_id is not None and alloc.worker_id != worker_id and require_owner:
            continue
        alloc.released_at = now
        alloc.release_reason = ReleaseReasonEnum.completed
        db.add(alloc)

    closed_session_ids = _close_open_sessions_for_rdp(db, resource.id)

    resource.status = RdpStatusEnum.online_free
    resource.assigned_worker_id = None
    db.add(resource)
    db.commit()

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
    Proxy Guacamole HTTP tunnel for guacamole-common-js custom viewer.
    Requires connect + token query params from tunnel-info.
    """
    _ = current_user
    guac_base = settings.GUACAMOLE_URL.rstrip("/")
    query = str(request.url.query)
    target = f"{guac_base}/tunnel"
    if query:
        target = f"{target}?{query}"

    import httpx

    async with httpx.AsyncClient(timeout=60.0) as client:
        if request.method == "GET":
            upstream = await client.get(target)
        else:
            body = await request.body()
            upstream = await client.post(
                target,
                content=body,
                headers={
                    k: v
                    for k, v in request.headers.items()
                    if k.lower() in {"content-type", "guacamole-tunnel-token"}
                },
            )

    excluded = {"transfer-encoding", "connection", "content-encoding"}
    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in excluded
    }
    return Response(content=upstream.content, status_code=upstream.status_code, headers=resp_headers)


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
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    if resource.status != RdpStatusEnum.online_free:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"RDP resource is not claimable (status={resource.status})",
        )

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
            try:
                guac = GuacamoleClient(redis_client)
                guacamole_token = guac.get_token()
                guacamole_url = guac.get_connection_url(resource.guacamole_connection_id)
                guacamole_viewer_path = guac.get_proxied_connection_path(
                    resource.guacamole_connection_id
                )
            except Exception as exc:
                guacamole_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Guacamole URL fetch failed for rdp %s: %s", rdp_id, guacamole_error)

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
            allocation_id=None,  # set after allocation flush
            rdp_resource_id=resource.id,
            start_time=now,
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

        return {
            "allocation_id": str(allocation.id),
            "session_id": str(work_session.id),
            "rdp_resource_id": str(resource.id),
            "worker_id": str(worker.id),
            "status": resource.status.value,
            "guacamole_url": guacamole_url,
            "guacamole_viewer_path": guacamole_viewer_path,
            "guacamole_error": guacamole_error,
        }
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
        background_tasks.add_task(delete_active_session, UUID(sid))

    return result


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
    connect, token = guac.get_tunnel_params(resource.guacamole_connection_id)
    return {
        "tunnel_url": "/api/rdp/tunnel",
        "connect": connect,
        "token": token,
    }
