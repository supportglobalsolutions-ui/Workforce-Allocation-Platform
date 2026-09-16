"""Shared RDP router helpers (Phase 4 Action 3).

Claim/connect/disconnect sequences live in ``rdp_engine``. This module holds
the audit, session-close, preflight, response-shaping, and tunnel-prep helpers
that the thin HTTP routers call into — so ``routers/rdp.py`` stays a wiring
layer instead of a second engine.
"""
from __future__ import annotations

import logging
import urllib.parse
from datetime import datetime, timezone
from uuid import UUID

import redis as redis_lib
from fastapi import HTTPException, Request, status
from sqlmodel import Session, select

from core.database import engine
from core.guacamole import GuacamoleClient, raw_connection_id
from core.permissions import STAFF_ROLES
from core.redis import get_redis
from models.allocation import Allocation
from models.client import Client
from models.enums import RdpStatusEnum, ReleaseReasonEnum, SessionCloseEnum, SessionTypeEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from schemas.rdp import (
    RDPResourceCreate,
    RDPResourceResponse,
    RDPResourceUpdate,
    RdpProvisionBody,
)
from services.audit_service import record_audit
from services.client_owners import client_owner_name
from services.guacamole_provision import (
    GuacamoleProvisionError,
    store_credentials,
    sync_connection,
)
from services.rdp_engine import (
    disconnect as engine_disconnect,
    mark_tunnel_connected as engine_mark_tunnel_connected,
    mark_tunnel_disconnected as engine_mark_tunnel_disconnected,
    prepare_connect as engine_prepare_connect,
    release_tunnel_lock,
)
from services.rdp_health import probe_rdp_host
from routers.deps import get_worker_for_user

logger = logging.getLogger(__name__)


def preflight_rdp(resource: RDPResource) -> dict:
    """Check Guacamole id + TCP reachability before a worker claims."""
    raw_id = raw_connection_id(resource.guacamole_connection_id)
    if not raw_id:
        return {
            "ok": False,
            "error": "This machine is not linked to a remote-desktop connection yet. Ask an admin to provision it.",
            "guacamole_connection_id": None,
            "host": resource.monitor_host,
            "port": resource.monitor_port or 3389,
        }
    tcp = probe_rdp_host(resource.monitor_host, resource.monitor_port)
    if not tcp["ok"]:
        return {
            "ok": False,
            "error": tcp["error"],
            "guacamole_connection_id": raw_id,
            "host": tcp.get("host"),
            "port": tcp.get("port"),
        }
    return {
        "ok": True,
        "error": None,
        "guacamole_connection_id": raw_id,
        "host": tcp.get("host"),
        "port": tcp.get("port"),
    }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def request_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    if request.client:
        return request.client.host
    return None


def record_rdp_login(
    db: Session,
    *,
    worker: Worker,
    resource: RDPResource,
    session_id: UUID,
    ip_address: str | None = None,
) -> None:
    record_audit(
        db,
        action="rdp.logged_in",
        target_type="rdp_access",
        target_id=resource.id,
        new_value={
            "worker_id": str(worker.id),
            "worker_name": worker.display_name,
            "rdp_id": str(resource.id),
            "rdp_nickname": resource.nickname,
            "session_id": str(session_id),
            "at": utc_now().isoformat(),
        },
        ip_address=ip_address,
    )


def record_rdp_logout(
    db: Session,
    *,
    worker: Worker | None,
    resource: RDPResource,
    session_ids: list[str],
    ip_address: str | None = None,
    initiated_by: str = "worker",
    admin_id: UUID | None = None,
) -> None:
    if worker is None:
        return
    record_audit(
        db,
        actor_id=admin_id,
        action="rdp.logged_out",
        target_type="rdp_access",
        target_id=resource.id,
        new_value={
            "worker_id": str(worker.id),
            "worker_name": worker.display_name,
            "rdp_id": str(resource.id),
            "rdp_nickname": resource.nickname,
            "session_ids": session_ids,
            "initiated_by": initiated_by,
            "at": utc_now().isoformat(),
        },
        ip_address=ip_address,
    )


def rdp_response(
    db: Session,
    resource: RDPResource,
    *,
    viewer: dict | None = None,
    viewer_worker_id: UUID | None = None,
) -> RDPResourceResponse:
    """
    Serialise a machine for the caller.

    Identities are admin-only: a worker may see that a machine is taken, and
    that they themselves hold it, but not which colleague is on it. Pass
    `viewer` to apply that masking — omitting it returns the full record.
    """
    resp = RDPResourceResponse.model_validate(resource)
    is_admin = viewer is None or viewer.get("role") in STAFF_ROLES

    if resource.assigned_worker_id:
        if is_admin or (
            viewer_worker_id is not None
            and resource.assigned_worker_id == viewer_worker_id
        ):
            worker = db.get(Worker, resource.assigned_worker_id)
            resp.assigned_worker_name = worker.display_name if worker else None
        else:
            resp.assigned_worker_name = "In use"
            resp.assigned_worker_id = None
    if resource.client_id:
        client = db.get(Client, resource.client_id)
        if client:
            resp.client_name = client.name
            resp.owner_type = client.owner_type.value if client.owner_type else None
            # The owner is a person (partner/account holder) — admins only.
            resp.owner_name = client_owner_name(db, client) if is_admin else None
    return resp


def disconnect_guacamole(redis_client: redis_lib.Redis, resource: RDPResource) -> bool:
    if not resource.guacamole_connection_id:
        return False
    try:
        guac = GuacamoleClient(redis_client)
        killed = guac.kill_active_connections(resource.guacamole_connection_id)
        return killed > 0
    except Exception as exc:
        logger.warning("Guacamole disconnect failed for rdp %s: %s", resource.id, exc)
        return False


def _bgdisconnect_guacamole(connection_id: str) -> None:
    """Best-effort Guacamole kill off the request path so end-connection stays fast."""
    if not connection_id:
        return
    try:
        from core.redis import get_redis

        guac = GuacamoleClient(get_redis())
        guac.kill_active_connections(connection_id)
    except Exception as exc:
        logger.warning("Background Guacamole disconnect failed for %s: %s", connection_id, exc)


def close_open_sessions_for_rdp(db: Session, rdp_id: UUID) -> list[UUID]:
    """Close open WorkSessions tied to this RDP. Returns closed session ids."""
    closed_ids: list[UUID] = []
    open_sessions = db.exec(
        select(WorkSession).where(
            WorkSession.rdp_resource_id == rdp_id,
            WorkSession.end_time.is_(None),
        )
    ).all()
    now = utc_now()
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
    # Remind workers to add start/end images + on-image times.
    from services.session_evidence import notify_evidence_incomplete
    for work_session in open_sessions:
        notify_evidence_incomplete(db, work_session)
    return closed_ids


def open_allocation(db: Session, rdp_id: UUID) -> Allocation | None:
    return db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.released_at.is_(None),
        )
    ).first()


def repair_rdp_state(db: Session, resource: RDPResource) -> Allocation | None:
    """
    Fix inconsistent RDP rows after a partial claim/release failure.

    Returns the machine's open allocation (or None). Callers need that anyway,
    and re-querying it costs a full network round-trip against a remote DB.
    """
    open_alloc = open_allocation(db, resource.id)
    busy_statuses = {
        RdpStatusEnum.assigned,
        RdpStatusEnum.active,
        RdpStatusEnum.idle,
    }
    repaired = False
    now = utc_now()

    if open_alloc is None and resource.status in busy_statuses:
        resource.status = RdpStatusEnum.online_free
        resource.assigned_worker_id = None
        resource.status_changed_at = now
        db.add(resource)
        close_open_sessions_for_rdp(db, resource.id)
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
    return open_alloc


def guacamole_viewer_paths(
    redis_client: redis_lib.Redis, connection_id: str
) -> tuple[str | None, str | None, str | None, str | None]:
    """Returns (url, viewer_path, token, error).

    Token is always None — Guacamole admin auth must stay server-side.
    """
    try:
        guac = GuacamoleClient(redis_client)
        # Touch Guacamole so a dead gateway surfaces as guacamole_error.
        guac.get_token()
        url = guac.get_connection_url(connection_id)
        viewer_path = guac.get_proxied_connection_path(connection_id)
        return url, viewer_path, None, None
    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        return None, None, None, err


def _workeropen_allocation_for_rdp(
    db: Session, *, worker_id: UUID, rdp_id: UUID
) -> Allocation | None:
    return db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == rdp_id,
            Allocation.worker_id == worker_id,
            Allocation.released_at.is_(None),
        )
    ).first()


def require_claimed_machine_or_staff(
    db: Session,
    current_user: dict,
    rdp_id: UUID,
) -> None:
    """Workers may only touch a machine they currently hold; staff may any."""
    if current_user.get("role") in STAFF_ROLES:
        return
    worker = get_worker_for_user(db, current_user)
    if _workeropen_allocation_for_rdp(db, worker_id=worker.id, rdp_id=rdp_id):
        return
    # Non-disclosing — do not confirm the machine exists to the wrong worker.
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="This desktop is no longer available. Return to your desktops.",
    )


def prepare_ws_tunnel(*, rdp_id: UUID, uid: str, role: str, takeover: bool = False) -> dict:
    """Blocking DB and Guacamole preparation, run outside the async loop."""
    with Session(engine) as db:
        outcome = engine_prepare_connect(
            db,
            rdp_id=rdp_id,
            uid=uid,
            role=role,
            staff_roles=STAFF_ROLES,
            takeover=takeover,
        )
        if not outcome.ok:
            raise HTTPException(status_code=outcome.http_status, detail=outcome.friendly)
        return {
            "connection_id": str(outcome.data["connection_id"]),
            "allocation_id": outcome.data.get("allocation_id"),
            "connection_generation": outcome.data.get("connection_generation"),
            "tunnel_epoch": outcome.data.get("tunnel_epoch"),
        }


def mark_ws_tunnel_connected(
    rdp_id: UUID, *, connection_generation: int | None = None
) -> None:
    with Session(engine) as db:
        engine_mark_tunnel_connected(
            db, rdp_id, connection_generation=connection_generation
        )


def mark_ws_tunnel_disconnected(rdp_id: UUID, *, connection_generation: int | None = None) -> None:
    """Start grace only after the desktop tunnel actually ends."""
    with Session(engine) as db:
        engine_mark_tunnel_disconnected(
            db, rdp_id, connection_generation=connection_generation
        )


def release_ws_tunnel_lock(
    rdp_id: UUID,
    *,
    allocation_id: str | None,
    connection_generation: int | None,
) -> None:
    redis_client = get_redis()
    alloc_uuid = None
    if allocation_id:
        try:
            alloc_uuid = UUID(str(allocation_id))
        except ValueError:
            alloc_uuid = None
    release_tunnel_lock(
        redis_client,
        rdp_id=rdp_id,
        allocation_id=alloc_uuid,
        connection_generation=connection_generation,
    )


def build_claim_payload(
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
        "connection_generation": int(getattr(allocation, "connection_generation", 1) or 1),
    }


def resume_existing_claim(
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
    resource.status_changed_at = utc_now()
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
        now = utc_now()
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
    if not resource.guacamole_connection_id:
        guacamole_error = "Machine has no guacamole_connection_id configured."

    return build_claim_payload(
        allocation=allocation,
        work_session=work_session,
        resource=resource,
        worker_id=worker_id,
        guacamole_url=guacamole_url,
        guacamole_viewer_path=guacamole_viewer_path,
        guacamole_error=guacamole_error,
        resumed=True,
    )


def end_rdp_connection(
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
) -> dict:
    """Thin wrapper — sequence lives in services.rdp_engine.disconnect."""
    outcome = engine_disconnect(
        db,
        resource,
        redis_client,
        worker_id=worker_id,
        require_owner=require_owner,
        release_reason=release_reason,
        ip_address=ip_address,
        initiated_by=initiated_by,
        admin_id=admin_id,
        allocation_id=allocation_id,
        connection_generation=connection_generation,
        close_sessions_fn=close_open_sessions_for_rdp,
        record_logout_fn=record_rdp_logout,
    )
    return outcome.raise_if_error()

def viewer_worker_id(db: Session, current_user: dict) -> UUID | None:
    """The caller's own worker id, when they have one. None for pure admins."""
    if current_user.get("role") in STAFF_ROLES:
        return None
    try:
        return get_worker_for_user(db, current_user).id
    except Exception:
        return None

def ticket_from_original_uri(original_uri: str | None) -> str:
    """Pull `rdp_ticket` out of the URI Nginx was asked to authorise.

    `auth_request` fires a GET at this endpoint with no query of its own, so
    the ticket arrives in the `X-Original-URI` header Nginx copies from the
    request being checked (the pattern from the ngx_http_auth_request_module
    docs).
    """
    if not original_uri or "?" not in original_uri:
        return ""
    query = urllib.parse.parse_qs(original_uri.split("?", 1)[1])
    values = query.get("rdp_ticket") or []
    return values[0] if values else ""


def provision_guacamole(
    db: Session,
    resource: RDPResource,
    redis_client: redis_lib.Redis,
    creds: RDPResourceCreate | RDPResourceUpdate | RdpProvisionBody,
    *, strict: bool = False,
) -> str | None:
    """
    Create/update the machine's Guacamole connection and persist the id.
    Returns an error string instead of raising unless `strict` is set, so an
    unreachable Guacamole never blocks saving the machine record.
    """
    # Re-read before writing. The reconcile loop runs in its own session and
    # may have just repaired guacamole_connection_id; committing a request's
    # stale copy of this row would silently revert it to a connection that no
    # longer exists, and the viewer would fail with 516.
    try:
        db.refresh(resource)
    except Exception:
        pass

    # Keep the credentials on the machine (password encrypted) so the
    # connection can be rebuilt on any Guacamole instance without an admin
    # retyping it — a fresh VPS starts with an empty Guacamole database.
    if store_credentials(
        resource,
        username=creds.rdp_username,
        password=creds.rdp_password,
        domain=creds.rdp_domain,
    ):
        db.add(resource)
        db.commit()
        db.refresh(resource)

    try:
        result = sync_connection(
            redis_client,
            resource,
            username=creds.rdp_username,
            password=creds.rdp_password,
            domain=creds.rdp_domain,
        )
    except GuacamoleProvisionError as exc:
        if strict:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)
            ) from exc
        logger.warning("Guacamole provisioning for %s failed: %s", resource.nickname, exc)
        return str(exc)

    if resource.guacamole_connection_id != result.connection_id:
        resource.guacamole_connection_id = result.connection_id
        db.add(resource)
        db.commit()
        db.refresh(resource)
    return None


