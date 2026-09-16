"""
Chat between a signed-in account and the admin team.

One thread per account. The worker sees one continuous conversation; admins
see every thread in one place and reply into whichever they pick.

Distinct from `routers/contact.py`, which serves people with **no** account
(typically because they cannot sign in).
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from core.rate_limit import check_rate_limit
from models.chat import MESSAGE_MAX_CHARS, ChatMessage, ChatThread
from .deps import get_admin_user

logger = logging.getLogger(__name__)
router = APIRouter()

PREVIEW_CHARS = 160


class SendMessageRequest(BaseModel):
    # Capped so support stays readable; the UI shows the same limit.
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_CHARS)


class MessageResponse(BaseModel):
    id: UUID
    sender_side: str
    sender_name: str
    body: str
    created_at: Optional[datetime]
    read_at: Optional[datetime]


class ThreadSummary(BaseModel):
    id: UUID
    display_name: str
    email: str
    role: str
    last_message_at: Optional[datetime]
    last_message_preview: Optional[str]
    unread_for_admin: int
    unread_for_user: int
    is_archived: bool
    created_at: Optional[datetime]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _preview(body: str) -> str:
    flat = " ".join(body.split())
    return flat[:PREVIEW_CHARS]


def _notify_alert_email(
    *,
    thread_id: str,
    sender_name: str,
    sender_email: str,
    body: str,
) -> None:
    """Email the platform settings alert address when a worker writes in chat."""
    from sqlmodel import Session as SQLSession

    from core.database import engine
    from services.admin_otp import get_platform_settings
    from services.email_resend import render_broadcast_html, render_broadcast_text, send_email

    try:
        with SQLSession(engine) as db:
            alert_email = get_platform_settings(db).alert_email
            if not alert_email:
                logger.warning(
                    "Chat message on thread %s stored but no alert email configured",
                    thread_id,
                )
                return

            safe_body = html.escape(body).replace("\n", "<br>")
            title = "New worker chat message"
            detail = (
                f"<p><strong>From:</strong> {html.escape(sender_name)} "
                f"(&lt;{html.escape(sender_email or 'unknown')}&gt;)</p>"
                f"<p>Open <strong>Notifications → Worker chat</strong> in the admin portal to reply.</p>"
                f"<hr><p>{safe_body}</p>"
            )
            log = send_email(
                db,
                to_email=alert_email,
                subject=f"GlobalSolutions · {title}",
                html=render_broadcast_html(title, detail),
                text=render_broadcast_text(
                    title,
                    f"From: {sender_name} <{sender_email}>\n\n{body}\n\n"
                    "Reply in Admin → Notifications → Worker chat.",
                ),
                template="chat_message",
            )
            if log.status != "sent":
                logger.error("Chat alert email failed: %s", log.error)
    except Exception:
        logger.exception("Could not email chat alert for thread %s", thread_id)


def _thread_for(db: Session, current_user: dict, *, create: bool = False) -> Optional[ChatThread]:
    """The caller's own thread, created on first send."""
    uid = current_user["uid"]
    thread = db.exec(select(ChatThread).where(ChatThread.auth_user_id == uid)).first()
    if thread or not create:
        return thread

    thread = ChatThread(
        auth_user_id=uid,
        display_name=(current_user.get("name") or current_user.get("email") or "Worker")[:255],
        email=(current_user.get("email") or "")[:254],
        role=current_user.get("role", "user"),
        last_message_at=_utc_now(),
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def _append(
    db: Session,
    thread: ChatThread,
    *,
    side: str,
    sender_uid: str,
    sender_name: str,
    body: str,
) -> ChatMessage:
    message = ChatMessage(
        thread_id=thread.id,
        sender_side=side,
        sender_auth_user_id=sender_uid,
        sender_name=sender_name[:255],
        body=body,
    )
    db.add(message)

    thread.last_message_at = _utc_now()
    thread.last_message_preview = _preview(body)
    if side == "user":
        thread.unread_for_admin = (thread.unread_for_admin or 0) + 1
    else:
        thread.unread_for_user = (thread.unread_for_user or 0) + 1
        # An admin replying means the thread has been dealt with.
        thread.unread_for_admin = 0
    thread.is_archived = False
    db.add(thread)

    db.commit()
    db.refresh(message)
    return message


# ── the signed-in person's own conversation ──────────────────────────────

@router.get("/me", response_model=list[MessageResponse])
def my_messages(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Own conversation, oldest first. Marks admin replies as read."""
    thread = _thread_for(db, current_user)
    if not thread:
        return []

    messages = db.exec(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id)
        .order_by(ChatMessage.created_at)
    ).all()

    if thread.unread_for_user:
        now = _utc_now()
        for m in messages:
            if m.sender_side == "admin" and m.read_at is None:
                m.read_at = now
                db.add(m)
        thread.unread_for_user = 0
        db.add(thread)
        db.commit()

    return messages


@router.get("/me/unread")
def my_unread(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Drives the bell for a worker."""
    thread = _thread_for(db, current_user)
    return {"unread": thread.unread_for_user if thread else 0}


@router.post("/me", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def send_message(
    body: SendMessageRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Send a message to the admin team."""
    check_rate_limit(
        request,
        scope="chat-send",
        limit=30,
        window_seconds=600,
        key_suffix=current_user["uid"],
        detail="You are sending messages very quickly. Please wait a moment.",
    )
    text = body.body.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Type a message before sending.",
        )

    thread = _thread_for(db, current_user, create=True)
    assert thread is not None
    message = _append(
        db,
        thread,
        side="user",
        sender_uid=current_user["uid"],
        sender_name=current_user.get("name") or current_user.get("email") or "Worker",
        body=text,
    )
    # Same destination as the public contact form: platform settings alert email.
    background_tasks.add_task(
        _notify_alert_email,
        thread_id=str(thread.id),
        sender_name=message.sender_name,
        sender_email=thread.email or (current_user.get("email") or ""),
        body=text,
    )
    return message


# ── admin side ───────────────────────────────────────────────────────────

@router.get("/threads", response_model=list[ThreadSummary])
def list_threads(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Every conversation, most recently active first."""
    stmt = select(ChatThread)
    if not include_archived:
        stmt = stmt.where(ChatThread.is_archived == False)  # noqa: E712
    return db.exec(stmt.order_by(ChatThread.last_message_at.desc())).all()


@router.get("/threads/unread-count")
def threads_unread_count(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Number of threads waiting on an admin — drives the bell."""
    rows = db.exec(select(ChatThread).where(ChatThread.unread_for_admin > 0)).all()
    return {"unread": len(rows), "messages": sum(r.unread_for_admin or 0 for r in rows)}


@router.get("/threads/{thread_id}", response_model=list[MessageResponse])
def thread_messages(
    thread_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Open a conversation. Opening marks the worker's messages read."""
    thread = db.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    messages = db.exec(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id)
        .order_by(ChatMessage.created_at)
    ).all()

    if thread.unread_for_admin:
        now = _utc_now()
        for m in messages:
            if m.sender_side == "user" and m.read_at is None:
                m.read_at = now
                db.add(m)
        thread.unread_for_admin = 0
        db.add(thread)
        db.commit()

    return messages


@router.post("/threads/{thread_id}", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def reply_to_thread(
    thread_id: UUID,
    body: SendMessageRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Reply into a conversation."""
    thread = db.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    text = body.body.strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Type a reply before sending.",
        )

    admin = get_admin_user(db, current_user)
    thread.admin_user_id = admin.id
    return _append(
        db,
        thread,
        side="admin",
        sender_uid=current_user["uid"],
        sender_name=admin.display_name or "Support",
        body=text,
    )


@router.patch("/threads/{thread_id}/archive")
def archive_thread(
    thread_id: UUID,
    archived: bool = True,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    thread = db.get(ChatThread, thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    thread.is_archived = archived
    db.add(thread)
    db.commit()
    return {"id": str(thread.id), "is_archived": thread.is_archived}
