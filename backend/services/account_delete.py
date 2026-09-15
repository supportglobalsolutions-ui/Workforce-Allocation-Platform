"""Remove a login account without wiping historical work sessions."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from core.redis import get_redis
from core.supabase_auth import delete_auth_user, get_auth_user, list_auth_users
from models.admin_users import AdminUser
from models.allocation import Allocation
from models.enums import AccountStatusEnum, ReleaseReasonEnum, SessionCloseEnum
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from services.account_guard import AccountGuardError, assert_can_mutate_account

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _release_live_rdp(db: Session, worker_id: UUID) -> None:
    """Free machines this person is on. Session rows stay (closed, not deleted)."""
    from routers.rdp import _bg_disconnect_guacamole, _end_rdp_connection

    redis_client = get_redis()
    assigned = db.exec(select(RDPResource).where(RDPResource.assigned_worker_id == worker_id)).all()
    open_allocs = db.exec(
        select(Allocation).where(
            Allocation.worker_id == worker_id,
            Allocation.released_at.is_(None),
        )
    ).all()
    resource_ids = {r.id for r in assigned}
    for alloc in open_allocs:
        resource_ids.add(alloc.rdp_resource_id)

    for rid in resource_ids:
        resource = db.get(RDPResource, rid)
        if not resource:
            continue
        try:
            result = _end_rdp_connection(
                db,
                resource,
                redis_client,
                worker_id=worker_id,
                require_owner=False,
                release_reason=ReleaseReasonEnum.force_released,
                initiated_by="admin",
            )
            guac_id = result.get("guacamole_connection_id") or resource.guacamole_connection_id
            if guac_id:
                try:
                    _bg_disconnect_guacamole(str(guac_id))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Guacamole disconnect after account delete failed: %s", exc)
        except Exception as exc:  # noqa: BLE001
            logger.warning("RDP release during account delete failed for %s: %s", rid, exc)
            db.rollback()

    now = _utc_now()
    still_open = db.exec(
        select(WorkSession).where(
            WorkSession.worker_id == worker_id,
            WorkSession.end_time.is_(None),
        )
    ).all()
    for session in still_open:
        session.end_time = now
        if session.start_time:
            start = session.start_time
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            session.duration_minutes = max(0, int((now - start).total_seconds() // 60))
        session.close_status = SessionCloseEnum.force_released
        db.add(session)
    db.flush()


def delete_login_account(
    db: Session,
    uid: str,
    *,
    actor_uid: str,
    actor_role: str,
    bypass_protection: bool = False,
) -> dict:
    """Delete the person so they can never sign in. Keep session history.

    bypass_protection is for the founder-removal script only. The HTTP API
    must never set it.
    """
    if not bypass_protection:
        try:
            assert_can_mutate_account(
                db,
                actor_uid=actor_uid,
                actor_role=actor_role,
                target_uid=uid,
                action="delete",
            )
        except AccountGuardError:
            raise

        if uid == actor_uid:
            raise ValueError("You cannot delete your own account.")

    try:
        target = get_auth_user(uid)
    except Exception:
        target = {}
    target_role = (target.get("app_metadata") or {}).get("role", "user") if target else "user"

    if actor_role != "super_admin" and target_role in {"super_admin", "executive"}:
        raise PermissionError("You cannot delete a leadership account.")

    if target_role == "super_admin":
        remaining = [
            u
            for u in list_auth_users()
            if u.get("role") == "super_admin"
            and u.get("status") != "pending"
            and u.get("uid") != uid
        ]
        if not remaining:
            raise ValueError("Cannot delete the last Super Admin account.")

    admin = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    worker = None
    if admin:
        worker = db.exec(select(Worker).where(Worker.admin_user_id == admin.id)).first()
    if worker:
        _release_live_rdp(db, worker.id)
        worker.admin_user_id = None
        db.add(worker)
        db.flush()

    if admin:
        admin.auth_user_id = f"deleted:{admin.id}"
        admin.email = f"deleted.{admin.id}@invalid.local"
        admin.username = None
        admin.status = AccountStatusEnum.deactivated
        db.add(admin)

    db.commit()

    try:
        delete_auth_user(uid)
    except ValueError as exc:
        if " 404:" not in str(exc) and "not found" not in str(exc).lower():
            raise
        logger.info("Supabase user %s already absent", uid)

    return {"ok": True, "deleted": True, "uid": uid}
