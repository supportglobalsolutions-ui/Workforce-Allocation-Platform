from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, or_, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.admin_users import AdminUser
from models.notification import Notification
from models.worker import Worker
from schemas.notification import NotificationResponse, NotificationSend
from .deps import get_admin_user, get_worker_for_user

router = APIRouter()


def _build_response(n: Notification, sender: AdminUser | None, target: Worker | None) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        sender_admin_id=n.sender_admin_id,
        sender_name=sender.display_name if sender else None,
        title=n.title,
        message=n.message,
        target_type=n.target_type,
        target_worker_id=n.target_worker_id,
        target_worker_name=target.display_name if target else None,
        target_worker_username=target.username if target else None,
        is_read=n.is_read,
        read_at=n.read_at,
        created_at=n.created_at,
    )


@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
def send_notification(
    body: NotificationSend,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    if body.target_type not in {"all", "specific"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="target_type must be 'all' or 'specific'")

    sender = get_admin_user(db, current_user)
    target_worker: Worker | None = None

    if body.target_type == "specific":
        if not body.target_username and not body.target_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide target_username or target_email for specific notifications",
            )
        if body.target_username:
            target_worker = db.exec(select(Worker).where(Worker.username == body.target_username)).first()
        if not target_worker and body.target_email:
            admin_match = db.exec(select(AdminUser).where(AdminUser.email == body.target_email)).first()
            if admin_match:
                target_worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_match.id)).first()

        if not target_worker:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found with given username or email")

    notification = Notification(
        sender_admin_id=sender.id,
        title=body.title,
        message=body.message,
        target_type=body.target_type,
        target_worker_id=target_worker.id if target_worker else None,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return _build_response(notification, sender, target_worker)


@router.get("/me", response_model=list[NotificationResponse])
def get_my_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    notifications = db.exec(
        select(Notification)
        .where(
            or_(
                Notification.target_type == "all",
                Notification.target_worker_id == worker.id,
            )
        )
        .order_by(Notification.created_at.desc())
    ).all()

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
