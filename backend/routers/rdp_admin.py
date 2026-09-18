"""RDP admin CRUD + status transitions (Phase 4 Action 3)."""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from core.redis import get_redis
from models.enums import RdpStatusEnum
from models.rdp_machine import RDPResource
from routers.deps import get_admin_user
from schemas.rdp import (
    CREDENTIAL_FIELDS,
    RDPResourceResponse,
    RDPResourceUpdate,
    RdpProvisionBody,
    RdpProvisionResult,
)
from services.admin_otp import PURPOSE_DELETE_RDP, issue_otp, verify_otp
from services.audit_service import record_audit
from services.email_resend import render_otp_html, render_otp_text
from services.rdp_purge import purge_rdp_resource
from services.rdp_state import transition_rdp_status
from services.rdp_support import provision_guacamole, rdp_response, set_allowed_workers
from services.security_risk import maybe_notify_threshold, record_event

logger = logging.getLogger(__name__)
router = APIRouter()


class DeleteRdpConfirm(BaseModel):
    challenge_id: UUID
    code: str

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
    # Credentials are write-only pass-throughs to Guacamole — never columns,
    # and the audience lives in its own table rather than on the row.
    for field, value in body.model_dump(
        exclude_unset=True, exclude=CREDENTIAL_FIELDS | {"allowed_worker_ids"}
    ).items():
        setattr(resource, field, value)
    db.add(resource)
    db.commit()
    db.refresh(resource)
    set_allowed_workers(db, resource, body.allowed_worker_ids)

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
    """Clear admin lock or maintenance; return to online_free or assigned."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    if resource.status not in {RdpStatusEnum.admin_locked, RdpStatusEnum.maintenance}:
        # Already claimable — treat as success so the status switch is idempotent.
        if resource.status in {
            RdpStatusEnum.online_free,
            RdpStatusEnum.assigned,
            RdpStatusEnum.active,
            RdpStatusEnum.idle,
        }:
            return {"rdp_resource_id": str(resource.id), "status": resource.status.value}
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Machine is not locked or in maintenance (status={resource.status.value})",
        )

    from services.rdp_quarantine import is_quarantine_held

    if resource.status == RdpStatusEnum.maintenance and is_quarantine_held(db, resource.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This desktop is held after an unconfirmed disconnect. "
                "Use Repair on the Held / quarantined list before bringing it online."
            ),
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


class RdpSetStatusBody(BaseModel):
    mode: str  # online | locked | maintenance


@router.post("/{rdp_id}/set-status", response_model=RDPResourceResponse)
def set_rdp_status(
    rdp_id: UUID,
    body: RdpSetStatusBody,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Single switch for Online / Locked / Maintenance (admin UI)."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    mode = (body.mode or "").strip().lower()
    if mode == "online":
        if resource.status in {RdpStatusEnum.admin_locked, RdpStatusEnum.maintenance}:
            new_status = (
                RdpStatusEnum.assigned
                if resource.assigned_worker_id
                else RdpStatusEnum.online_free
            )
            transition_rdp_status(db, resource, new_status)
        elif resource.status not in {
            RdpStatusEnum.online_free,
            RdpStatusEnum.assigned,
            RdpStatusEnum.active,
            RdpStatusEnum.idle,
        }:
            transition_rdp_status(db, resource, RdpStatusEnum.online_free)
    elif mode == "locked":
        transition_rdp_status(db, resource, RdpStatusEnum.admin_locked)
    elif mode == "maintenance":
        transition_rdp_status(db, resource, RdpStatusEnum.maintenance)
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="mode must be online, locked, or maintenance",
        )
    return rdp_response(db, resource)


@router.get("/{rdp_id}/credentials")
def get_rdp_credentials(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin-only plaintext credentials for the eye-reveal control."""
    from core.crypto import decrypt_secret

    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    return {
        "rdp_resource_id": str(resource.id),
        "rdp_username": resource.rdp_username,
        "rdp_password": decrypt_secret(resource.rdp_password_enc),
        "rdp_domain": resource.rdp_domain,
        "has_rdp_password": bool(resource.rdp_password_enc),
    }


@router.post("/{rdp_id}/delete/request-otp")
def request_rdp_delete_otp(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Email a confirmation code before permanently removing a machine."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    admin = get_admin_user(db, current_user)
    html = render_otp_html(
        title="Confirm RDP machine deletion",
        intro=(
            f"An administrator asked to permanently delete the RDP machine "
            f"<strong>{resource.nickname}</strong>. Enter this code in the platform to continue."
        ),
        warning="This cannot be undone. Open sessions are ended and the Guacamole connection is removed.",
    )
    text = render_otp_text(
        title="Confirm RDP machine deletion",
        intro=f"An administrator asked to permanently delete the RDP machine {resource.nickname}.",
        warning="This cannot be undone.",
    )
    payload = issue_otp(
        db,
        purpose=PURPOSE_DELETE_RDP,
        target_id=resource.id,
        subject=f"Confirmation code — delete {resource.nickname}",
        html=html,
        text=text,
        admin=admin,
    )
    payload["nickname"] = resource.nickname
    return payload


@router.post("/{rdp_id}/delete/confirm")
def confirm_rdp_delete(
    rdp_id: UUID,
    body: DeleteRdpConfirm,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """Consume a valid code and purge the RDP machine."""
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    verify_otp(
        db,
        challenge_id=body.challenge_id,
        purpose=PURPOSE_DELETE_RDP,
        target_id=resource.id,
        code=body.code,
    )

    admin = get_admin_user(db, current_user)
    nickname = resource.nickname
    result = purge_rdp_resource(db, redis_client, rdp_id)
    if not result.get("deleted"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")

    record_audit(
        db,
        actor_id=admin.id,
        action="rdp.deleted",
        target_type="rdp_resource",
        target_id=rdp_id,
        previous_value=result.get("machine"),
        reason_note="Deleted after email confirmation code",
    )
    record_event(
        db,
        admin_user_id=admin.id,
        event_type="rdp_deleted",
        payload={"rdp_id": str(rdp_id), "nickname": nickname},
    )
    maybe_notify_threshold(db, admin_user_id=admin.id, admin_email=admin.email)
    db.commit()
    return {"deleted": True, "nickname": nickname, "rdp_resource_id": str(rdp_id)}


