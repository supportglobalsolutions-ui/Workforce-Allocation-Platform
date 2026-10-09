"""Turn raw audit rows into human-readable activity lines."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from models.admin_users import AdminUser
from models.audit_log import AuditLog
from models.rdp_machine import RDPResource
from models.worker import Worker

# Short labels for the Action column.
ACTION_LABELS: dict[str, str] = {
    "rdp.logged_in": "Logged in to desktop",
    "rdp.logged_out": "Logged out of desktop",
    "rdp.deleted": "Deleted desktop",
    "rdp.machine_held": "Held desktop for review",
    "rdp.quarantined": "Quarantined desktop",
    "rdp.machine_hold_cleared": "Cleared desktop hold",
    "rdp.quarantine_repaired": "Repaired quarantine",
    "rdp.orphan_killed": "Ended orphaned session",
    "training.module_deleted": "Deleted training module",
    "workers.bulk_deleted": "Deleted workers",
    "sessions.bulk_deleted": "Deleted sessions",
    "payroll_period.deleted": "Deleted payroll period",
    "wallets.payroll_sent": "Sent pay to wallets",
    "settings.alert_email_changed": "Changed alert email",
    "security.risk_threshold_exceeded": "Security risk alert",
    "test_mode.prepared": "Turned on test mode",
    "test_mode.cleared": "Cleared test data",
    "shifts.edit_request_approved": "Approved shift change",
    "shifts.edit_request_rejected": "Rejected shift change",
    "shifts.delete_request_approved": "Approved shift delete",
    "shifts.delete_request_rejected": "Rejected shift delete",
    "hours_log.entry_set": "Edited logged hours",
    "hours_log.entry_reset": "Reset logged hours",
    "hours_log.entry_deleted": "Removed logged hours",
    "hours_log.imported": "Imported hours",
    "client_billing.updated": "Edited client billing",
    "client_payout.sent": "Sent client statement",
    "client_payout.paid": "Marked client paid",
    "client_payout.unpaid": "Undid client payment",
    "client_payout.rate_set": "Set client payout rate",
    "client_payout.prepared": "Prepared client payouts",
}

TARGET_TYPE_LABELS: dict[str, str] = {
    "rdp_access": "Desktop",
    "rdp_resource": "Desktop",
    "training_module": "Training module",
    "worker": "Worker",
    "session": "Session",
    "payroll_period": "Payroll period",
    "admin_user": "Admin",
    "settings": "Settings",
    "shift": "Shift",
    "hours_log": "Hours Log",
    "client": "Client",
    "client_payout": "Client payout",
}


def action_label(action: str) -> str:
    if action in ACTION_LABELS:
        return ACTION_LABELS[action]
    if action.startswith("security.bulk_") and action.endswith("_delete_alert"):
        kind = action.removeprefix("security.bulk_").removesuffix("_delete_alert")
        return f"Bulk delete alert ({kind.replace('_', ' ')})"
    # Fallback: "rdp.logged_in" → "Rdp logged in"
    parts = action.replace(".", " ").replace("_", " ").strip()
    return parts[:1].upper() + parts[1:] if parts else action


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _pick_str(*values: Any) -> str | None:
    for v in values:
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def resolve_actor_name(
    db: Session,
    entry: AuditLog,
    *,
    admin_by_id: dict[UUID, AdminUser] | None = None,
) -> str:
    payload = {**_as_dict(entry.previous_value), **_as_dict(entry.new_value)}

    # Worker-driven events often have no admin actor_id.
    if entry.actor_id is None:
        worker = _pick_str(payload.get("worker_name"))
        if worker:
            return worker
        return "System"

    admin: AdminUser | None = None
    if admin_by_id is not None:
        admin = admin_by_id.get(entry.actor_id)
    else:
        admin = db.get(AdminUser, entry.actor_id)

    if admin:
        return admin.display_name or admin.email or "Admin"

    # Some older rows may have stored auth uid; try that.
    admin = db.exec(
        select(AdminUser).where(AdminUser.auth_user_id == str(entry.actor_id))
    ).first()
    if admin:
        return admin.display_name or admin.email or "Admin"

    return "Unknown user"


def resolve_target_label(
    db: Session,
    entry: AuditLog,
    *,
    rdp_by_id: dict[UUID, RDPResource] | None = None,
) -> str:
    payload = {**_as_dict(entry.previous_value), **_as_dict(entry.new_value)}
    type_label = TARGET_TYPE_LABELS.get(entry.target_type, entry.target_type.replace("_", " ").title())

    named = _pick_str(
        payload.get("rdp_nickname"),
        payload.get("title"),
        payload.get("nickname"),
        payload.get("worker_name"),
        payload.get("label"),
        payload.get("name"),
        payload.get("email"),
    )
    if named:
        if entry.target_type in {"rdp_access", "rdp_resource"}:
            return named
        return f"{type_label}: {named}"

    if entry.target_type in {"rdp_access", "rdp_resource"}:
        resource = None
        if rdp_by_id is not None:
            resource = rdp_by_id.get(entry.target_id)
        else:
            resource = db.get(RDPResource, entry.target_id)
        if resource:
            return resource.nickname

    if entry.target_type == "worker":
        worker = db.get(Worker, entry.target_id)
        if worker:
            return worker.display_name

    # Bulk deletes store actor id as target — use reason or count instead.
    if entry.action.endswith("bulk_deleted"):
        count = None
        prev = _as_dict(entry.previous_value)
        if isinstance(prev.get("deleted_count"), int):
            count = prev["deleted_count"]
        elif isinstance(prev.get("workers"), list):
            count = len(prev["workers"])
        if count is not None:
            return f"{count} {entry.target_type}{'s' if count != 1 else ''}"
        if entry.reason_note:
            return entry.reason_note

    return type_label


def build_summary(*, who: str, action: str, target: str, entry: AuditLog) -> str:
    """One plain sentence: who did what."""
    payload = {**_as_dict(entry.previous_value), **_as_dict(entry.new_value)}
    worker = _pick_str(payload.get("worker_name"))
    machine = _pick_str(payload.get("rdp_nickname")) or (
        target if entry.target_type in {"rdp_access", "rdp_resource"} else None
    )

    if action == "rdp.logged_in":
        person = worker or who
        return f"{person} logged in to {machine or 'a desktop'}"

    if action == "rdp.logged_out":
        person = worker or who
        initiated = str(payload.get("initiated_by") or "worker")
        if initiated == "admin" and who not in {person, "System"}:
            return f"{who} logged {person} out of {machine or 'a desktop'}"
        return f"{person} logged out of {machine or 'a desktop'}"

    if action == "rdp.deleted":
        return f"{who} deleted desktop {target}"

    if action == "training.module_deleted":
        title = _pick_str(_as_dict(entry.previous_value).get("title")) or target
        return f'{who} deleted training module "{title}"'

    if action == "workers.bulk_deleted":
        return f"{who} deleted {target}"

    if action == "sessions.bulk_deleted":
        return f"{who} deleted {target}"

    if action == "payroll_period.deleted":
        return f"{who} deleted payroll period {target}"

    if action == "settings.alert_email_changed":
        return f"{who} changed the alert email"

    if action == "rdp.orphan_killed":
        return f"System ended an orphaned session on {machine or target}"

    if action.startswith("rdp."):
        return f"{who} — {action_label(action)} ({target})"

    if entry.reason_note and len(entry.reason_note) <= 120:
        return f"{who}: {entry.reason_note}"

    return f"{who} — {action_label(action)} · {target}"


def present_audit_entry(
    db: Session,
    entry: AuditLog,
    *,
    admin_by_id: dict[UUID, AdminUser] | None = None,
    rdp_by_id: dict[UUID, RDPResource] | None = None,
) -> dict[str, Any]:
    who = resolve_actor_name(db, entry, admin_by_id=admin_by_id)
    target = resolve_target_label(db, entry, rdp_by_id=rdp_by_id)
    label = action_label(entry.action)
    summary = build_summary(who=who, action=entry.action, target=target, entry=entry)
    return {
        "id": entry.id,
        "actor_id": entry.actor_id,
        "actor_name": who,
        "action": entry.action,
        "action_label": label,
        "target_type": entry.target_type,
        "target_id": entry.target_id,
        "target_label": target,
        "summary": summary,
        "previous_value": entry.previous_value,
        "new_value": entry.new_value,
        "reason_note": entry.reason_note,
        "ip_address": entry.ip_address,
        "created_at": entry.created_at,
    }


def present_audit_entries(db: Session, entries: list[AuditLog]) -> list[dict[str, Any]]:
    if not entries:
        return []

    actor_ids = {e.actor_id for e in entries if e.actor_id}
    admins = (
        db.exec(select(AdminUser).where(AdminUser.id.in_(actor_ids))).all()
        if actor_ids
        else []
    )
    admin_by_id = {a.id: a for a in admins}

    rdp_ids = {
        e.target_id
        for e in entries
        if e.target_type in {"rdp_access", "rdp_resource"}
    }
    machines = (
        db.exec(select(RDPResource).where(RDPResource.id.in_(rdp_ids))).all()
        if rdp_ids
        else []
    )
    rdp_by_id = {m.id: m for m in machines}

    return [
        present_audit_entry(db, e, admin_by_id=admin_by_id, rdp_by_id=rdp_by_id)
        for e in entries
    ]
