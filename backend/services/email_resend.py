"""
Resend email delivery (payslips + broadcasts) with delivery logging.

Uses the Resend HTTP API directly via httpx — no SDK dependency. The sending
domain (gsdeck.com) is configured in the Resend dashboard; the from-address is
env-configured so the domain can change without code changes.
"""
import logging
import re
from typing import Any, Optional
from uuid import UUID

import httpx
from sqlmodel import Session

from core.config import settings
from models.email_log import EmailLog

logger = logging.getLogger(__name__)

RESEND_ENDPOINT = "https://api.resend.com/emails"

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


def send_email(
    db: Session,
    *,
    to_email: str,
    subject: str,
    html: str,
    template: str,
    attachments: Optional[list[dict[str, Any]]] = None,
    payroll_period_id: Optional[UUID] = None,
    worker_id: Optional[UUID] = None,
) -> EmailLog:
    """
    Send one email through Resend and record the outcome in email_log.
    `attachments` items: {"filename": str, "content": base64-encoded str}.
    """
    status, error = "sent", None

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
        if attachments:
            payload["attachments"] = attachments
        try:
            resp = _get_http().post(
                RESEND_ENDPOINT,
                json=payload,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            )
            if resp.status_code >= 400:
                status, error = "failed", f"Resend {resp.status_code}: {resp.text[:500]}"
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
    return log


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
    for i, (item, local, base, meaning) in enumerate(rows):
        is_final = item.startswith("Final")
        bg = "#e8f5e9" if is_final else ("#ffffff" if i % 2 == 0 else "#f7f9fc")
        weight = "700" if is_final else "400"
        body_rows += f"""
        <tr style="background:{bg};">
          <td style="padding:9px 12px; border:1px solid #dce3ec; font-weight:700;">{item}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; text-align:right; font-weight:{weight};">{local}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; text-align:right; font-weight:{weight};">{base}</td>
          <td style="padding:9px 12px; border:1px solid #dce3ec; font-size:12px; color:#4a5568;">{meaning}</td>
        </tr>"""

    return f"""
    <div style="{_BASE_STYLE}">
      <div style="background:#0e2a47; padding:20px 28px;">
        <p style="color:#ffffff; font-size:18px; font-weight:700; margin:0;">GlobalSolutions — Payslip</p>
      </div>
      <div style="padding:28px;">
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
      </div>
      <div style="background:#f4f7fb; padding:14px 28px; font-size:11px; color:#7a8699;">
        Questions about this payslip? Contact your GlobalSolutions administrator.
      </div>
    </div>
    """
