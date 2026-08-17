from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from core.database import get_db
from core.permissions import require_admin
from models.audit_log import AuditLog
from routers.deps import get_admin_user
from services.admin_otp import get_platform_settings, mask_email, otp_recipient, set_alert_email
from services.email_resend import blocked_recipient_reason

router = APIRouter()


class AlertEmailUpdate(BaseModel):
    alert_email: str


def _settings_payload(row) -> dict:
    try:
        recipient, using_previous, trusted_at = otp_recipient(row)
        otp_ready = True
        otp_blocked_reason = None
    except HTTPException as exc:
        recipient, using_previous, trusted_at = None, False, None
        otp_ready = False
        otp_blocked_reason = exc.detail

    return {
        "alert_email": row.alert_email,
        "alert_email_masked": mask_email(row.alert_email),
        "otp_recipient_masked": mask_email(recipient) if recipient else None,
        "using_previous_email": using_previous,
        "configured_email_trusted_at": trusted_at.isoformat() if trusted_at else None,
        "otp_ready": otp_ready,
        "otp_blocked_reason": otp_blocked_reason,
        "alert_email_changed_at": row.alert_email_changed_at.isoformat() if row.alert_email_changed_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return _settings_payload(get_platform_settings(db))


@router.patch("/alert-email")
def update_alert_email(
    body: AlertEmailUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Change the inbox that will eventually receive deletion codes.

    Password confirmation is intentionally not required yet. The 24-hour
    cooldown is the protection: codes keep going to the previous inbox until
    the new address has been on file for a full day.
    """
    blocked = blocked_recipient_reason(body.alert_email)
    if blocked:
        raise HTTPException(status_code=400, detail=blocked)

    row = get_platform_settings(db)
    previous = row.alert_email
    row = set_alert_email(db, row, body.alert_email)
    admin = get_admin_user(db, current_user)
    db.add(AuditLog(
        actor_id=admin.id,
        action="settings.alert_email_changed",
        target_type="platform_settings",
        target_id=row.id,
        previous_value={"alert_email": previous},
        new_value={"alert_email": row.alert_email},
        reason_note="Admin alert email updated; OTP cooldown 24 hours",
    ))
    db.commit()
    return _settings_payload(row)
