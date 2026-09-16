"""
Direct Guacamole media plane (Phase 5) — issue and verify join tickets.

Today's canvas runs `browser → FastAPI ws-tunnel → Guacamole`, so Python
copies every pixel: CPU scales with live desktops and an API deploy kills
every session. This module moves the pixels off FastAPI:

    browser → api.  → FastAPI   (claim, join ticket)      [control]
    browser → guac. → Guacamole → guacd → Windows         [media]

The handoff is one short-lived, single-use ticket plus an encrypted
guacamole-auth-json blob that grants exactly one connection. Neither carries a
Guacamole admin login, and the blob's contents are unreadable without the key
Guacamole and FastAPI share (Principle 6).

Rollout is deliberate: `RDP_DIRECT_GATEWAY_MODE` is off → pilot → on, and
anyone not in the cohort transparently stays on the proxy tunnel.
"""
from __future__ import annotations

import logging
from uuid import UUID

import redis as redis_lib
from sqlmodel import Session, select

from core.config import settings
from core.guacamole import raw_connection_id
from models.allocation import Allocation
from models.enums import RdpStatusEnum, TunnelStatusEnum
from models.rdp_machine import RDPResource
from models.worker import Worker
from services.rdp_state import utc_now
from services import rdp_join_ticket
from services.guacamole_json_auth import (
    JSON_DATA_SOURCE,
    GuacamoleJsonAuthError,
    build_connection_document,
    encode_auth_blob,
    json_auth_available,
)
from services.guacamole_provision import (
    GuacamoleProvisionError,
    connection_parameters_for,
)
from services.rdp_engine import RdpOutcome, generation_matches
from services.rdp_gateway_cluster import (
    admit_connect,
    assign_gateway_to_allocation,
    pick_gateway,
)

logger = logging.getLogger(__name__)

MODE_DIRECT = "direct"
MODE_PROXY = "proxy"


def _proxy(reason: str) -> dict:
    """A caller who stays on the legacy ws-tunnel. Not an error."""
    return {"mode": MODE_PROXY, "reason": reason}


def gateway_mode_for(email: str | None) -> tuple[str, str]:
    """
    Decide whether this caller gets the direct canvas. Returns (mode, reason).

    Configuration is checked before cohort: a pilot email is no use if the
    media plane has no public URL or no shared key yet.
    """
    if not settings.direct_gateway_configured or not json_auth_available():
        return MODE_PROXY, "gateway_not_configured"

    mode = (settings.RDP_DIRECT_GATEWAY_MODE or "off").strip().lower()
    if mode == "on":
        return MODE_DIRECT, "enabled"
    if mode == "pilot":
        if email and email.strip().lower() in settings.direct_gateway_pilot_emails:
            return MODE_DIRECT, "pilot_cohort"
        return MODE_PROXY, "not_in_pilot_cohort"
    return MODE_PROXY, "gateway_disabled"


def _guac_username(allocation: Allocation) -> str:
    """
    Synthetic identity for the auth-json session.

    It is not an account — nobody can log in as it. It labels the tunnel in
    Guacamole's active-connections list, which is how force-stop and the
    coordinator still find and kill this session, and it changes with the
    generation so a new session never collides with an old one's entry.
    """
    return f"wf-{allocation.id}-g{int(allocation.connection_generation)}"


def issue_join_ticket(
    db: Session,
    redis_client: redis_lib.Redis,
    *,
    worker: Worker,
    email: str | None,
    resource: RDPResource,
) -> RdpOutcome:
    """
    Hand the browser everything it needs to open the canvas on `guac.` itself.

    Requires an open allocation held by this worker — the ticket is the claim
    made portable, never a way to get one.
    """
    mode, reason = gateway_mode_for(email)
    if mode == MODE_PROXY:
        return RdpOutcome(
            ok=True, code=reason, friendly="Using the proxied desktop tunnel.",
            data=_proxy(reason),
        )

    allocation = db.exec(
        select(Allocation).where(
            Allocation.rdp_resource_id == resource.id,
            Allocation.worker_id == worker.id,
            Allocation.released_at.is_(None),
        )
    ).first()
    if allocation is not None and resource.status == RdpStatusEnum.idle:
        # Reconnect within grace: cancel the release clock now, not on the next
        # coordinator tick. The worker holds this allocation and is actively
        # asking to rejoin, so the machine is theirs — waiting up to a full tick
        # leaves a window where the coordinator releases a desktop that is in
        # the middle of coming back. The sweep's Direction C is the backstop for
        # reconnects we never see; this is the fast path for ones we do.
        resource.status = RdpStatusEnum.active
        resource.status_changed_at = utc_now()
        resource.version = int(resource.version or 1) + 1
        allocation.tunnel_status = TunnelStatusEnum.connecting
        allocation.last_gateway_observation_at = utc_now()
        allocation.version = int(allocation.version or 1) + 1
        db.add(resource)
        db.add(allocation)
        db.commit()
        db.refresh(allocation)
        logger.info(
            "Join ticket for %s during grace — release clock cancelled",
            resource.nickname,
        )

    if not allocation:
        return RdpOutcome(
            ok=False,
            code="no_open_claim",
            friendly="You do not have an open claim on this machine.",
            http_status=403,
        )

    from models.enums import AllocationLifecycleEnum
    from services.rdp_quarantine import WORKER_CHECKED_MESSAGE

    if (
        resource.status == RdpStatusEnum.maintenance
        or allocation.allocation_status == AllocationLifecycleEnum.quarantined
    ):
        return RdpOutcome(
            ok=False,
            code="quarantined",
            friendly=WORKER_CHECKED_MESSAGE,
            http_status=409,
        )

    connection_id = raw_connection_id(resource.guacamole_connection_id)
    if not connection_id:
        return RdpOutcome(
            ok=False,
            code="not_provisioned",
            friendly=(
                "This machine is not linked to a remote-desktop connection yet. "
                "Ask an admin to provision it."
            ),
            http_status=422,
        )

    try:
        parameters = connection_parameters_for(redis_client, resource)
    except GuacamoleProvisionError as exc:
        return RdpOutcome(
            ok=False,
            code="credentials_missing",
            friendly=str(exc),
            detail=str(exc),
            http_status=422,
        )

    # Sticky media placement (Phase 7). Reconnects stay on the same gateway when
    # it is still healthy; new claims land on the least-loaded non-draining node.
    gateway = assign_gateway_to_allocation(db, allocation, redis_client)
    if gateway is None:
        # No configured gateway still accepting seats.
        if pick_gateway(db, redis_client) is None and settings.RDP_GATEWAYS.strip():
            return RdpOutcome(
                ok=False,
                code="at_capacity",
                friendly="All remote-desktop gateways are busy or draining. Try again shortly.",
                http_status=503,
            )

    # Phase 8 Action 4: shape the herd. A media node restart drops every tunnel
    # it held at once; without this each viewer re-mints immediately and lands
    # on guacd in one spike. Refusing with a retry hint is not a failure — the
    # worker still has their whole grace window to come back in.
    admitted, retry_after_ms = admit_connect(
        redis_client, gateway.id if gateway else "default"
    )
    if not admitted:
        return RdpOutcome(
            ok=False,
            code="gateway_busy",
            friendly="Reconnecting shortly — the desktop gateway is catching up.",
            http_status=503,
            data={"retry_after_ms": retry_after_ms},
        )

    guacamole_public = (
        gateway.public_url if gateway else settings.guacamole_public_url
    )
    if not guacamole_public:
        return RdpOutcome(
            ok=True,
            code="gateway_not_configured",
            friendly="Using the proxied desktop tunnel.",
            data=_proxy("gateway_not_configured"),
        )

    # The connection name is the identifier inside the "json" data source, so
    # it has to be stable and unique per machine. The nickname already is.
    connection_name = resource.nickname.strip()

    try:
        auth_data = encode_auth_blob(
            build_connection_document(
                username=_guac_username(allocation),
                connection_name=connection_name,
                parameters=parameters,
            )
        )
    except GuacamoleJsonAuthError as exc:
        logger.error("Direct gateway misconfigured for rdp %s: %s", resource.id, exc)
        # Never strand a worker on a server-side config mistake — fall back.
        return RdpOutcome(
            ok=True,
            code="gateway_not_configured",
            friendly="Using the proxied desktop tunnel.",
            detail=str(exc),
            data=_proxy("gateway_not_configured"),
        )

    try:
        ticket, claims, ttl = rdp_join_ticket.issue_ticket(
            redis_client,
            worker_id=worker.id,
            allocation_id=allocation.id,
            rdp_id=resource.id,
            connection_id=connection_id,
            connection_name=connection_name,
            connection_generation=int(allocation.connection_generation),
            gateway_id=gateway.id if gateway else "default",
        )
    except rdp_join_ticket.JoinTicketError as exc:
        return RdpOutcome(
            ok=False,
            code="ticket_unavailable",
            friendly="We could not start the remote desktop. Please try again shortly.",
            detail=str(exc),
            http_status=503,
        )

    logger.info(
        "Issued join ticket %s for worker %s on rdp %s (generation %s, gateway %s)",
        claims.ticket_id,
        worker.id,
        resource.id,
        claims.connection_generation,
        gateway.id if gateway else "default",
    )
    return RdpOutcome(
        ok=True,
        code="issued",
        friendly="Join ticket issued.",
        data={
            "mode": MODE_DIRECT,
            "ticket": ticket,
            "auth_data": auth_data,
            "guacamole_url": guacamole_public,
            "gateway_id": gateway.id if gateway else "default",
            "data_source": JSON_DATA_SOURCE,
            "connection_name": connection_name,
            "generation": claims.connection_generation,
            "expires_in": ttl,
            "refresh_in": max(int(settings.RDP_GUAC_SESSION_TTL_SECONDS * 0.8), 60),
            "reason": reason,
        },
    )


def verify_join_ticket(
    db: Session,
    redis_client: redis_lib.Redis,
    ticket: str,
    *,
    presented_gateway: str | None = None,
) -> RdpOutcome:
    """
    Redeem a ticket on behalf of Nginx's `auth_request` in front of
    Guacamole's `/api/tokens`.

    Redis proves the ticket is fresh and unused; the database proves the claim
    behind it still exists. Both must agree, so a ticket minted seconds before
    a force-stop cannot mint a Guacamole token seconds after it.
    """
    claims = rdp_join_ticket.redeem_ticket(redis_client, ticket)
    if claims is None:
        return RdpOutcome(
            ok=False,
            code="ticket_invalid",
            friendly="This desktop link has expired. Reopen the desktop from your board.",
            http_status=403,
        )

    try:
        allocation = db.get(Allocation, UUID(claims.allocation_id))
    except ValueError:
        allocation = None

    if allocation is None or allocation.released_at is not None:
        logger.info(
            "Rejected join ticket %s: allocation %s is no longer open",
            claims.ticket_id, claims.allocation_id,
        )
        return RdpOutcome(
            ok=False,
            code="allocation_closed",
            friendly="This session has ended. Claim the desktop again to reconnect.",
            http_status=403,
        )

    if not generation_matches(
        allocation,
        allocation_id=None,
        connection_generation=claims.connection_generation,
    ):
        logger.info(
            "Rejected join ticket %s: generation %s is stale",
            claims.ticket_id, claims.connection_generation,
        )
        return RdpOutcome(
            ok=False,
            code="stale_generation",
            friendly="This desktop was reconnected elsewhere. Reopen it from your board.",
            http_status=403,
        )

    # A ticket is minted for one media node. Redeemed anywhere else, the session
    # would run on a gateway the control plane is not tracking — `gateway_id` on
    # the allocation would point at the wrong node, so a later force-stop would
    # query that node, find nothing, and release the machine with a live tunnel
    # still up.
    #
    # Absent header = single-gateway deployment (or an Nginx config predating
    # this check), so it is not treated as a mismatch. Present and wrong is.
    if presented_gateway and presented_gateway != claims.gateway_id:
        logger.warning(
            "Rejected join ticket %s: minted for gateway %s, presented at %s",
            claims.ticket_id, claims.gateway_id, presented_gateway,
        )
        return RdpOutcome(
            ok=False,
            code="wrong_gateway",
            friendly="This desktop link is not valid here. Reopen it from your board.",
            http_status=403,
        )

    return RdpOutcome(
        ok=True,
        code="ticket_ok",
        friendly="Join ticket accepted.",
        data={
            "ticket_id": claims.ticket_id,
            "worker_id": claims.worker_id,
            "allocation_id": claims.allocation_id,
            "rdp_id": claims.rdp_id,
            "connection_name": claims.connection_name,
            "generation": claims.connection_generation,
        },
    )
