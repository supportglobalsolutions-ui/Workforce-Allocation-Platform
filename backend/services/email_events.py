"""
Provider delivery events for the email history.

`email_log.status` records whether Resend accepted a message. What happened
afterwards — delivered, bounced, complained, opened — only the provider knows,
and it arrives two ways:

* the Resend webhook pushes each event as it happens (`apply_event`), and
* `sync_delivery_events` polls messages whose outcome is still unknown, which
  covers local development and any webhook the platform missed.

Both paths funnel into the same append-only timeline on the log row, and neither
can move a row backwards: a late "sent" webhook will not overwrite "delivered".
"""
import base64
import hashlib
import hmac
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlalchemy import or_
from sqlmodel import Session, select

from core.config import settings
from models.email_log import EmailLog

logger = logging.getLogger(__name__)

RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails"

# Higher rank wins, so events applied out of order still settle on the most
# meaningful state. Problems (bounced/complained/failed) outrank engagement
# because they are what an admin needs to act on.
EVENT_RANK: dict[str, int] = {
    "queued": 10,
    "scheduled": 15,
    "sent": 20,
    "delivery_delayed": 30,
    "delivered": 40,
    "opened": 50,
    "clicked": 60,
    "bounced": 90,
    "complained": 95,
    "failed": 99,
}

# Outcomes we already know; polling these again tells us nothing new.
SETTLED_EVENTS = frozenset({"delivered", "opened", "clicked", "bounced", "complained", "failed"})

# How far a webhook timestamp may drift before we treat it as a replay.
_SIGNATURE_TOLERANCE = timedelta(minutes=5)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _rank(event: Optional[str]) -> int:
    return EVENT_RANK.get((event or "").lower(), 0)


def normalize_event(raw: str) -> str:
    """`email.delivered` and `delivered` both mean delivered."""
    value = (raw or "").strip().lower()
    return value.split("email.", 1)[-1] if value.startswith("email.") else value


# ── Webhook signature ──────────────────────────────────────────────────────────

def verify_webhook_signature(headers: dict[str, str], body: bytes) -> Optional[str]:
    """
    Validate a Resend (Svix) webhook. Returns an error string, or None when the
    request is authentic. Unsigned requests are always rejected — an open
    endpoint would let anyone rewrite delivery history.
    """
    secret = settings.RESEND_WEBHOOK_SECRET
    if not secret:
        return "Webhook secret is not configured"

    lowered = {k.lower(): v for k, v in headers.items()}
    msg_id = lowered.get("svix-id")
    timestamp = lowered.get("svix-timestamp")
    signatures = lowered.get("svix-signature")
    if not msg_id or not timestamp or not signatures:
        return "Missing Svix signature headers"

    try:
        sent_at = datetime.fromtimestamp(int(timestamp), tz=timezone.utc)
    except (TypeError, ValueError):
        return "Invalid Svix timestamp"
    if abs(_utc_now() - sent_at) > _SIGNATURE_TOLERANCE:
        return "Webhook timestamp outside tolerance"

    key = secret.split("whsec_", 1)[-1]
    try:
        secret_bytes = base64.b64decode(key)
    except Exception:
        return "Malformed webhook secret"

    signed = f"{msg_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(secret_bytes, signed, hashlib.sha256).digest()).decode()

    # The header carries a space-separated list so secrets can be rotated.
    for candidate in signatures.split(" "):
        _, _, value = candidate.partition(",")
        if value and hmac.compare_digest(value, expected):
            return None
    return "Signature mismatch"


# ── Applying events ────────────────────────────────────────────────────────────

def _event_detail(event_type: str, data: dict[str, Any]) -> Optional[str]:
    """One human-readable line for the timeline, when the payload carries one."""
    if event_type == "bounced":
        bounce = data.get("bounce") or {}
        parts = [bounce.get("type"), bounce.get("subType"), bounce.get("message")]
        detail = " — ".join(str(p) for p in parts if p)
        return detail or None
    if event_type == "clicked":
        click = data.get("click") or {}
        return click.get("link")
    if event_type == "failed":
        failed = data.get("failed") or {}
        return failed.get("reason")
    return None


def apply_event(
    db: Session,
    *,
    resend_id: str,
    event_type: str,
    occurred_at: Optional[datetime] = None,
    data: Optional[dict[str, Any]] = None,
) -> Optional[EmailLog]:
    """Record one provider event against its log row. Unknown ids are ignored."""
    event = normalize_event(event_type)
    if not resend_id or not event:
        return None

    log = db.exec(select(EmailLog).where(EmailLog.resend_id == resend_id)).first()
    if not log:
        logger.info("Resend event %s for unknown message %s", event, resend_id)
        return None

    at = occurred_at or _utc_now()
    entry: dict[str, Any] = {"type": event, "at": at.isoformat()}
    detail = _event_detail(event, data or {})
    if detail:
        entry["detail"] = detail

    timeline = list(log.events or [])
    # Webhooks can be delivered more than once; the timeline stays a set of facts.
    if not any(e.get("type") == event and e.get("at") == entry["at"] for e in timeline):
        timeline.append(entry)
    log.events = timeline

    if _rank(event) >= _rank(log.last_event):
        log.last_event = event
        log.last_event_at = at
    if event in {"bounced", "failed", "complained"} and detail and not log.error:
        log.error = detail

    log.provider_checked_at = _utc_now()
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── Polling fallback ───────────────────────────────────────────────────────────

def _fetch_message(client: httpx.Client, resend_id: str) -> tuple[Optional[str], Optional[str]]:
    """Return (last_event, error) for one Resend message id."""
    try:
        resp = client.get(
            f"{RESEND_EMAIL_ENDPOINT}/{resend_id}",
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
        )
    except Exception as exc:
        return None, str(exc)[:200]
    if resp.status_code >= 400:
        return None, f"Resend {resp.status_code}: {resp.text[:200]}"
    return normalize_event(((resp.json() or {}).get("last_event") or "")), None


def sync_delivery_events(
    db: Session,
    *,
    limit: int = 100,
    log_ids: Optional[list[UUID]] = None,
) -> dict[str, Any]:
    """
    Ask Resend what happened to messages whose outcome we do not know yet.

    Without `log_ids` this walks the newest unsettled rows, which is what the
    history page's Refresh button does. Pass `log_ids` to force a re-check of
    specific rows even if they already look settled.
    """
    if not settings.RESEND_API_KEY:
        return {"checked": 0, "updated": 0, "error": "RESEND_API_KEY is not configured"}

    stmt = select(EmailLog).where(EmailLog.resend_id.is_not(None))
    if log_ids:
        stmt = stmt.where(EmailLog.id.in_(log_ids))
    else:
        stmt = stmt.where(
            or_(
                EmailLog.last_event.is_(None),
                EmailLog.last_event.notin_(tuple(SETTLED_EVENTS)),
            )
        )
    rows = db.exec(stmt.order_by(EmailLog.created_at.desc()).limit(max(1, min(limit, 200)))).all()

    checked = 0
    updated = 0
    last_error: Optional[str] = None
    with httpx.Client(timeout=20.0) as client:
        for row in rows:
            # Resend allows ~10 requests/second on this endpoint.
            if checked:
                time.sleep(0.12)
            event, error = _fetch_message(client, row.resend_id or "")
            checked += 1
            row.provider_checked_at = _utc_now()
            if error:
                last_error = error
                db.add(row)
                continue
            if event and _rank(event) > _rank(row.last_event):
                row.last_event = event
                row.last_event_at = _utc_now()
                timeline = list(row.events or [])
                timeline.append({"type": event, "at": row.last_event_at.isoformat(), "source": "poll"})
                row.events = timeline
                updated += 1
            db.add(row)
        db.commit()

    return {"checked": checked, "updated": updated, "error": last_error}
