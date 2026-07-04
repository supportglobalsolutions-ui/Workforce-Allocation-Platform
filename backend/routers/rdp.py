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
        alloc.release_reason = ReleaseReasonEnum.completed
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
