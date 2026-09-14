"""
Usernames and sign-in identifier resolution.

An account can be reached by either its username or its email, so someone who
forgets one can still get in. Both resolve to the email address, which is what
Supabase authenticates against.
"""
from __future__ import annotations

import re
from typing import Optional

from sqlmodel import Session, select

from models.admin_users import AdminUser
from models.worker import Worker

USERNAME_MIN = 3
USERNAME_MAX = 32
# Letters, digits, dot, underscore, hyphen. Must start and end alphanumeric so
# usernames cannot be confused with emails or padded with punctuation.
_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$")

# Names that would let an account impersonate a system endpoint or role.
RESERVED = {
    "admin", "administrator", "root", "system", "support", "help", "billing",
    "security", "superadmin", "super_admin", "executive", "owner", "staff",
    "globalsolutions", "gs", "null", "none", "undefined", "me", "self", "api",
}


class UsernameError(ValueError):
    """Raised when a username is malformed, reserved, or already taken."""


def normalize_username(raw: str) -> str:
    """Lowercase and trim. Storage and lookup are always case-insensitive."""
    return (raw or "").strip().lower()


def looks_like_email(identifier: str) -> bool:
    return "@" in (identifier or "")


def validate_username(raw: str) -> str:
    """Return the normalised username or raise UsernameError."""
    username = normalize_username(raw)
    if not username:
        raise UsernameError("Username is required.")
    if looks_like_email(username):
        raise UsernameError("Username cannot contain '@'.")
    if len(username) < USERNAME_MIN:
        raise UsernameError(f"Username must be at least {USERNAME_MIN} characters.")
    if len(username) > USERNAME_MAX:
        raise UsernameError(f"Username must be at most {USERNAME_MAX} characters.")
    if not _USERNAME_RE.match(username):
        raise UsernameError(
            "Username may use letters, numbers, dots, underscores and hyphens, "
            "and must start and end with a letter or number."
        )
    if username in RESERVED:
        raise UsernameError("That username is reserved. Choose another.")
    return username


def username_taken(db: Session, username: str, *, exclude_auth_uid: str | None = None) -> bool:
    """Usernames are unique across accounts and worker profiles alike."""
    username = normalize_username(username)

    stmt = select(AdminUser).where(AdminUser.username == username)
    if exclude_auth_uid:
        stmt = stmt.where(AdminUser.auth_user_id != exclude_auth_uid)
    if db.exec(stmt).first():
        return True

    worker_stmt = select(Worker).where(Worker.username == username)
    if exclude_auth_uid:
        owner = db.exec(
            select(AdminUser).where(AdminUser.auth_user_id == exclude_auth_uid)
        ).first()
        if owner:
            worker_stmt = worker_stmt.where(Worker.admin_user_id != owner.id)
    return db.exec(worker_stmt).first() is not None


def assert_username_available(
    db: Session, raw: str, *, exclude_auth_uid: str | None = None
) -> str:
    username = validate_username(raw)
    if username_taken(db, username, exclude_auth_uid=exclude_auth_uid):
        raise UsernameError("That username is already taken.")
    return username


def email_for_identifier(db: Session, identifier: str) -> Optional[str]:
    """
    Map a username or email to the account's email address.

    Returns None when nothing matches — callers must not send codes or emails
    for an identifier that does not exist.
    """
    value = (identifier or "").strip()
    if not value:
        return None

    if looks_like_email(value):
        email = value.lower()
        row = db.exec(select(AdminUser).where(AdminUser.email == email)).first()
        # An account may exist in Supabase without a local profile row yet, so
        # an email that looks valid is still worth passing through.
        return row.email if row else email

    username = normalize_username(value)
    row = db.exec(select(AdminUser).where(AdminUser.username == username)).first()
    if row and row.email:
        return row.email

    worker = db.exec(select(Worker).where(Worker.username == username)).first()
    if worker and worker.admin_user_id:
        owner = db.exec(
            select(AdminUser).where(AdminUser.id == worker.admin_user_id)
        ).first()
        if owner and owner.email:
            return owner.email
    return None
