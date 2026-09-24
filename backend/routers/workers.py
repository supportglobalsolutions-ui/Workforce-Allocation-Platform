from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field as PydField
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from core.database import get_db
from core.phone_codes import (
    PHONE_UPDATE_MESSAGE,
    PHONE_UPDATE_TITLE,
    normalize_e164,
    phone_needs_country_code_update,
)
from core.supabase_auth import (
    ban_auth_user,
    unban_auth_user,
    get_auth_user,
    list_auth_users,
    merge_user_metadata,
    user_to_dict,
)
from core.auth_errors import http_error_from_auth
from core.permissions import STAFF_ROLES, require_admin, require_user
from models.admin_users import AdminUser
from models.enums import RdpStatusEnum, WorkerTypeEnum
from models.notification import Notification
from models.partner import PartnerEntity
from models.rdp_machine import RDPResource
from models.worker import Worker
from schemas.worker import (
    WorkerAdminUpdate,
    WorkerCreate,
    WorkerResponse,
    WorkerRosterItem,
    WorkerUpdate,
)
from services.admin_otp import (
    PURPOSE_DELETE_WORKERS,
    bulk_delete_target_id,
    issue_otp,
    verify_otp,
)
from services.audit_service import record_audit
from services.email_resend import render_otp_html, render_otp_text
from services.security_risk import (
    BULK_HARD_MAX,
    after_destructive_bulk,
)
from services.worker_public_code import assign_public_code, ensure_public_code
from services.worker_purge import purge_workers
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


class WorkerBulkDeleteRequest(BaseModel):
    worker_ids: list[UUID] = PydField(min_length=1)


class WorkerBulkDeleteConfirm(BaseModel):
    worker_ids: list[UUID] = PydField(min_length=1)
    challenge_id: UUID | None = None
    code: str | None = None


def _normalize_worker_ids(ids: list[UUID]) -> list[UUID]:
    unique = list(dict.fromkeys(ids))
    if not unique:
        raise HTTPException(status_code=400, detail="Select at least one worker.")
    if len(unique) > BULK_HARD_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete more than {BULK_HARD_MAX} workers at once.",
        )
    return unique


def _auth_profile_map() -> dict[str, dict]:
    try:
        return {u["uid"]: u for u in list_auth_users() if u.get("uid")}
    except Exception:
        return {}


def _apply_auth_profile(updates: dict, auth: dict | None) -> None:
    if not auth:
        return
    phone = (auth.get("phone") or "").strip() or None
    residence = (auth.get("residence") or "").strip() or None
    first = (auth.get("firstName") or "").strip() or None
    last = (auth.get("lastName") or "").strip() or None
    if phone:
        updates["phone"] = phone
    if residence:
        updates["residence"] = residence
    if first:
        updates["first_name"] = first
    if last:
        updates["last_name"] = last
    updates["account_banned"] = bool(auth.get("banned"))
    if auth.get("protected"):
        updates["account_protected"] = True
    status_val = auth.get("status")
    if status_val:
        updates["account_status"] = status_val


def _enrich_worker(
    db: Session,
    worker: Worker,
    *,
    auth_by_uid: dict[str, dict] | None = None,
    assign_code: bool = True,
    lite: bool = False,
) -> WorkerResponse:
    """Enrich a worker for API responses.

    lite=True skips Supabase auth lookup, public-code allocation, admin email,
    and RDP join — used by dashboards that only need roster counts / country / status.
    """
    if assign_code and not lite:
        try:
            ensure_public_code(db, worker)
        except Exception:
            # Read paths should still return the profile if allocate fails.
            pass
    resp = WorkerResponse.model_validate(worker)
    updates: dict = {}
    auth_uid: str | None = None
    if not lite:
        admin_row = worker.admin_user
        if admin_row:
            updates["email"] = admin_row.email
            auth_uid = admin_row.auth_user_id
            if admin_row.is_protected:
                updates["account_protected"] = True
        elif worker.admin_user_id:
            admin = db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()
            if admin:
                updates["email"] = admin.email
                auth_uid = admin.auth_user_id
                if admin.is_protected:
                    updates["account_protected"] = True
        if auth_uid:
            auth = None
            if auth_by_uid is not None:
                auth = auth_by_uid.get(auth_uid)
            else:
                try:
                    auth = user_to_dict(get_auth_user(auth_uid))
                except Exception:
                    auth = None
            _apply_auth_profile(updates, auth)
    if worker.partner_entity_id:
        entity = worker.partner_entity
        if entity is None and not lite:
            entity = db.exec(
                select(PartnerEntity).where(PartnerEntity.id == worker.partner_entity_id)
            ).first()
        if entity:
            updates["partner_entity_name"] = entity.name
            if not lite:
                updates["partner_entity_is_self"] = entity.is_self
    if not lite:
        rdp = db.exec(
            select(RDPResource).where(RDPResource.assigned_worker_id == worker.id)
        ).first()
        if rdp:
            updates["assigned_rdp_id"] = rdp.id
            updates["assigned_rdp_nickname"] = rdp.nickname
    if updates:
        resp = resp.model_copy(update=updates)
    return resp


def _sync_auth_profile_fields(
    db: Session,
    worker: Worker,
    *,
    phone: str | None = None,
    residence: str | None = None,
    country: str | None = None,
) -> None:
    """Write phone/residence/country into Supabase user_metadata when linked."""
    meta: dict = {}
    if phone is not None:
        meta["phone"] = phone
    if residence is not None:
        meta["residence"] = residence
    if country is not None:
        meta["country"] = country
    if not meta:
        return
    admin = worker.admin_user
    if admin is None and worker.admin_user_id:
        admin = db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()
    if not admin or not admin.auth_user_id:
        return
    try:
        merge_user_metadata(admin.auth_user_id, meta)
    except Exception:
        # Profile fields still saved on worker where applicable; metadata sync is best-effort.
        pass


def _assign_rdp(db: Session, worker_id: UUID, rdp_id: UUID | None) -> None:
    """Set or clear the worker's assigned RDP machine."""
    current = db.exec(
        select(RDPResource).where(RDPResource.assigned_worker_id == worker_id)
    ).all()
    for resource in current:
        if rdp_id is not None and resource.id == rdp_id:
            continue
        resource.assigned_worker_id = None
        if resource.status == RdpStatusEnum.assigned:
            resource.status = RdpStatusEnum.online_free
        db.add(resource)

    if rdp_id is None:
        return

    resource = db.exec(select(RDPResource).where(RDPResource.id == rdp_id)).first()
    if not resource:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="RDP machine not found")
    # Unassign from previous worker if any
    if resource.assigned_worker_id and resource.assigned_worker_id != worker_id:
        resource.assigned_worker_id = None
    resource.assigned_worker_id = worker_id
    if resource.status in {RdpStatusEnum.online_free, RdpStatusEnum.assigned}:
        resource.status = RdpStatusEnum.assigned
    db.add(resource)


@router.get("/me", response_model=WorkerResponse)
def get_my_worker(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return _enrich_worker(db, worker)


@router.patch("/me", response_model=WorkerResponse)
def update_my_worker(
    body: WorkerUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    payload = body.model_dump(exclude_unset=True)
    phone_raw = payload.pop("phone", None)
    residence_raw = payload.pop("residence", None)
    phone_norm: str | None = None
    if phone_raw is not None:
        try:
            phone_norm = normalize_e164(phone_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    # phone/residence live in auth metadata; mobile-money name/provider on workers
    apply_update(
        worker,
        WorkerUpdate(
            **{
                k: v
                for k, v in payload.items()
                if k in {
                    "username",
                    "display_name",
                    "country",
                    "mobile_money_name",
                    "mobile_money_provider",
                }
            }
        ),
    )
    db.add(worker)
    db.commit()
    db.refresh(worker)
    _sync_auth_profile_fields(
        db,
        worker,
        phone=phone_norm,
        residence=(residence_raw.strip() if isinstance(residence_raw, str) else None),
        country=payload.get("country"),
    )
    return _enrich_worker(db, worker)


@router.get("", response_model=list[WorkerResponse])
def list_workers(
    lite: bool = Query(
        False,
        description="Skip Auth enrich / public-code / RDP — fast roster for dashboards",
    ),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if lite:
        # Partner name only — skip admin_user selectinload (CEO roster does not need email).
        workers = db.exec(
            select(Worker)
            .options(selectinload(Worker.partner_entity))
            .order_by(Worker.display_name)
        ).all()
        return [
            _enrich_worker(db, w, assign_code=False, lite=True) for w in workers
        ]
    workers = db.exec(
        select(Worker)
        .options(selectinload(Worker.admin_user), selectinload(Worker.partner_entity))
        .order_by(Worker.display_name)
    ).all()
    # One Auth Admin listUsers pass for the whole roster (avoids N get_user_by_id).
    # Do not allocate public codes on list (per-row commits); assign on get/create.
    auth_map = _auth_profile_map()
    return [
        _enrich_worker(db, w, auth_by_uid=auth_map, assign_code=False) for w in workers
    ]


@router.get("/roster", response_model=list[WorkerRosterItem])
def list_worker_roster(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Lean roster for CEO / ops dashboards — one JOIN, no Auth or RDP enrich."""
    rows = db.exec(
        select(
            Worker.id,
            Worker.status,
            Worker.country,
            Worker.partner_entity_id,
            PartnerEntity.name,
        )
        .outerjoin(PartnerEntity, PartnerEntity.id == Worker.partner_entity_id)
        .order_by(Worker.display_name)
    ).all()
    return [
        WorkerRosterItem(
            id=row[0],
            status=row[1],
            country=row[2],
            partner_entity_id=row[3],
            partner_entity_name=row[4],
        )
        for row in rows
    ]


@router.post("/phone-format-nudge")
def nudge_phone_format(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Send in-app notifications to workers whose phone lacks a valid country code."""
    sender = get_admin_user(db, current_user)
    workers = db.exec(
        select(Worker).options(selectinload(Worker.admin_user)).order_by(Worker.display_name)
    ).all()
    auth_map = _auth_profile_map()

    existing = db.exec(
        select(Notification).where(
            Notification.title == PHONE_UPDATE_TITLE,
            Notification.is_read == False,  # noqa: E712
            Notification.target_type == "specific",
        )
    ).all()
    already: set[UUID] = {n.target_worker_id for n in existing if n.target_worker_id}

    created = 0
    skipped_ok = 0
    skipped_dup = 0
    for worker in workers:
        auth_uid = None
        if worker.admin_user:
            auth_uid = worker.admin_user.auth_user_id
        elif worker.admin_user_id:
            admin = db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()
            auth_uid = admin.auth_user_id if admin else None
        phone = (auth_map.get(auth_uid or "") or {}).get("phone") or ""
        if not phone_needs_country_code_update(phone):
            skipped_ok += 1
            continue
        if worker.id in already:
            skipped_dup += 1
            continue
        db.add(
            Notification(
                sender_admin_id=sender.id,
                title=PHONE_UPDATE_TITLE,
                message=PHONE_UPDATE_MESSAGE,
                category="general",
                target_type="specific",
                target_worker_id=worker.id,
            )
        )
        created += 1
    if created:
        db.commit()
    return {
        "notified": created,
        "already_valid": skipped_ok,
        "already_notified": skipped_dup,
    }


# ── Bulk delete (registered before /{worker_id}) ────────────────────────────────

@router.post("/delete/request-otp")
def request_workers_delete_otp(
    body: WorkerBulkDeleteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    ids = _normalize_worker_ids(body.worker_ids)
    admin = get_admin_user(db, current_user)
    target = bulk_delete_target_id(PURPOSE_DELETE_WORKERS, ids)
    count_label = "1 worker" if len(ids) == 1 else f"{len(ids)} workers"
    html = render_otp_html(
        title="Confirm worker deletion",
        intro=(
            f"An administrator asked to permanently delete <strong>{count_label}</strong>. "
            "Enter this code in the platform to continue."
        ),
        warning="This cannot be undone. Sessions, wallets, and payslip rows for these workers will be removed.",
    )
    text = render_otp_text(
        title="Confirm worker deletion",
        intro=f"An administrator asked to permanently delete {count_label}.",
        warning="This cannot be undone.",
    )
    payload = issue_otp(
        db,
        purpose=PURPOSE_DELETE_WORKERS,
        target_id=target,
        subject=f"Confirmation code — delete {count_label}",
        html=html,
        text=text,
        admin=admin,
    )
    payload["count"] = len(ids)
    return payload


@router.post("/delete/confirm")
def confirm_workers_delete(
    body: WorkerBulkDeleteConfirm,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    ids = _normalize_worker_ids(body.worker_ids)
    admin = get_admin_user(db, current_user)

    # Always require emailed OTP — even for a single worker — so a stolen
    # admin session cannot wipe people without mailbox access.
    if not body.challenge_id or not body.code:
        raise HTTPException(
            status_code=400,
            detail="A confirmation code emailed to the alert inbox is required to delete workers.",
        )
    verify_otp(
        db,
        challenge_id=body.challenge_id,
        purpose=PURPOSE_DELETE_WORKERS,
        target_id=bulk_delete_target_id(PURPOSE_DELETE_WORKERS, ids),
        code=body.code,
    )

    result = purge_workers(db, ids)
    deleted_ids = [UUID(row["id"]) for row in result["deleted"]]

    record_audit(
        db,
        actor_id=admin.id,
        action="workers.bulk_deleted",
        target_type="worker",
        target_id=admin.id,
        previous_value={"workers": result["deleted"]},
        reason_note=f"Deleted {result['deleted_count']} worker(s)",
    )
    after_destructive_bulk(
        db,
        admin_user_id=admin.id,
        admin_email=admin.email,
        kind="workers",
        count=result["deleted_count"],
        ids=deleted_ids,
    )
    db.commit()
    return result


@router.get("/{worker_id}", response_model=WorkerResponse)
def get_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    if current_user.get("role") in STAFF_ROLES:
        worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    else:
        worker = get_worker_for_user(db, current_user)
        if worker.id != worker_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your worker profile")

    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")
    return _enrich_worker(db, worker)


@router.post("", response_model=WorkerResponse, status_code=status.HTTP_201_CREATED)
def create_worker(
    body: WorkerCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    worker = Worker(**body.model_dump())
    db.add(worker)
    db.flush()
    assign_public_code(db, worker)
    db.commit()
    db.refresh(worker)
    return _enrich_worker(db, worker)


@router.patch("/{worker_id}", response_model=WorkerResponse)
def update_worker(
    worker_id: UUID,
    body: WorkerAdminUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin: personal details, payment, designation, readiness, and RDP assignment."""
    worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")

    data = body.model_dump(exclude_unset=True)
    assigned_rdp_id = data.pop("assigned_rdp_id", ...)
    phone_raw = data.pop("phone", None)
    residence_raw = data.pop("residence", None)
    phone_norm: str | None = None
    if phone_raw is not None:
        try:
            phone_norm = normalize_e164(phone_raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    for key, value in data.items():
        setattr(worker, key, value)

    if worker.worker_type == WorkerTypeEnum.partner_worker and not worker.partner_entity_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A partner worker must be linked to a partner company (or Self).",
        )
    if worker.worker_type == WorkerTypeEnum.gs_registered:
        worker.partner_entity_id = None

    if assigned_rdp_id is not ...:
        _assign_rdp(db, worker.id, assigned_rdp_id)

    db.add(worker)
    db.commit()
    db.refresh(worker)
    _sync_auth_profile_fields(
        db,
        worker,
        phone=phone_norm,
        residence=(residence_raw.strip() if isinstance(residence_raw, str) else None),
        country=data.get("country"),
    )
    return _enrich_worker(db, worker)

def _get_worker_auth_user_id(worker_id: UUID, db: Session, current_user: dict) -> tuple[Worker, str]:
    """Fetch worker + linked auth_user_id, enforce admin-cannot-modify-super_admin."""
    worker = db.exec(select(Worker).where(Worker.id == worker_id)).first()
    if not worker:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Worker not found")

    if not worker.admin_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This worker does not have a linked system account.",
        )

    admin_user = db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()
    if not admin_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Linked system account not found.",
        )

    try:
        auth_user = get_auth_user(admin_user.auth_user_id)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (auth_user.custom_claims or {}).get("role", "user")
    if current_user.get("role") == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify Super Admin accounts.",
        )

    return worker, admin_user.auth_user_id


@router.patch("/{worker_id}/ban")
def ban_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Ban a worker's account — prevents login."""
    _, auth_user_id = _get_worker_auth_user_id(worker_id, db, current_user)
    try:
        ban_auth_user(auth_user_id)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return {"banned": True}


@router.patch("/{worker_id}/unban")
def unban_worker(
    worker_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Unban a worker's account — restores login access."""
    _, auth_user_id = _get_worker_auth_user_id(worker_id, db, current_user)
    try:
        unban_auth_user(auth_user_id)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return {"banned": False}
