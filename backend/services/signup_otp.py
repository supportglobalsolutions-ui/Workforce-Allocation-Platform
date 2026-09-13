"""
Email verification before a worker account is created.

The code is stored in Redis (no user row exists yet). After a correct code,
a short-lived proof token is required by POST /auth/register.
"""
from __future__ import annotations

import hmac
import json
import logging
import secrets
from uuid import NAMESPACE_OID, UUID, uuid5

import redis as redis_lib
from fastapi import HTTPException

from core.redis import get_redis
from services.admin_otp import OTP_MAX_ATTEMPTS, OTP_TTL, hash_otp, mask_email
from services.email_resend import render_login_otp_html, render_login_otp_text, send_email

logger = logging.getLogger(__name__)

OTP_RESEND_LIMIT = 5
PROOF_TTL_SECONDS = 20 * 60


def _otp_key(email: str) -> str:
    return f"signup_otp:{email.strip().lower()}"


def _proof_key(token: str) -> str:
    return f"signup_proof:{token}"


def _challenge_id(email: str) -> UUID:
    return uuid5(NAMESPACE_OID, f"signup:{email.strip().lower()}")


def deliver_signup_otp_email(*, to_email: str, code: str) -> None:
    from core.database import engine
    from sqlmodel import Session

    title = "Confirm your email"
    intro = (
        "Use this code to confirm your email before your GlobalSolutions account is created. "
        "It expires in 3 minutes."
    )
    html = render_login_otp_html(title=title, intro=intro).replace("{{CODE}}", code)
    text = render_login_otp_text(title=title, intro=intro).replace("{{CODE}}", code)
    try:
        with Session(engine) as session:
            log = send_email(
                session,
                to_email=to_email,
                subject=f"GlobalSolutions · {title}",
                html=html,
                text=text,
                template="otp",
            )
            if log.status != "sent":
                logger.error("Signup OTP email failed: %s", log.error)
    except Exception:
        logger.exception("Signup OTP email failed for %s", to_email)


def issue_signup_otp(email: str, *, resends_remaining: int) -> dict:
    """Store a signup code and return the payload plus an email delivery job."""
    addr = email.strip().lower()
    if "@" not in addr:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    payload = {
        "code_hash": hash_otp(_challenge_id(addr), code),
        "attempts": 0,
    }
    try:
        get_redis().setex(_otp_key(addr), int(OTP_TTL.total_seconds()), json.dumps(payload).encode())
    except redis_lib.RedisError as exc:
        logger.error("Could not store signup OTP: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Verification storage unavailable. Try again shortly.",
        ) from exc

    return {
        "sent_to": mask_email(addr),
        "ttl_seconds": int(OTP_TTL.total_seconds()),
        "resends_remaining": resends_remaining,
        "sending": True,
        "_delivery": {"to_email": addr, "code": code},
    }


def verify_signup_otp(email: str, code: str) -> dict:
    addr = email.strip().lower()
    submitted = (code or "").strip().replace(" ", "")
    try:
        raw = get_redis().get(_otp_key(addr))
    except redis_lib.RedisError as exc:
        raise HTTPException(
            status_code=503,
            detail="Verification storage unavailable. Try again shortly.",
        ) from exc
    if not raw:
        raise HTTPException(status_code=400, detail="That code expired. Request a new one.")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="That verification is not valid.") from exc

    attempts = int(data.get("attempts") or 0)
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many incorrect attempts. Request a new code.")

    expected = hash_otp(_challenge_id(addr), submitted)
    stored = str(data.get("code_hash") or "")
    if not hmac.compare_digest(expected, stored):
        data["attempts"] = attempts + 1
        try:
            ttl = max(get_redis().ttl(_otp_key(addr)), 1)
            get_redis().setex(_otp_key(addr), ttl, json.dumps(data).encode())
        except redis_lib.RedisError:
            pass
        remaining = OTP_MAX_ATTEMPTS - int(data["attempts"])
        raise HTTPException(
            status_code=400,
            detail=f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} left.",
        )

    token = secrets.token_urlsafe(32)
    try:
        client = get_redis()
        client.setex(_proof_key(token), PROOF_TTL_SECONDS, addr.encode())
        client.delete(_otp_key(addr))
    except redis_lib.RedisError as exc:
        raise HTTPException(
            status_code=503,
            detail="Verification storage unavailable. Try again shortly.",
        ) from exc

    return {"verification_token": token}


def assert_signup_proof(email: str, token: str) -> None:
    """Confirm the email was verified, without consuming the proof yet."""
    addr = email.strip().lower()
    proof = (token or "").strip()
    if len(proof) < 20:
        raise HTTPException(
            status_code=400,
            detail="Verify your email before creating an account.",
        )
    try:
        stored = get_redis().get(_proof_key(proof))
    except redis_lib.RedisError as exc:
        raise HTTPException(
            status_code=503,
            detail="Verification storage unavailable. Try again shortly.",
        ) from exc
    if not stored or stored.decode() != addr:
        raise HTTPException(
            status_code=400,
            detail="Email verification expired. Enter your email and request a new code.",
        )


def consume_signup_proof(email: str, token: str) -> None:
    """Delete a verified proof after the account is created."""
    assert_signup_proof(email, token)
    try:
        get_redis().delete(_proof_key((token or "").strip()))
    except redis_lib.RedisError:
        logger.warning("Could not delete signup proof for %s", email)
