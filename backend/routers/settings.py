from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from core.database import get_db
from core.permissions import require_admin
from routers.deps import get_admin_user
from services.account_guard import is_protected_account, is_protected_email
from services.admin_otp import get_platform_settings, mask_email, otp_recipient, set_alert_email
from services.audit_service import record_audit
from services.email_resend import blocked_recipient_reason

router = APIRouter()

_ALERT_EMAIL_FORBIDDEN = (
    "Only a protected Super Admin can change the alert email that receives confirmation codes."
)


class AlertEmailUpdate(BaseModel):
    alert_email: str


def _can_edit_alert_email(current_user: dict, admin) -> bool:
    if is_protected_email(current_user.get("email")):
        return True
    if current_user.get("protected"):
        return True
    return is_protected_account(None, admin)


def _settings_payload(row, *, can_edit: bool) -> dict:
    try:
        recipient, using_previous, trusted_at = otp_recipient(row)
        otp_ready = True
        otp_blocked_reason = None
    except HTTPException as exc:
        recipient, using_previous, trusted_at = None, False, None
        otp_ready = False
        otp_blocked_reason = exc.detail

    return {
        "alert_email": row.alert_email if can_edit else mask_email(row.alert_email),
        "alert_email_masked": mask_email(row.alert_email),
        "otp_recipient_masked": mask_email(recipient) if recipient else None,
        "using_previous_email": using_previous,
        "configured_email_trusted_at": trusted_at.isoformat() if trusted_at else None,
        "otp_ready": otp_ready,
        "otp_blocked_reason": otp_blocked_reason,
        "alert_email_changed_at": row.alert_email_changed_at.isoformat() if row.alert_email_changed_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "can_edit_alert_email": can_edit,
    }


@router.get("", include_in_schema=False)
@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    can_edit = _can_edit_alert_email(current_user, admin)
    return _settings_payload(get_platform_settings(db), can_edit=can_edit)


@router.patch("/alert-email")
def update_alert_email(
    body: AlertEmailUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Change the inbox that will eventually receive deletion codes.

    Only a protected Super Admin can do this. Codes keep going to the previous
    inbox for 24 hours after a change.
    """
    admin = get_admin_user(db, current_user)
    if not _can_edit_alert_email(current_user, admin):
        raise HTTPException(status_code=403, detail=_ALERT_EMAIL_FORBIDDEN)

    blocked = blocked_recipient_reason(body.alert_email)
    if blocked:
        raise HTTPException(status_code=400, detail=blocked)

    row = get_platform_settings(db)
    previous = row.alert_email
    row = set_alert_email(db, row, body.alert_email)
    record_audit(
        db,
        actor_id=admin.id,
        action="settings.alert_email_changed",
        target_type="platform_settings",
        target_id=row.id,
        previous_value={"alert_email": previous},
        new_value={"alert_email": row.alert_email},
        reason_note="Admin alert email updated; OTP cooldown 24 hours",
    )
    db.commit()
    return _settings_payload(row, can_edit=True)
