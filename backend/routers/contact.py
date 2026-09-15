"""
Public contact form and the admin inbox that receives it.

Anyone can POST /contact without an account — that is the point, since the
people who most need it are locked out. The endpoint is rate limited by both
IP and email address, and the stored message is what the admin inbox reads.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from core.rate_limit import check_rate_limit
from models.contact_message import ContactMessage
from .deps import get_admin_user

logger = logging.getLogger(__name__)
router = APIRouter()


class ContactSubmitRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr = Field(max_length=254)
    subject: str = Field(min_length=3, max_length=160)
    message: str = Field(min_length=10, max_length=4000)


class ContactMessageResponse(BaseModel):
    id: UUID
    name: str
    email: str
    subject: str
    message: str
    status: str
    created_at: Optional[datetime]
    handled_at: Optional[datetime]


def _client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return request.client.host if request.client else None


def _notify_admins(message_id: str, name: str, email: str, subject: str, body: str) -> None:
    """
    Email the enquiry to the platform alert address.

    Runs as a background task: a slow mail hop must not make the sender think
    their message failed. Failures are logged and the message is already
    stored, so nothing is lost.
    """
    from sqlmodel import Session as SQLSession

    from core.database import engine
    from services.admin_otp import get_platform_settings
    from services.email_resend import render_broadcast_html, render_broadcast_text, send_email

    try:
        with SQLSession(engine) as db:
            alert_email = get_platform_settings(db).alert_email
            if not alert_email:
                logger.warning("Contact message %s stored but no alert email configured", message_id)
                return

            safe_body = html.escape(body).replace("\n", "<br>")
            title = f"New enquiry: {subject}"
            detail = (
                f"<p><strong>From:</strong> {html.escape(name)} "
                f"(&lt;{html.escape(email)}&gt;)</p>"
                f"<p><strong>Subject:</strong> {html.escape(subject)}</p>"
                f"<hr><p>{safe_body}</p>"
                f"<p style='color:#888;font-size:12px'>Reply directly to {html.escape(email)}.</p>"
            )
            log = send_email(
                db,
                to_email=alert_email,
                subject=f"GlobalSolutions · {title}",
                html=render_broadcast_html(title, detail),
                text=render_broadcast_text(title, f"From: {name} <{email}>\n\n{body}"),
                template="contact_enquiry",
            )
            if log.status != "sent":
                logger.error("Contact enquiry email failed: %s", log.error)
    except Exception:
        logger.exception("Could not deliver contact enquiry %s", message_id)


@router.post("", status_code=status.HTTP_201_CREATED)
def submit_contact_message(
    body: ContactSubmitRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Public — no authentication. Rate limited per IP and per email address."""
    email = str(body.email).strip().lower()
    check_rate_limit(request, scope="contact-ip", limit=10, window_seconds=3600)
    check_rate_limit(
        request,
        scope="contact-email",
        limit=5,
        window_seconds=3600,
        key_suffix=email,
        detail="You have sent several messages recently. Please wait before sending another.",
    )

    entry = ContactMessage(
        name=body.name.strip(),
        email=email,
        subject=body.subject.strip(),
        message=body.message.strip(),
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:255] or None,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)

    background_tasks.add_task(
        _notify_admins, str(entry.id), entry.name, entry.email, entry.subject, entry.message
    )
    return {
        "id": str(entry.id),
        "received": True,
        "message": "Thanks — your message has been sent. We will reply by email.",
    }


@router.get("", response_model=list[ContactMessageResponse])
def list_contact_messages(
    status_filter: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin inbox, newest first."""
    stmt = select(ContactMessage)
    if status_filter in {"new", "read", "archived"}:
        stmt = stmt.where(ContactMessage.status == status_filter)
    stmt = stmt.order_by(ContactMessage.created_at.desc()).limit(max(1, min(limit, 500)))
    return db.exec(stmt).all()


@router.get("/unread-count")
def unread_contact_count(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Drives the red dot on the notification bell."""
    rows = db.exec(select(ContactMessage).where(ContactMessage.status == "new")).all()
    return {"unread": len(rows)}


@router.patch("/{message_id}")
def update_contact_message(
    message_id: UUID,
    new_status: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Mark an enquiry read or archived."""
    if new_status not in {"new", "read", "archived"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be new, read, or archived.",
        )
    entry = db.get(ContactMessage, message_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    entry.status = new_status
    if new_status == "new":
        entry.handled_by_auth_user_id = None
        entry.handled_at = None
    else:
        entry.handled_by_auth_user_id = current_user.get("uid")
        entry.handled_at = datetime.now(timezone.utc)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": str(entry.id), "status": entry.status}
