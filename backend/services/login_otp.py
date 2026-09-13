"""
Login OTP via Resend.

Required when:
- first login ever (admin_users.first_login_verified_at is null), OR
- every login for privileged roles (admin / super_admin / executive)

Codes go to the user's own email using the GlobalSolutions branded template.
After verify, Redis stores a short-lived MFA ok flag used by session-token.
"""
from __future__ import annotations

import hmac
import logging
import secrets
from datetime import timedelta
from typing import Optional
from uuid import UUID

import redis as redis_lib
from fastapi import HTTPException
from sqlmodel import Session, select

from core.redis import get_redis
from models.admin_otp import AdminOtpChallenge
from models.admin_users import AdminUser
from services.admin_otp import (
    OTP_MAX_ATTEMPTS,
    OTP_RESEND_SECONDS,
    OTP_TTL,
    _aware,
    _invalidate_open,
    _utcnow,
    hash_otp,
    mask_email,
)
from services.email_resend import render_login_otp_html, render_login_otp_text, send_email

logger = logging.getLogger(__name__)

PURPOSE_LOGIN = "login"
PRIVILEGED_ROLES = frozenset({"admin", "super_admin"})
# How long a verified login MFA flag lasts (covers session cookie lifetime).
MFA_OK_TTL_SECONDS = 60 * 60 * 12  # 12 hours


def _mfa_key(uid: str) -> str:
    return f"login_mfa:{uid}"


def clear_login_mfa(uid: str) -> None:
    try:
        get_redis().delete(_mfa_key(uid))
    except redis_lib.RedisError as exc:
        logger.warning("Could not clear login MFA flag: %s", exc)


def set_login_mfa(uid: str) -> None:
    try:
        get_redis().setex(_mfa_key(uid), MFA_OK_TTL_SECONDS, b"1")
    except redis_lib.RedisError as exc:
        logger.error("Could not set login MFA flag: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Verification storage unavailable. Try again shortly.",
        ) from exc


def has_login_mfa(uid: str) -> bool:
    try:
        return bool(get_redis().get(_mfa_key(uid)))
    except redis_lib.RedisError as exc:
        logger.warning("Could not read login MFA flag: %s", exc)
        return False


def login_otp_required(admin: AdminUser, auth_role: str) -> bool:
    if (auth_role or "").strip() in PRIVILEGED_ROLES:
        return True
    return admin.first_login_verified_at is None


def issue_login_otp(
    db: Session,
    *,
    admin: AdminUser,
    auth_role: str,
) -> dict:
    """Send a login OTP to the account email. Clears any prior MFA flag."""
    if not login_otp_required(admin, auth_role):
        return {
            "required": False,
            "reason": None,
            "challenge_id": None,
            "sent_to": None,
            "ttl_seconds": None,
            "expires_at": None,
        }

    clear_login_mfa(admin.auth_user_id)
    reason = "privileged" if (auth_role or "").strip() in PRIVILEGED_ROLES else "first_login"
    to_email = (admin.email or "").strip()
    if not to_email or "@" not in to_email:
        raise HTTPException(status_code=400, detail="Account has no email for verification.")

    latest = db.exec(
        select(AdminOtpChallenge)
        .where(
            AdminOtpChallenge.purpose == PURPOSE_LOGIN,
            AdminOtpChallenge.target_id == admin.id,
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

    _invalidate_open(db, PURPOSE_LOGIN, admin.id)

    challenge = AdminOtpChallenge(
        purpose=PURPOSE_LOGIN,
        target_id=admin.id,
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

    if reason == "privileged":
        intro = (
            "A sign-in to your GlobalSolutions Operations account needs confirmation. "
            "Enter this code to finish logging in."
        )
        title = "Confirm your sign-in"
    else:
        intro = (
            "Welcome to GlobalSolutions. Confirm this first sign-in with the code below "
            "to secure your account."
        )
        title = "Verify your first sign-in"

    html = render_login_otp_html(title=title, intro=intro)
    text = render_login_otp_text(title=title, intro=intro)

    log = send_email(
        db,
        to_email=to_email,
        subject=f"GlobalSolutions · {title}",
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
            detail=f"Could not send the verification code: {log.error or 'email failed'}",
        )

    return {
        "required": True,
        "reason": reason,
        "challenge_id": str(challenge.id),
        "sent_to": mask_email(to_email),
        "ttl_seconds": int(OTP_TTL.total_seconds()),
        "expires_at": challenge.expires_at.isoformat() if challenge.expires_at else None,
    }


def verify_login_otp(
    db: Session,
    *,
    admin: AdminUser,
    challenge_id: UUID,
    code: str,
) -> dict:
    challenge = db.get(AdminOtpChallenge, challenge_id)
    if (
        not challenge
        or challenge.purpose != PURPOSE_LOGIN
        or challenge.target_id != admin.id
    ):
        raise HTTPException(status_code=400, detail="That verification is not valid.")

    if challenge.consumed_at is not None:
        raise HTTPException(status_code=400, detail="That code has already been used.")

    if _aware(challenge.expires_at) and _utcnow() > _aware(challenge.expires_at):
        raise HTTPException(status_code=400, detail="That code expired. Request a new one.")

    if challenge.attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Request a new code.",
        )

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

    now = _utcnow()
    challenge.consumed_at = now
    db.add(challenge)

    if admin.first_login_verified_at is None:
        admin.first_login_verified_at = now
        admin.updated_at = now
        db.add(admin)

    db.commit()
    set_login_mfa(admin.auth_user_id)

    return {"ok": True, "first_login": admin.first_login_verified_at is not None}
