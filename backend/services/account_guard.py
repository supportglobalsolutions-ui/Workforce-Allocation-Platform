"""Hard limits on deleting, banning, or demoting privileged accounts."""
from __future__ import annotations

from sqlmodel import Session, select

from core.config import settings
from core.supabase_auth import (
    _APP_CREATED_BY_KEY,
    _APP_PROTECTED_KEY,
    _merge_app_metadata,
    get_auth_user,
)
from models.admin_users import AdminUser
from models.enums import AccountStatusEnum, AdminRoleEnum


class AccountGuardError(Exception):
    def __init__(self, message: str, *, status_code: int = 403):
        super().__init__(message)
        self.status_code = status_code


def _email(user: dict | None) -> str:
    return ((user or {}).get("email") or "").strip().lower()


def _app_md(user: dict | None) -> dict:
    return (user or {}).get("app_metadata") or {}


def is_protected_email(email: str | None) -> bool:
    return (email or "").strip().lower() in settings.protected_super_admin_emails


def is_protected_account(
    user: dict | None,
    admin_row: AdminUser | None = None,
) -> bool:
    if admin_row and admin_row.is_protected:
        return True
    md = _app_md(user)
    if md.get(_APP_PROTECTED_KEY) in {True, "true", "1", 1}:
        return True
    return is_protected_email(_email(user) or (admin_row.email if admin_row else None))


def created_by_uid(user: dict | None, admin_row: AdminUser | None = None) -> str | None:
    raw = _app_md(user).get(_APP_CREATED_BY_KEY) or (
        admin_row.created_by_auth_user_id if admin_row else None
    )
    value = (str(raw).strip() if raw else "") or None
    return value


def _admin_by_auth_id(db: Session, uid: str) -> AdminUser | None:
    return db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()


def _created_by_of(db: Session, uid: str) -> str | None:
    row = _admin_by_auth_id(db, uid)
    if row and row.created_by_auth_user_id:
        return row.created_by_auth_user_id
    try:
        user = get_auth_user(uid)
    except Exception:
        return None
    return created_by_uid(user, row)


def actor_is_descendant_of(db: Session, *, actor_uid: str, target_uid: str, hops: int = 8) -> bool:
    """True when target created the actor, directly or through a short chain."""
    current = actor_uid
    seen: set[str] = set()
    for _ in range(hops):
        if current in seen:
            break
        seen.add(current)
        parent = _created_by_of(db, current)
        if not parent:
            return False
        if parent == target_uid:
            return True
        current = parent
    return False


def stamp_account_lineage(
    db: Session,
    *,
    uid: str,
    email: str,
    display_name: str,
    actor_uid: str | None,
    org_role: AdminRoleEnum,
) -> AdminUser:
    """Record who created this login. Never overwrite an existing parent."""
    row = _admin_by_auth_id(db, uid)
    protected = is_protected_email(email)
    parent = actor_uid if actor_uid and actor_uid != uid else None
    if not row:
        row = AdminUser(
            auth_user_id=uid,
            email=email or f"{uid}@unknown.local",
            role=org_role,
            display_name=display_name or (email or "").split("@")[0] or "Account",
            status=AccountStatusEnum.active,
            created_by_auth_user_id=parent,
            is_protected=protected,
        )
        db.add(row)
    else:
        if not row.created_by_auth_user_id and parent:
            row.created_by_auth_user_id = parent
        if protected:
            row.is_protected = True
        row.role = org_role
        db.add(row)
    db.commit()
    db.refresh(row)

    try:
        current = get_auth_user(uid)
    except Exception:
        current = {}
    meta: dict = {}
    if parent and not (_app_md(current).get(_APP_CREATED_BY_KEY)):
        meta[_APP_CREATED_BY_KEY] = parent
    if protected:
        meta[_APP_PROTECTED_KEY] = True
    if meta:
        try:
            _merge_app_metadata(uid, meta)
        except Exception:
            pass
    return row


def assert_can_mutate_account(
    db: Session,
    *,
    actor_uid: str,
    actor_role: str,
    target_uid: str,
    action: str,
) -> dict:
    """Raise AccountGuardError when delete/ban/role/reject is not allowed."""
    if target_uid == actor_uid and action in {"delete", "ban", "role"}:
        raise AccountGuardError("You cannot do that to your own account.")

    try:
        target = get_auth_user(target_uid)
    except Exception:
        target = {}
    target_row = _admin_by_auth_id(db, target_uid)

    if is_protected_account(target, target_row) and action in {"delete", "ban", "role", "reject"}:
        raise AccountGuardError(
            "This is a protected Super Admin. Nobody can delete, ban, or change its role."
        )

    if actor_is_descendant_of(db, actor_uid=actor_uid, target_uid=target_uid):
        raise AccountGuardError(
            "You cannot remove or change the account that created yours."
        )

    target_role = _app_md(target).get("role", "user")
    if actor_role != "super_admin" and target_role in {"super_admin", "executive"}:
        raise AccountGuardError("You cannot change a leadership account.")

    return target
