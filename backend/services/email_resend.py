"""
Resend email delivery (payslips + broadcasts) with delivery logging.

Uses the Resend HTTP API directly via httpx — no SDK dependency. The sending
domain (gsdeck.com) is configured in the Resend dashboard; the from-address is
env-configured so the domain can change without code changes.
"""
import logging
import re
import time
import uuid as uuid_mod
from dataclasses import dataclass
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlmodel import Session

from core.config import settings
from models.email_log import EmailLog

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"
RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch"

# Resend caps a batch call at 100 messages and does not accept attachments there.
BATCH_MAX = 100

# Domains Resend (and RFC examples) reject as recipients — fail fast with a clear message
# instead of a opaque 422 from the API (affects notifications, broadcasts, payslips).
_BLOCKED_RECIPIENT_DOMAINS = frozenset({
    "example.com",
    "example.org",
    "example.net",
    "test.com",
    "invalid",
    "localhost",
})

# local@domain.tld — rejects incomplete addresses like "user@gmail"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email_address(to_email: str) -> bool:
    return bool(_EMAIL_RE.match((to_email or "").strip()))


def blocked_recipient_reason(to_email: str) -> str | None:
    addr = (to_email or "").strip()
    if not is_valid_email_address(addr):
        return (
            f"Invalid email address `{addr}`. Use a full address like name@gmail.com "
            "(domain must include a dot, e.g. .com)."
        )
    domain = addr.rsplit("@", 1)[-1].lower()
    if domain in _BLOCKED_RECIPIENT_DOMAINS or domain.endswith(".example"):
        return (
            f"Cannot send to @{domain} — Resend rejects reserved/example domains. "
            "Use a real inbox (or Notifications → typed extra email / Payslips → override email)."
        )
    return None


# Reuse TLS connections across a batch send (broadcast / payslips).
# Closed on app shutdown via close_http_client() from the FastAPI lifespan.
_http: httpx.Client | None = None


def _get_http() -> httpx.Client:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.Client(timeout=30.0)
    return _http


def close_http_client() -> None:
    """Release the shared Resend HTTP client (call from app lifespan shutdown)."""
    global _http
    if _http is not None and not _http.is_closed:
        _http.close()
    _http = None


def send_email_detailed(
    db: Session,
    *,
    to_email: str,
    subject: str,
    html: str,
    template: str,
    text: Optional[str] = None,
    attachments: Optional[list[dict[str, Any]]] = None,
    payroll_period_id: Optional[UUID] = None,
    worker_id: Optional[UUID] = None,
    idempotency_key: Optional[str] = None,
) -> tuple[EmailLog, Optional[str]]:
    """
    Send one email through Resend, record the outcome in email_log, and return
    the log plus the Resend message id (needed to trace a queued job item).
    `attachments` items: {"filename": str, "content": base64-encoded str}.
    """
    status, error, resend_id = "sent", None, None

    blocked = blocked_recipient_reason(to_email)
    if blocked:
        status, error = "failed", blocked
    elif not settings.RESEND_API_KEY:
        status, error = "failed", "RESEND_API_KEY is not configured"
    else:
        payload: dict[str, Any] = {
            "from": settings.RESEND_FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html,
        }
        if text:
            payload["text"] = text
        if attachments:
            payload["attachments"] = attachments
        headers = {"Authorization": f"Bearer {settings.RESEND_API_KEY}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            resp = _get_http().post(RESEND_ENDPOINT, json=payload, headers=headers)
            if resp.status_code >= 400:
                status, error = "failed", f"Resend {resp.status_code}: {resp.text[:500]}"
            else:
                resend_id = (resp.json() or {}).get("id")
        except Exception as exc:  # network failures must not crash the batch
            status, error = "failed", str(exc)[:500]

    if error:
        logger.warning("Email to %s failed: %s", to_email, error)

    log = EmailLog(
        to_email=to_email,
        subject=subject,
        template=template,
        status=status,
        error=error,
        payroll_period_id=payroll_period_id,
        worker_id=worker_id,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log, resend_id


def send_email(db: Session, **kwargs: Any) -> EmailLog:
    """Single send where only the delivery log matters."""
    log, _ = send_email_detailed(db, **kwargs)
    return log


@dataclass
class BatchMessage:
    """One message in a batch send. `ref` is echoed back so callers can map results."""
    ref: str
    to_email: str
    subject: str
    html: str
    text: Optional[str] = None


@dataclass
class BatchResult:
    ref: str
    to_email: str
    status: str            # sent | failed
    resend_id: Optional[str] = None
    error: Optional[str] = None


def _batch_post(payload: list[dict[str, Any]], idempotency_key: str) -> httpx.Response:
    """POST one chunk, retrying on 429/5xx with the server's Retry-After when given."""
    headers = {
        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
        # Lets us retry a chunk without double-sending if the first attempt's
        # response was lost in transit.
        "Idempotency-Key": idempotency_key,
    }
    last: httpx.Response | None = None
    for attempt in range(4):
        resp = _get_http().post(RESEND_BATCH_ENDPOINT, json=payload, headers=headers)
        if resp.status_code < 400 or resp.status_code not in (429, 500, 502, 503, 504):
            return resp
        last = resp
        retry_after = resp.headers.get("Retry-After")
        try:
            delay = float(retry_after) if retry_after else 0.0
        except ValueError:
            delay = 0.0
        if delay <= 0:
            delay = min(2 ** attempt, 8)
        logger.warning(
            "Resend batch %s — retrying in %.1fs (attempt %d)", resp.status_code, delay, attempt + 1
        )
        time.sleep(delay)
    return last if last is not None else resp


def send_email_batch(
    db: Session,
    *,
    messages: list[BatchMessage],
    template: str,
    payroll_period_id: Optional[UUID] = None,
    worker_ids: Optional[dict[str, UUID]] = None,
) -> list[BatchResult]:
    """
    Send up to BATCH_MAX messages in a single Resend call and log each outcome.

    Resend returns `data` as a list positionally aligned with the request, so
    results are matched back to messages by index. Attachments are not supported
    on this endpoint — callers needing a PDF must use send_email() per recipient.
    """
    if not messages:
        return []
    if len(messages) > BATCH_MAX:
        raise ValueError(f"batch size {len(messages)} exceeds Resend's limit of {BATCH_MAX}")

    worker_ids = worker_ids or {}
    results: list[BatchResult] = []

    # Addresses Resend would reject never enter the API call; they fail locally so
    # one bad row cannot 422 the whole chunk.
    sendable: list[BatchMessage] = []
    for msg in messages:
        blocked = blocked_recipient_reason(msg.to_email)
        if blocked:
            results.append(BatchResult(ref=msg.ref, to_email=msg.to_email, status="failed", error=blocked))
        else:
            sendable.append(msg)

    if sendable:
        if not settings.RESEND_API_KEY:
            for msg in sendable:
                results.append(BatchResult(
                    ref=msg.ref, to_email=msg.to_email, status="failed",
                    error="RESEND_API_KEY is not configured",
                ))
        else:
            payload = []
            for msg in sendable:
                item: dict[str, Any] = {
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": [msg.to_email],
                    "subject": msg.subject,
                    "html": msg.html,
                }
                if msg.text:
                    item["text"] = msg.text
                payload.append(item)

            try:
                resp = _batch_post(payload, idempotency_key=f"batch-{uuid_mod.uuid4()}")
                if resp.status_code >= 400:
                    err = f"Resend {resp.status_code}: {resp.text[:500]}"
                    for msg in sendable:
                        results.append(BatchResult(
                            ref=msg.ref, to_email=msg.to_email, status="failed", error=err,
                        ))
                else:
                    data = (resp.json() or {}).get("data") or []
                    for i, msg in enumerate(sendable):
                        entry = data[i] if i < len(data) else None
                        rid = (entry or {}).get("id")
                        if rid:
                            results.append(BatchResult(
                                ref=msg.ref, to_email=msg.to_email, status="sent", resend_id=rid,
                            ))
                        else:
                            results.append(BatchResult(
                                ref=msg.ref, to_email=msg.to_email, status="failed",
                                error="Resend returned no id for this recipient",
                            ))
            except Exception as exc:
                err = str(exc)[:500]
                logger.warning("Resend batch call failed: %s", err)
                for msg in sendable:
                    results.append(BatchResult(
                        ref=msg.ref, to_email=msg.to_email, status="failed", error=err,
                    ))

    for res in results:
        db.add(EmailLog(
            to_email=res.to_email,
            subject=next((m.subject for m in messages if m.ref == res.ref), template),
            template=template,
            status=res.status,
            error=res.error,
            payroll_period_id=payroll_period_id,
            worker_id=worker_ids.get(res.ref),
        ))
    db.commit()

    by_ref = {r.ref: r for r in results}
    return [by_ref[m.ref] for m in messages if m.ref in by_ref]


# ── HTML templates ─────────────────────────────────────────────────────────────

_BASE_STYLE = """
  font-family: 'Segoe UI', Arial, sans-serif; color: #1a2233; max-width: 640px;
  margin: 0 auto; border: 1px solid #e3e8f0; border-radius: 12px; overflow: hidden;
"""


def render_broadcast_html(title: str, message: str) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 12px; font-size:14px; line-height:1.6;">{line}</p>'
        for line in message.split("\n") if line.strip()
    )
    return f"""
    <div style="{_BASE_STYLE}">
      <div style="background:#0e2a47; padding:20px 28px;">
        <p style="color:#ffffff; font-size:18px; font-weight:700; margin:0;">GlobalSolutions</p>
      </div>
      <div style="padding:28px;">
        <h2 style="font-size:17px; margin:0 0 16px;">{title}</h2>
        {paragraphs}
      </div>
      <div style="background:#f4f7fb; padding:14px 28px; font-size:11px; color:#7a8699;">
        GlobalSolutions Workforce Platform — this message was sent by your administrator.
      </div>
    </div>
    """


def wallet_url() -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/worker/wallet"


def render_payslip_html(
    *,
    worker_name: str,
    period_label: str,
    local_currency: str,
    base_currency: str,
    rows: list[tuple[str, str, str, str]],
) -> str:
    """rows: (item, local amount, base equivalent, meaning)."""
    body_rows = ""
    net_local = ""
    for i, (item, local, base, meaning) in enumerate(rows):
        is_final = item.startswith("Final")
        if is_final:
            net_local = local
        bg = "#e8f5e9" if is_final else ("#ffffff" if i % 2 == 0 else "#f7f9fc")
        weight = "700" if is_final else "400"
        body_rows += f"""
        <tr style="background:{bg};">
          <td style="padding:9px 12px; border:1px solid #dce3ec; font-weight:700;">{item}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; text-align:right; font-weight:{weight};">{local}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; text-align:right; font-weight:{weight};">{base}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; font-size:12px; color:#4a5568;">{meaning}</td>
        </tr>"""

    hero = ""
    if net_local:
        hero = f"""
        <div style="background:#e8f5e9; border:1px solid #c8e6c9; border-radius:10px; padding:18px 20px; margin-bottom:20px; text-align:center;">
          <p style="margin:0; font-size:12px; color:#4a5568; text-transform:uppercase; letter-spacing:.06em;">Net pay due</p>
          <p style="margin:6px 0 0; font-size:28px; font-weight:700; color:#1b5e20;">{local_currency} {net_local}</p>
          <p style="margin:6px 0 0; font-size:12px; color:#4a5568;">{period_label}</p>
        </div>"""

    return f"""
    <div style="{_BASE_STYLE}">
      <div style="background:#0e2a47; padding:20px 28px;">
        <p style="color:#ffffff; font-size:18px; font-weight:700; margin:0;">GlobalSolutions — Payslip</p>
      </div>
      <div style="padding:28px;">
        <p style="margin:0 0 18px; font-size:14px;">Hi {worker_name}, your payslip for <strong>{period_label}</strong> is ready.</p>
        {hero}
        <table style="width:100%; margin-bottom:18px; font-size:14px;">
          <tr><td style="padding:4px 0; color:#7a8699;">Selected Month</td><td style="font-weight:700;">{period_label}</td></tr>
          <tr><td style="padding:4px 0; color:#7a8699;">Employee</td><td style="font-weight:700;">{worker_name}</td></tr>
        </table>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr style="background:#153e6b; color:#ffffff;">
            <th colspan="4" style="padding:10px 12px; border:1px solid #153e6b; text-align:center;">Earnings and deductions</th>
          </tr>
          <tr style="background:#e9f0f8;">
            <th style="padding:8px 12px; border:1px solid #dce3ec; text-align:left;">Item</th>
            <th style="padding:8px 12px; border:1px solid #dce3ec; text-align:right;">{local_currency}</th>
            <th style="padding:8px 12px; border:1px solid #dce3ec; text-align:right;">{base_currency} Equivalent</th>
            <th style="padding:8px 12px; border:1px solid #dce3ec; text-align:left;">Meaning</th>
          </tr>
          {body_rows}
        </table>
        <p style="text-align:center; margin:26px 0 0;">
          <a href="{wallet_url()}"
             style="display:inline-block; background:#0e2a47; color:#ffffff; text-decoration:none;
                    padding:12px 26px; border-radius:8px; font-size:14px; font-weight:700;">
            View in your wallet
          </a>
        </p>
        <p style="text-align:center; margin:10px 0 0; font-size:11px; color:#7a8699;">
          Download the PDF copy any time from your wallet.
        </p>
      </div>
      <div style="background:#f4f7fb; padding:14px 28px; font-size:11px; color:#7a8699;">
        Questions about this payslip? Contact your GlobalSolutions administrator.
      </div>
    </div>
    """


def render_payslip_text(
    *,
    worker_name: str,
    period_label: str,
    local_currency: str,
    rows: list[tuple[str, str, str, str]],
) -> str:
    """
    Plain-text alternative. Supplying one materially improves deliverability for
    bulk sends and keeps the payslip readable in text-only clients.
    """
    lines = [
        f"Hi {worker_name},",
        "",
        f"Your GlobalSolutions payslip for {period_label} is ready.",
        "",
        f"Amounts in {local_currency}:",
    ]
    for item, local, _base, _meaning in rows:
        lines.append(f"  {item}: {local}")
    lines += [
        "",
        f"View it in your wallet: {wallet_url()}",
        "",
        "Questions about this payslip? Contact your GlobalSolutions administrator.",
    ]
    return "\n".join(lines)


def render_broadcast_text(title: str, message: str) -> str:
    return f"{title}\n\n{message}\n\n— GlobalSolutions Workforce Platform"
