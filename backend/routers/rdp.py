import logging
from datetime import datetime
from uuid import UUID

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.guacamole import GuacamoleClient
from core.permissions import require_admin, require_user
from core.redis import get_redis
from models.allocation import Allocation
from models.enums import RdpStatusEnum, ReleaseReasonEnum
from models.rdp_machine import RDPResource
from schemas.rdp import RDPResourceCreate, RDPResourceResponse, RDPResourceUpdate
from .deps import apply_update, get_worker_for_user

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=list[RDPResourceResponse])
def list_rdp_resources(
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    return db.exec(select(RDPResource).order_by(RDPResource.nickname)).all()


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
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    resource = RDPResource(**body.model_dump())
    db.add(resource)
    db.commit()
    db.refresh(resource)
    return resource


@router.patch("/{rdp_id}", response_model=RDPResourceResponse)
def update_rdp_resource(
    rdp_id: UUID,
    body: RDPResourceUpdate,
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
    return resource


@router.post("/{rdp_id}/claim", status_code=status.HTTP_201_CREATED)
def claim_rdp_resource(
    rdp_id: UUID,
    shift_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client: redis_lib.Redis = Depends(get_redis),
):
    """
    Claim an online-free RDP machine.
    - Redis SETNX lock prevents race conditions at the application layer.
    - The partial unique index on allocations provides the hard DB-level stop.
    - Guacamole token is fetched and stored; claim succeeds even if Guacamole is down.
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

    lock_key = f"rdp:claim:{rdp_id}"
    acquired = redis_client.set(lock_key, "1", ex=30, nx=True)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="RDP resource is currently being claimed — try again in a moment",
        )

    try:
        guacamole_url: str | None = None
        guacamole_token: str | None = None
        guacamole_error: str | None = None

        if not resource.guacamole_connection_id:
            guacamole_error = "Machine has no guacamole_connection_id configured."
        else:
            try:
                guac = GuacamoleClient(redis_client)
                guacamole_token = guac.get_token()
                guacamole_url = guac.get_connection_url(resource.guacamole_connection_id)
            except Exception as exc:  # Guacamole unavailable — claim still succeeds
                guacamole_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Guacamole URL fetch failed for rdp %s: %s", rdp_id, guacamole_error)

        allocation = Allocation(
            worker_id=worker.id,
            rdp_resource_id=resource.id,
            shift_id=shift_id,
            guacamole_token=guacamole_token,
        )
        resource.status = RdpStatusEnum.assigned
        resource.assigned_worker_id = worker.id

        db.add(allocation)
        db.add(resource)
        db.commit()
        db.refresh(allocation)

        return {
            "allocation_id":   str(allocation.id),
            "rdp_resource_id": str(resource.id),
            "worker_id":       str(worker.id),
            "status":          resource.status.value,
            "guacamole_url":   guacamole_url,
            "guacamole_error": guacamole_error,
        }
    finally:
        redis_client.delete(lock_key)


@router.post("/{rdp_id}/release")
def release_rdp_resource(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """
    Release a claimed machine: close its open allocation and set it back to
    online_free so it can be claimed again. (Used by active-session and for testing.)
    """
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).all()
    for alloc in open_allocs:
        alloc.released_at = datetime.utcnow()
        alloc.release_reason = ReleaseReasonEnum.completed
        db.add(alloc)

    resource.status = RdpStatusEnum.online_free
    resource.assigned_worker_id = None
    db.add(resource)
    db.commit()

    return {"rdp_resource_id": str(rdp_id), "status": resource.status.value}
