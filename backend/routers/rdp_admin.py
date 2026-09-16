"""RDP admin CRUD + status transitions (Phase 4 Action 3)."""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from core.redis import get_redis
from models.enums import RdpStatusEnum
from models.rdp_machine import RDPResource
from schemas.rdp import (
    CREDENTIAL_FIELDS,
    RDPResourceResponse,
    RDPResourceUpdate,
    RdpProvisionBody,
    RdpProvisionResult,
)
from services.rdp_state import transition_rdp_status
from services.rdp_support import provision_guacamole, rdp_response

logger = logging.getLogger(__name__)
router = APIRouter()

@router.patch("/{rdp_id}", response_model=RDPResourceResponse)
def update_rdp_resource(
    rdp_id: UUID,
    body: RDPResourceUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
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

    set_fields = set(body.model_dump(exclude_unset=True))
    # Credentials are write-only pass-throughs to Guacamole — never columns.
    for field, value in body.model_dump(
        exclude_unset=True, exclude=CREDENTIAL_FIELDS
    ).items():
        setattr(resource, field, value)
    db.add(resource)
    db.commit()
    db.refresh(resource)

    # Keep Guacamole in sync when connection-relevant fields or credentials change.
    connection_fields = {"nickname", "monitor_host", "monitor_port"}
    creds_supplied = bool(set_fields & {"rdp_username", "rdp_password", "rdp_domain"})
    should_sync = body.auto_provision and resource.monitor_host and (
        creds_supplied
        or not resource.guacamole_connection_id
        or bool(set_fields & connection_fields)
    )
    if should_sync:
        error = provision_guacamole(db, resource, redis_client, body, strict=creds_supplied)
        if error:
            logger.warning("RDP %s saved but Guacamole sync failed: %s", resource.nickname, error)
    return rdp_response(db, resource)


@router.post("/{rdp_id}/provision", response_model=RdpProvisionResult)
def provision_rdp_connection(
    rdp_id: UUID,
    body: RdpProvisionBody,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """
    Create or repair this machine's Guacamole connection on demand.
    Idempotent: adopts an existing connection with the same nickname, otherwise
    creates one, then stores the identifier on the machine.
    """
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    if not resource.monitor_host:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Set the machine's host/IP first",
        )

    before = resource.guacamole_connection_id
    provision_guacamole(db, resource, redis_client, body, strict=True)
    return RdpProvisionResult(
        rdp_resource_id=str(resource.id),
        guacamole_connection_id=resource.guacamole_connection_id,
        created=before != resource.guacamole_connection_id,
        provisioned=True,
    )



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
    return {"rdp_resource_id": str(resource.id), "status": resource.status.value}



