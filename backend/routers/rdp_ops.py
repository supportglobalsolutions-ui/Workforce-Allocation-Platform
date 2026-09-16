"""RDP ops endpoints: health, capacity, quarantine, gateways (Phase 4 Action 3)."""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from core.config import settings
from core.database import get_db
from core.guacamole import GuacamoleClient, raw_connection_id
from core.permissions import require_admin
from core.redis import get_redis
from models.rdp_machine import RDPResource
from services.rdp_gateway import verify_join_ticket
from services.rdp_support import ticket_from_original_uri
from sqlmodel import select
from .deps import get_admin_user

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/guacamole/health")
def guacamole_health(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """
    End-to-end check of the Guacamole side of the RDP flow:
    server reachable, API credentials valid, and every machine's stored
    connection id still resolving to a real connection.
    """
    report: dict = {
        "guacamole_url": settings.GUACAMOLE_URL,
        "reachable": False,
        "authenticated": False,
        "error": None,
        "connection_count": 0,
        "machines": [],
    }

    connections: dict[str, dict] = {}
    try:
        guac = GuacamoleClient(redis_client)
        guac.get_token()
        report["reachable"] = True
        report["authenticated"] = True
        connections = guac.list_connections()
        report["connection_count"] = len(connections)
    except Exception as exc:
        report["error"] = f"{type(exc).__name__}: {exc}"

    for resource in db.exec(select(RDPResource).order_by(RDPResource.nickname)).all():
        cid = raw_connection_id(resource.guacamole_connection_id)
        if not cid:
            state = "missing"
        elif not report["authenticated"]:
            state = "unknown"
        elif cid in {str(k) for k in connections}:
            state = "ok"
        else:
            state = "stale"
        report["machines"].append(
            {
                "id": str(resource.id),
                "nickname": resource.nickname,
                "monitor_host": resource.monitor_host,
                "guacamole_connection_id": cid,
                "connection_state": state,
                "ready": state == "ok",
            }
        )
    return report


@router.get("/health/degraded")
def rdp_degraded_health(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """
    Is the control plane currently allowed to take machines away? (Phase 8)

    When Redis or Postgres is unreachable — or we are inside the post-outage
    recovery window — every releasing action is frozen. That is correct, but
    silent, so this endpoint makes it something an admin can see rather than
    infer from machines that stop being freed.
    """
    from services.rdp_degraded import degraded_status

    return degraded_status(redis_client, db)


@router.get("/coordinator")
def rdp_coordinator_status(
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """
    Is a session coordinator alive, and is it the right one? (Phase 4 Action 2)

    Production wants exactly one standalone `workforce-rdp-coordinator` and
    `RDP_RUN_COORDINATOR_IN_API=false` on the API hosts. This reports which
    instance last ticked, whether it holds the lease, how long ago, and whether
    it is running inside an API process — so enabling the unit can be verified
    instead of assumed.
    """
    from services.rdp_coordinator import coordinator_status

    return coordinator_status(redis_client)


@router.get("/capacity")
def rdp_capacity_snapshot(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """
    Where the live-session cap currently stands (Phase 3 Action 5).

    Breaks the number down rather than just reporting a total, because the parts
    behave differently: allocations in their grace window still hold a seat for
    a returning worker, and held machines hold one because a tunnel may still be
    alive on the gateway. A measured load test needs to see all three to set the
    cap honestly.
    """
    from services.rdp_capacity import capacity_snapshot

    return capacity_snapshot(db)


@router.get("/quarantined")
def list_quarantined_allocations(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """
    Everything out of service because a closure could not be confirmed.

    Two distinct cases, both needing an admin's attention:
      * `quarantined` — an allocation still open and stuck mid-close;
      * `held` — the worker left cleanly, but we never proved the tunnel died,
        so the machine is kept out of the pool (Phase 3 Action 3).
    """
    from services.rdp_quarantine import list_held_machines, list_quarantined

    return {
        "quarantined": list_quarantined(db),
        "held": list_held_machines(db),
    }


@router.post("/{rdp_id}/repair")
def repair_rdp_resource(
    rdp_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """
    Retry the closure that stranded this machine (Phase 8 Action 2).

    Success unwinds through the normal disconnect path, so audit, work
    sessions and capacity all settle exactly as they would have. Failure
    leaves the machine quarantined with an updated reason — a repair that
    cannot prove the tunnel is gone must never free the seat.
    """
    from services.rdp_quarantine import repair_quarantined

    admin = get_admin_user(db, current_user)
    result = repair_quarantined(db, redis_client, rdp_id, admin_id=admin.id)
    if not result.get("ok"):
        code = result.get("code")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND
            if code == "not_found"
            else status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.get("friendly") or "Repair did not complete.",
        )
    return result


@router.get("/gateways")
def list_rdp_gateways(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """Admin view of media-plane nodes, live seats, and drain state (Phase 7)."""
    from services.rdp_gateway_cluster import list_gateways_status

    return {"gateways": list_gateways_status(db, redis_client)}


@router.post("/gateways/{gateway_id}/drain")
def drain_rdp_gateway(
    gateway_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """Stop placing new sessions on this gateway. Existing tunnels keep running."""
    from services.rdp_gateway_cluster import find_gateway, list_gateways_status, set_draining

    # Strict lookup on purpose: get_gateway() falls back to the default node,
    # so a mistyped id would report a successful drain while that node kept
    # taking new sessions.
    if find_gateway(gateway_id) is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    set_draining(redis_client, gateway_id, draining=True)
    return {"gateway_id": gateway_id, "draining": True, "gateways": list_gateways_status(db, redis_client)}


@router.post("/gateways/{gateway_id}/undrain")
def undrain_rdp_gateway(
    gateway_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
    redis_client=Depends(get_redis),
):
    """Allow new placements on this gateway again."""
    from services.rdp_gateway_cluster import find_gateway, list_gateways_status, set_draining

    if find_gateway(gateway_id) is None:
        raise HTTPException(status_code=404, detail="Gateway not found")
    set_draining(redis_client, gateway_id, draining=False)
    return {"gateway_id": gateway_id, "draining": False, "gateways": list_gateways_status(db, redis_client)}



@router.get("/gateway/verify-ticket", status_code=status.HTTP_204_NO_CONTENT)
def verify_gateway_ticket(
    request: Request,
    ticket: str = "",
    db: Session = Depends(get_db),
    redis_client=Depends(get_redis),
):
    """
    Single-use check behind Nginx `auth_request` on `guac.` (Phase 5 Action 2).

    Guacamole has no idea who claimed what, so Nginx asks us before it lets a
    token be minted. Deliberately unauthenticated in the HTTP sense: the
    ticket *is* the credential — it was issued to one signed-in worker for one
    open allocation, and redeeming it burns it.

    204 → let the request through. 403 → refuse. Nothing useful is echoed
    back; the browser learns only that the link is spent, while the real
    reason goes to the server log.
    """
    presented = ticket or ticket_from_original_uri(request.headers.get("x-original-uri"))
    outcome = verify_join_ticket(db, redis_client, presented)
    if not outcome.ok:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=outcome.code)
    return None



