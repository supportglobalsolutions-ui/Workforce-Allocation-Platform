from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, or_, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.admin_users import AdminUser
from models.notification import Notification
from models.worker import Worker
from schemas.notification import (
    NotificationRecipient,
    NotificationResponse,
    NotificationSend,
    NotificationSendResult,
)
from services.email_resend import is_valid_email_address, render_broadcast_html, send_email
from .deps import get_admin_user, get_worker_for_user

router = APIRouter()


def _build_response(n: Notification, sender: AdminUser | None, target: Worker | None) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        sender_admin_id=n.sender_admin_id,
        sender_name=sender.display_name if sender else None,
        title=n.title,
        message=n.message,
        category=getattr(n, "category", None) or "general",
        target_type=n.target_type,
        target_worker_id=n.target_worker_id,
        target_worker_name=target.display_name if target else None,
        target_worker_username=target.username if target else None,
        is_read=n.is_read,
        read_at=n.read_at,
        created_at=n.created_at,
    )


def _worker_email(db: Session, worker: Worker) -> str | None:
    if not worker.admin_user_id:
        return None
    admin_user = db.get(AdminUser, worker.admin_user_id)
    return admin_user.email if admin_user else None


def _resolve_workers(db: Session, body: NotificationSend) -> list[Worker]:
    if body.target_type == "all":
        return list(db.exec(select(Worker).order_by(Worker.display_name)).all())

    if body.worker_ids:
        workers = list(db.exec(select(Worker).where(Worker.id.in_(body.worker_ids))).all())
        if not workers:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No workers found for the given IDs")
        return workers

    target_worker: Worker | None = None
    if body.target_username:
        target_worker = db.exec(select(Worker).where(Worker.username == body.target_username)).first()
    if not target_worker and body.target_email:
        admin_match = db.exec(select(AdminUser).where(AdminUser.email == body.target_email)).first()
        if admin_match:
            target_worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_match.id)).first()

    if not target_worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found with given username, email, or IDs",
        )
    return [target_worker]


@router.get("/recipients", response_model=list[NotificationRecipient])
def list_notification_recipients(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Workers with linked emails for the admin notification recipient picker."""
    workers = db.exec(select(Worker).order_by(Worker.display_name)).all()
    admin_ids = {w.admin_user_id for w in workers if w.admin_user_id}
    admins: dict[UUID, AdminUser] = {}
    if admin_ids:
        for a in db.exec(select(AdminUser).where(AdminUser.id.in_(admin_ids))).all():
            admins[a.id] = a

    return [
        NotificationRecipient(
            id=w.id,
            display_name=w.display_name,
            username=w.username,
            email=admins[w.admin_user_id].email if w.admin_user_id and w.admin_user_id in admins else None,
        )
        for w in workers
    ]


@router.post("", response_model=NotificationSendResult, status_code=status.HTTP_201_CREATED)
def send_notification(
    body: NotificationSend,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if body.target_type not in {"all", "specific"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_type must be 'all' or 'specific'")

    channels = (body.channels or "in_app").strip().lower()
    if channels not in {"in_app", "email", "both"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channels must be 'in_app', 'email', or 'both'")

    category = (body.category or "general").strip().lower()
    if category not in {"general", "payment"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="category must be 'general' or 'payment'")

    if not body.title.strip() or not body.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Title and message are required")

    # Keep original casing for Resend; lowercase is only for membership checks.
    extra_emails = [
        e.strip()
        for e in (body.extra_emails or [])
        if e and is_valid_email_address(e)
    ]

    has_worker_target = bool(body.worker_ids or body.target_username or body.target_email or body.target_type == "all")
    if body.target_type == "specific" and not has_worker_target and not extra_emails:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide worker_ids, username/email, or extra_emails for specific notifications",
        )

    do_in_app = channels in {"in_app", "both"}
    do_email = channels in {"email", "both"}

    workers: list[Worker] = []
    if has_worker_target:
        workers = _resolve_workers(db, body)

    if do_in_app and not workers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="In-app notifications require worker recipients (typed emails are email-only)",
        )

    if do_email and not workers and not extra_emails:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email channel requires workers with emails or typed extra_emails",
        )

    sender = get_admin_user(db, current_user)
    created: list[Notification] = []
    targets_by_id: dict[UUID, Worker] = {w.id: w for w in workers}

    if do_in_app:
        if body.target_type == "all":
            notification = Notification(
                sender_admin_id=sender.id,
                title=body.title.strip(),
                message=body.message.strip(),
                category=category,
                target_type="all",
                target_worker_id=None,
            )
            db.add(notification)
            created.append(notification)
        else:
            for worker in workers:
                notification = Notification(
                    sender_admin_id=sender.id,
                    title=body.title.strip(),
                    message=body.message.strip(),
                    category=category,
                    target_type="specific",
                    target_worker_id=worker.id,
                )
                db.add(notification)
                created.append(notification)
        db.commit()
        for n in created:
            db.refresh(n)

    emailed = 0
    skipped_no_email = 0
    email_failures: list[str] = []

    if do_email:
        html = render_broadcast_html(body.title.strip(), body.message.strip())
        subject = body.title.strip()
        sent_to: set[str] = set()

        for worker in workers:
            email = _worker_email(db, worker)
            if not email:
                skipped_no_email += 1
                continue
            key = email.strip().lower()
            if key in sent_to:
                continue
            sent_to.add(key)
            log = send_email(
                db,
                to_email=email,
                subject=subject,
                html=html,
                template="notification",
                worker_id=worker.id,
            )
            if log.status == "sent":
                emailed += 1
            elif log.error and len(email_failures) < 5:
                email_failures.append(f"{email}: {log.error}")

        for raw in extra_emails:
            key = raw.lower()
            if key in sent_to:
                continue
            sent_to.add(key)
            log = send_email(
                db,
                to_email=raw,
                subject=subject,
                html=html,
                template="notification",
            )
            if log.status == "sent":
                emailed += 1
            elif log.error and len(email_failures) < 5:
                email_failures.append(f"{raw}: {log.error}")

    return NotificationSendResult(
        notifications=[
            _build_response(n, sender, targets_by_id.get(n.target_worker_id) if n.target_worker_id else None)
            for n in created
        ],
        in_app_count=len(created),
        emailed=emailed,
        skipped_no_email=skipped_no_email,
        email_failures=email_failures,
    )


@router.get("/me", response_model=list[NotificationResponse])
def get_my_notifications(
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    stmt = (
        select(Notification)
        .where(
            or_(
                Notification.target_type == "all",
                Notification.target_worker_id == worker.id,
            )
        )
        .order_by(Notification.created_at.desc())
    )
    if category:
        stmt = stmt.where(Notification.category == category.strip().lower())
    notifications = db.exec(stmt).all()

    sender_ids = {n.sender_admin_id for n in notifications if n.sender_admin_id}
    senders: dict[UUID, AdminUser] = {}
    if sender_ids:
        rows = db.exec(select(AdminUser).where(AdminUser.id.in_(sender_ids))).all()
        senders = {a.id: a for a in rows}

    return [_build_response(n, senders.get(n.sender_admin_id), worker if n.target_worker_id == worker.id else None) for n in notifications]


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    notification = db.exec(select(Notification).where(Notification.id == notification_id)).first()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    if notification.target_type == "specific" and notification.target_worker_id != worker.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your notification")

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        db.add(notification)
        db.commit()
        db.refresh(notification)

    sender = db.exec(select(AdminUser).where(AdminUser.id == notification.sender_admin_id)).first() if notification.sender_admin_id else None
    target = db.exec(select(Worker).where(Worker.id == notification.target_worker_id)).first() if notification.target_worker_id else None
    return _build_response(notification, sender, target)


@router.get("/sent", response_model=list[NotificationResponse])
def list_sent_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    notifications = db.exec(
        select(Notification).order_by(Notification.created_at.desc())
    ).all()

    sender_ids = {n.sender_admin_id for n in notifications if n.sender_admin_id}
    worker_ids = {n.target_worker_id for n in notifications if n.target_worker_id}

    senders: dict[UUID, AdminUser] = {}
    targets: dict[UUID, Worker] = {}

    if sender_ids:
        rows = db.exec(select(AdminUser).where(AdminUser.id.in_(sender_ids))).all()
        senders = {a.id: a for a in rows}
    if worker_ids:
        rows = db.exec(select(Worker).where(Worker.id.in_(worker_ids))).all()
        targets = {w.id: w for w in rows}

    return [
        _build_response(n, senders.get(n.sender_admin_id), targets.get(n.target_worker_id))
        for n in notifications
    ]
