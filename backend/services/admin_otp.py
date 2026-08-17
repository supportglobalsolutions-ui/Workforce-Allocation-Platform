"""
Destructive-action confirmation codes.

A work-period delete (and any later action that uses the same path) cannot
complete until a 6-digit code sent to the ops alert inbox is entered. Codes
expire in three minutes. After the alert email is changed, codes keep going to
the previous inbox for 24 hours so swapping the address cannot immediately
authorize a delete.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlmodel import Session, select

from core.config import settings
from models.admin_otp import AdminOtpChallenge
from models.admin_users import AdminUser
from models.platform_settings import (
    DEFAULT_ALERT_EMAIL,
    PLATFORM_SETTINGS_ID,
    PlatformSettings,
)
from services.email_resend import send_email

logger = logging.getLogger(__name__)

OTP_TTL = timedelta(minutes=3)
OTP_COOLDOWN = timedelta(hours=24)
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_SECONDS = 30
PURPOSE_DELETE_PERIOD = "delete_payroll_period"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def get_platform_settings(db: Session) -> PlatformSettings:
    row = db.get(PlatformSettings, PLATFORM_SETTINGS_ID)
    if row:
        return row
    row = PlatformSettings(id=PLATFORM_SETTINGS_ID, alert_email=DEFAULT_ALERT_EMAIL)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def mask_email(email: str) -> str:
    addr = (email or "").strip()
    if "@" not in addr:
        return "***"
    local, domain = addr.split("@", 1)
    if len(local) <= 2:
        shown = local[:1] + "*"
    else:
        shown = local[:2] + "***"
    return f"{shown}@{domain}"


def otp_recipient(row: PlatformSettings) -> tuple[str, bool, Optional[datetime]]:
    """
    Address that currently receives destructive-action codes.

    Returns (email, using_previous, trusted_at) where trusted_at is when the
    configured email starts receiving codes (changed_at + 24h), or None if it
    already does.
    """
    changed = _aware(row.alert_email_changed_at)
    if changed is None:
        return row.alert_email, False, None
    trusted_at = changed + OTP_COOLDOWN
    if _utcnow() >= trusted_at:
        return row.alert_email, False, None
    if not row.alert_email_previous:
        raise HTTPException(
            status_code=409,
            detail=(
                "The alert email cannot receive confirmation codes until "
                f"{trusted_at.isoformat()}. Set it at least 24 hours before a delete."
            ),
        )
    return row.alert_email_previous, True, trusted_at


def set_alert_email(db: Session, row: PlatformSettings, new_email: str) -> PlatformSettings:
    nxt = new_email.strip()
    if nxt.lower() == (row.alert_email or "").lower():
        return row

    now = _utcnow()
    changed = _aware(row.alert_email_changed_at)
    currently_trusted = changed is None or now >= changed + OTP_COOLDOWN
    if currently_trusted:
        # Freeze the inbox that already receives codes as "previous" and start
        # the 24h clock. Later changes during the cooldown only update the
        # pending address — they must not rotate previous, or an attacker
        # could change twice and receive codes at the new inbox.
        row.alert_email_previous = row.alert_email
        row.alert_email_changed_at = now
    row.alert_email = nxt
    row.updated_at = now
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _pepper() -> bytes:
    return (settings.OTP_PEPPER or settings.RESEND_API_KEY or "gs-otp-dev").encode()


def hash_otp(challenge_id: UUID, code: str) -> str:
    return hmac.new(_pepper(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _invalidate_open(db: Session, purpose: str, target_id: UUID) -> None:
    open_rows = db.exec(
        select(AdminOtpChallenge).where(
            AdminOtpChallenge.purpose == purpose,
            AdminOtpChallenge.target_id == target_id,
            AdminOtpChallenge.consumed_at.is_(None),
        )
    ).all()
    now = _utcnow()
    for row in open_rows:
        row.consumed_at = now
        db.add(row)


def issue_otp(
    db: Session,
    *,
    purpose: str,
    target_id: UUID,
    subject: str,
    html: str,
    text: str,
    admin: AdminUser,
) -> dict:
    row = get_platform_settings(db)
    to_email, using_previous, trusted_at = otp_recipient(row)

    latest = db.exec(
        select(AdminOtpChallenge)
        .where(
            AdminOtpChallenge.purpose == purpose,
            AdminOtpChallenge.target_id == target_id,
        )
        .order_by(AdminOtpChallenge.created_at.desc())
    ).first()
    created = _aware(latest.created_at) if latest else None
    if created and (_utcnow() - created) < timedelta(seconds=OTP_RESEND_SECONDS):
        wait = OTP_RESEND_SECONDS - int((_utcnow() - created).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Wait {max(wait, 1)} seconds before requesting another code.",
        )

    _invalidate_open(db, purpose, target_id)

    challenge = AdminOtpChallenge(
        purpose=purpose,
        target_id=target_id,
        code_hash="pending",
        sent_to=to_email,
        expires_at=_utcnow() + OTP_TTL,
        created_by=admin.id,
    )
    db.add(challenge)
    db.flush()

    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = hash_otp(challenge.id, code)
    db.add(challenge)
    db.commit()
    db.refresh(challenge)

    log = send_email(
        db,
        to_email=to_email,
        subject=subject,
        html=html.replace("{{CODE}}", code),
        text=text.replace("{{CODE}}", code),
        template="otp",
    )
    if log.status != "sent":
        challenge.consumed_at = _utcnow()
        db.add(challenge)
        db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"Could not send the confirmation code: {log.error or 'email failed'}",
        )

    return {
        "challenge_id": str(challenge.id),
        "expires_at": challenge.expires_at.isoformat(),
        "sent_to": mask_email(to_email),
        "using_previous_email": using_previous,
        "configured_email_trusted_at": trusted_at.isoformat() if trusted_at else None,
        "ttl_seconds": int(OTP_TTL.total_seconds()),
    }


def verify_otp(
    db: Session,
    *,
    challenge_id: UUID,
    purpose: str,
    target_id: UUID,
    code: str,
) -> AdminOtpChallenge:
    challenge = db.get(AdminOtpChallenge, challenge_id)
    if (
        not challenge
        or challenge.purpose != purpose
        or challenge.target_id != target_id
    ):
        raise HTTPException(status_code=400, detail="That confirmation is not valid.")

    if challenge.consumed_at is not None:
        raise HTTPException(status_code=400, detail="That code has already been used.")

    if _aware(challenge.expires_at) and _utcnow() > _aware(challenge.expires_at):
        raise HTTPException(status_code=400, detail="That code expired. Request a new one.")

    if challenge.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Request a new code.")

    submitted = (code or "").strip().replace(" ", "")
    expected = hash_otp(challenge.id, submitted)
    if not hmac.compare_digest(expected, challenge.code_hash):
        challenge.attempts += 1
        db.add(challenge)
        db.commit()
        remaining = OTP_MAX_ATTEMPTS - challenge.attempts
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
        )

    challenge.consumed_at = _utcnow()
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return challenge
