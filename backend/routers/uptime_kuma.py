"""Uptime Kuma webhook — sync RDP TCP heartbeat into PostgreSQL."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlmodel import Session

from core.config import settings
from core.database import get_db
from core.permissions import require_admin
from services.rdp_health import apply_uptime_kuma_event

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_webhook_secret(
    authorization: str | None = Header(None),
    token: str | None = Query(None, alias="token"),
) -> None:
    secret = settings.UPTIME_KUMA_WEBHOOK_SECRET
    if not secret:
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Uptime Kuma webhook secret is not configured",
            )
        logger.warning("UPTIME_KUMA_WEBHOOK_SECRET unset — accepting webhook without auth (dev only)")
        return

    bearer = authorization.removeprefix("Bearer ").strip() if authorization else None
    if bearer == secret or token == secret:
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook secret")


@router.post("/webhook")
async def uptime_kuma_webhook(
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(_verify_webhook_secret),
):
    """
    Receive Uptime Kuma monitor up/down events.

    Configure in Uptime Kuma → Settings → Notifications → Webhook:
    - URL: http://host.docker.internal:8000/integrations/uptime-kuma/webhook?token=YOUR_SECRET
    - Method: POST
    - Body: default JSON (includes monitor name and heartbeat status)
    """
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload: dict[str, Any] = await request.json()
    else:
        form = await request.form()
        payload = dict(form)

    result = apply_uptime_kuma_event(db, payload)
    if not result.get("ok"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result)
    return result


@router.get("/status")
def uptime_kuma_integration_status(_: dict = Depends(require_admin)):
    """Admin: verify Uptime Kuma integration configuration."""
    return {
        "webhook_path": "/integrations/uptime-kuma/webhook",
        "webhook_secret_configured": bool(settings.UPTIME_KUMA_WEBHOOK_SECRET),
        "uptime_kuma_ui": settings.UPTIME_KUMA_URL,
        "monitor_naming": "Use rdp_resources.nickname as the Uptime Kuma monitor name",
        "monitor_type": "TCP Port 3389 (RDP)",
        "check_interval_seconds": 60,
    }
