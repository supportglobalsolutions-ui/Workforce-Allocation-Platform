"""Guacamole HTTP + WebSocket tunnel endpoints (Phase 4 Action 3).

Pixel relay stays here so ``routers/rdp.py`` can stay a thin claim/lifecycle
wiring layer. Helpers live in ``services.rdp_support``.
"""
from __future__ import annotations

import asyncio
import logging
import urllib.parse
from urllib.parse import unquote
from uuid import UUID

import httpx
import websockets as ws_lib
from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session
from starlette.background import BackgroundTask

from core.config import settings
from core.database import get_db
from core.guacamole import GuacamoleClient, raw_connection_id
from core.permissions import STAFF_ROLES, require_admin, require_user
from core.redis import get_redis
from core.supabase_auth import verify_supabase_token
from models.rdp_machine import RDPResource
from services.rdp_engine import refresh_tunnel_lock, tunnel_epoch_matches, tunnel_lock_held
from services.rdp_state import require_worker_visible_or_staff
from sqlmodel import select
from .deps import get_worker_for_user
from services.rdp_support import (
    mark_ws_tunnel_connected,
    mark_ws_tunnel_disconnected,
    prepare_ws_tunnel,
    preflight_rdp,
    release_ws_tunnel_lock,
    require_claimed_machine_or_staff,
    viewer_worker_id,
)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.api_route("/tunnel", methods=["GET", "POST"])
async def proxy_guacamole_tunnel(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """
    Legacy Guacamole HTTP tunnel proxy.

    Workers must use `GET /rdp/{id}/ws-tunnel` (scoped to their claim). This
    path historically accepted any open allocation and forwarded Guacamole
    frames for any connection id in the query — a worker with one claim could
    open another machine. It now requires `rdp_id` and an open allocation on
    that exact machine (staff may omit ownership).
    """
    rdp_raw = request.query_params.get("rdp_id") or request.headers.get("x-rdp-resource-id")
    if not rdp_raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="rdp_id is required — use the authenticated WebSocket tunnel",
        )
    try:
        rdp_id = UUID(str(rdp_raw))
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="rdp_id is invalid",
        )

    resource = db.get(RDPResource, rdp_id)
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This desktop is no longer available. Return to your desktops.",
        )
    require_claimed_machine_or_staff(db, current_user, rdp_id)

    # Guacamole's tunnel query ("connect", "read:<uuid>", …) must not include
    # our rdp_id — strip it before forwarding.
    pairs = [
        (k, v)
        for k, v in request.query_params.multi_items()
        if k.lower() != "rdp_id"
    ]
    query = urllib.parse.urlencode(pairs, doseq=True)
    if query:
        query = unquote(query)
        if query.endswith("=") and "&" not in query and "=" not in query[:-1]:
            query = query[:-1]
    guac_base = settings.GUACAMOLE_URL.rstrip("/")
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



@router.websocket("/{rdp_id}/ws-tunnel")
async def rdp_ws_tunnel(websocket: WebSocket, rdp_id: UUID):
    """
    WebSocket proxy for guacamole-common-js WebSocketTunnel.
    The Guacamole auth token never leaves the server — the browser only sends its
    Supabase access token (as ?accessToken=...) plus display hint params.

    Flow:
      1. Verify the access token from the query param (or DEV bypass).
      2. Confirm the worker has an open allocation for this RDP.
      3. Fetch Guacamole auth token server-side.
      4. Open a WebSocket to Guacamole and relay frames bidirectionally.
    """
    params = websocket.query_params
    access_token = params.get("accessToken")

    # --- 1. Authenticate ---
    if access_token:
        try:
            decoded = verify_supabase_token(access_token)
            uid: str = decoded["uid"]
            role: str = decoded.get("role", "user")
        except Exception:
            await websocket.close(code=4001, reason="Invalid auth token")
            return
    else:
        await websocket.close(code=4001, reason="Missing auth token")
        return

    # --- 2. Extract display hints (forwarded from guacamole-common-js connect data) ---
    width = params.get("GUAC_WIDTH", "1024")
    height = params.get("GUAC_HEIGHT", "768")
    dpi = params.get("GUAC_DPI", "96")
    images: list[str] = params.getlist("GUAC_IMAGE") or ["image/png", "image/jpeg"]

    # Accept before prepare so a 409 "already open" close code/reason reaches
    # the browser. Closing before accept drops the friendly Switch-here text.
    await websocket.accept(subprotocol="guacamole")

    takeover = params.get("takeover") in {"1", "true", "yes"}
    prep: dict | None = None
    try:
        prep = await asyncio.to_thread(
            prepare_ws_tunnel, rdp_id=rdp_id, uid=uid, role=role, takeover=takeover
        )
    except HTTPException as exc:
        # 4409 = already open in another tab (client may offer Switch here).
        try:
            await websocket.close(
                code=4409 if exc.status_code == 409 else 4003,
                reason=str(exc.detail)[:120],
            )
        except Exception:
            pass
        return

    connection_id = str(prep["connection_id"])
    allocation_id = prep.get("allocation_id")
    connection_generation = prep.get("connection_generation")
    tunnel_epoch = prep.get("tunnel_epoch")
    if isinstance(tunnel_epoch, bytes):
        tunnel_epoch = tunnel_epoch.decode()
    tunnel_epoch = str(tunnel_epoch) if tunnel_epoch else None
    if connection_generation is not None:
        try:
            connection_generation = int(connection_generation)
        except (TypeError, ValueError):
            connection_generation = None

    async def _cleanup_lock() -> None:
        await asyncio.to_thread(
            release_ws_tunnel_lock,
            rdp_id,
            allocation_id=allocation_id,
            connection_generation=connection_generation,
        )

    # --- 4. Fetch Guacamole token server-side ---
    redis_client = get_redis()
    guac = GuacamoleClient(redis_client)
    try:
        info = await asyncio.to_thread(guac.get_tunnel_connect_info, connection_id)
        guac_token = info["token"]
        data_source = info["data_source"]
    except Exception as exc:
        logger.warning("Failed to get Guacamole token for rdp %s: %s", rdp_id, exc)
        await _cleanup_lock()
        try:
            await websocket.close(code=1011, reason="Cannot reach Guacamole server")
        except Exception:
            pass
        return

    # --- 5. Build Guacamole WebSocket URL ---
    guac_base = settings.GUACAMOLE_URL.rstrip("/")
    guac_ws_base = guac_base.replace("http://", "ws://").replace("https://", "wss://")
    guac_qs = urllib.parse.urlencode(
        [
            ("token", guac_token),
            ("GUAC_DATA_SOURCE", data_source),
            # /websocket-tunnel takes the RAW connection identifier. The
            # base64 "<id>\0c\0<datasource>" form belongs to the browser URL
            # (#/client/...) and the HTTP tunnel; sending it here is rejected
            # with 516 RESOURCE_NOT_FOUND, which surfaces as a black screen.
            # Verified against this Guacamole: raw -> frames, encoded -> 516.
            ("GUAC_ID", connection_id),
            ("GUAC_TYPE", "c"),
            ("GUAC_WIDTH", width),
            ("GUAC_HEIGHT", height),
            ("GUAC_DPI", dpi),
        ]
        + [("GUAC_IMAGE", img) for img in images]
    )
    guac_ws_url = f"{guac_ws_base}/websocket-tunnel?{guac_qs}"

    # --- 6. Open upstream connection to Guacamole and relay ---
    # Both directions must keep flowing: guacd drops the session with
    # "User is not responding" if the client's sync acknowledgements stop
    # reaching it, which shows up in the browser as a black screen.
    async def relay_client_to_guac(guac_ws: ws_lib.ClientConnection) -> None:
        try:
            while True:
                message = await websocket.receive()
                msg_type = message.get("type")
                if msg_type == "websocket.disconnect":
                    return
                # guacamole-common-js sends text, but binary frames appear for
                # clipboard and file transfers. iter_text() silently yielded
                # None for those and killed the tunnel.
                data = message.get("text")
                if data is None:
                    data = message.get("bytes")
                if data is None:
                    continue
                await guac_ws.send(data)
        except WebSocketDisconnect:
            return
        except Exception as exc:
            logger.warning(
                "WS tunnel client->guac relay stopped for rdp %s: %s: %s",
                rdp_id, type(exc).__name__, exc,
            )

    async def relay_guac_to_client(guac_ws: ws_lib.ClientConnection) -> None:
        try:
            async for msg in guac_ws:
                if isinstance(msg, str):
                    await websocket.send_text(msg)
                else:
                    await websocket.send_bytes(msg)
        except Exception as exc:
            logger.warning(
                "WS tunnel guac->client relay stopped for rdp %s: %s: %s",
                rdp_id, type(exc).__name__, exc,
            )

    async def watch_tunnel_ownership() -> None:
        """Drop this relay when Switch here / End moves ownership away."""
        if not allocation_id or connection_generation is None or not tunnel_epoch:
            return
        try:
            alloc_uuid = UUID(str(allocation_id))
        except ValueError:
            return
        ticks = 0
        while True:
            await asyncio.sleep(2)
            ticks += 1
            try:
                still_mine = tunnel_epoch_matches(
                    redis_client, rdp_id=rdp_id, epoch=tunnel_epoch
                )
                if not still_mine:
                    logger.info(
                        "WS tunnel for rdp %s superseded (epoch moved) — closing",
                        rdp_id,
                    )
                    try:
                        await websocket.close(
                            code=4004,
                            reason="Session moved to another tab or ended",
                        )
                    except Exception:
                        pass
                    return
                # Refresh lock/epoch TTL every ~40s while we still own it.
                if ticks % 20 == 0:
                    ok = refresh_tunnel_lock(
                        redis_client,
                        rdp_id=rdp_id,
                        allocation_id=alloc_uuid,
                        connection_generation=connection_generation,
                        epoch=tunnel_epoch,
                    )
                    if not ok:
                        try:
                            await websocket.close(
                                code=4004,
                                reason="Session moved to another tab or ended",
                            )
                        except Exception:
                            pass
                        return
            except Exception as exc:
                logger.warning("Tunnel ownership watch failed for %s: %s", rdp_id, exc)
                return

    upstream_connected = False
    watch_task: asyncio.Task | None = None
    try:
        async with ws_lib.connect(guac_ws_url, subprotocols=["guacamole"]) as guac_ws:
            upstream_connected = True
            await asyncio.to_thread(
                mark_ws_tunnel_connected,
                rdp_id,
                connection_generation=connection_generation,
            )
            watch_task = asyncio.create_task(watch_tunnel_ownership())
            c2g = asyncio.create_task(relay_client_to_guac(guac_ws))
            g2c = asyncio.create_task(relay_guac_to_client(guac_ws))
            _done, pending = await asyncio.wait(
                [c2g, g2c, watch_task], return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
    except Exception as exc:
        logger.warning("WS tunnel error for rdp %s: %s", rdp_id, exc)
        if upstream_connected:
            await asyncio.to_thread(
                mark_ws_tunnel_disconnected,
                rdp_id,
                connection_generation=connection_generation,
            )
        await _cleanup_lock()
        try:
            await websocket.close(code=1011, reason="Cannot open remote desktop")
        except Exception:
            pass
        return
    finally:
        if watch_task is not None:
            watch_task.cancel()

    if upstream_connected:
        await asyncio.to_thread(
            mark_ws_tunnel_disconnected,
            rdp_id,
            connection_generation=connection_generation,
        )
    await _cleanup_lock()
    try:
        await websocket.close(code=1000)
    except Exception:
        pass

@router.get("/{rdp_id}/desktop-guard")
def desktop_guard(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
    redis_client=Depends(get_redis),
):
    """
    Cheap already-open check for the viewer before it opens a WebSocket.

    The WebSocket path still enforces the lock; this only lets the UI show
    Switch here immediately instead of hanging on Connecting….
    """
    worker = get_worker_for_user(db, current_user)
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
    held = tunnel_lock_held(redis_client, rdp_id=rdp_id)
    return {
        "already_open": held,
        "switch_allowed": held,
        "message": (
            "This desktop is already open in another tab. "
            "Switch here to move the session, or return to that tab."
            if held
            else None
        ),
    }


@router.get("/{rdp_id}/preflight")
def preflight_rdp_resource(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """TCP + Guacamole-id check so the claim board can fail before opening a desktop."""
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
        viewer_worker_id=viewer_worker_id(db, current_user),
    )
    return preflight_rdp(resource)


@router.get("/{rdp_id}/tunnel-info")
def get_rdp_tunnel_info(
    rdp_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Staff-only metadata for diagnostics.

    Never returns a Guacamole auth token. Workers connect via
    ``/rdp/{id}/ws-tunnel``, which mints the token server-side.
    """
    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP resource not found")
    if not resource.guacamole_connection_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Machine has no guacamole_connection_id configured",
        )

    connection_id = raw_connection_id(resource.guacamole_connection_id)
    return {
        "tunnel_url": f"/rdp/{rdp_id}/ws-tunnel",
        "data_source": "postgresql",
        "connection_id": connection_id,
        "token": None,
        "note": "Guacamole tokens are never returned to the browser. Use ws-tunnel.",
    }
