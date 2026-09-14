"""
Invite an admin-created account to set its own password.

The admin never chooses a password on someone else's behalf: a one-time
Supabase action link is minted server-side and delivered through the branded
Resend template, so the invitee sets a credential only they know.
"""
from __future__ import annotations

import logging
import secrets

from core.config import settings
from core.supabase_auth import generate_action_link
from services.email_resend import (
    render_account_invite_html,
    render_account_invite_text,
    send_email,
)

logger = logging.getLogger(__name__)

ROLE_LABELS = {
    "user": "a Worker",
    "partner": "a Partner",
    "admin": "an Operations Lead",
    "executive": "an Executive",
    "super_admin": "a Super Admin",
}


def generate_placeholder_password() -> str:
    """
    Unguessable stand-in used only to create the account.

    Supabase requires a password at creation time, but nobody is ever told
    this one — the invite link is the only way in, and setting a password
    through it replaces this value.
    """
    return secrets.token_urlsafe(32)


def invite_redirect_url() -> str:
    base = (settings.APP_BASE_URL or "http://localhost:3000").rstrip("/")
    return f"{base}/reset-password"


def deliver_account_invite(
    *,
    to_email: str,
    display_name: str,
    role: str,
    link_type: str = "recovery",
) -> None:
    """
    Send the set-your-password invitation. Safe to run as a background task —
    failures are logged and recorded in email_log rather than raised.
    """
    from sqlmodel import Session

    from core.database import engine

    try:
        setup_url = generate_action_link(
            to_email,
            link_type=link_type,
            redirect_to=invite_redirect_url(),
        )
    except Exception:
        logger.exception("Could not generate invite link for %s", to_email)
        return

    role_label = ROLE_LABELS.get(role, "a team member")
    html = render_account_invite_html(
        name=display_name, setup_url=setup_url, role_label=role_label
    )
    text = render_account_invite_text(
        name=display_name, setup_url=setup_url, role_label=role_label
    )

    try:
        with Session(engine) as session:
            log = send_email(
                session,
                to_email=to_email,
                subject="GlobalSolutions · Finish setting up your account",
                html=html,
                text=text,
                template="account_invite",
            )
            if log.status != "sent":
                logger.error("Account invite email failed: %s", log.error)
    except Exception:
        logger.exception("Account invite email failed for %s", to_email)
