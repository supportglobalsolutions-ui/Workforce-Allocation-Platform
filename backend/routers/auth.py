import re
from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlmodel import Session, select

from core.auth_errors import http_error_from_auth
from core.config import settings
from core.database import get_db
from core.supabase_auth import (
    SUPER_ADMIN_EMAIL,
    approve_auth_user,
    ban_auth_user,
    bootstrap_super_admin,
    create_auth_user,
    delete_auth_user,
    get_auth_user,
    get_auth_user_by_email,
    list_auth_users,
    register_pending_user,
    set_user_role,
    send_password_recovery_email,
    update_auth_user_password,
    unban_auth_user,
    user_to_dict,
    verify_supabase_token,
)
from core.permissions import ROLE_CAN_ASSIGN, require_admin, require_super_admin
from core.rate_limit import check_rate_limit, current_rate_count
from core.session_cookie import sign_session
from models.admin_users import AdminUser
from models.enums import (
    AccountStatusEnum,
    AdminRoleEnum,
    EntityStatusEnum,
    WorkerStatusEnum,
    WorkerTypeEnum,
)
from models.partner import PartnerEntity
from models.worker import Worker
from .deps import get_admin_user
from core.security import get_current_user
from services.account_invite import deliver_account_invite, generate_placeholder_password
from services.usernames import (
    UsernameError,
    assert_username_available,
    email_for_identifier,
    normalize_username,
)
from services.login_otp import (
    OTP_RESEND_LIMIT,
    OTP_RESEND_WINDOW_SECONDS,
    clear_login_mfa,
    deliver_login_otp_email,
    has_login_mfa,
    issue_login_otp,
    login_otp_required,
    verify_login_otp,
)
from services.email_resend import send_account_approved_email
from services.signup_otp import (
    OTP_RESEND_LIMIT as SIGNUP_OTP_RESEND_LIMIT,
    assert_signup_proof,
    consume_signup_proof,
    deliver_signup_otp_email,
    issue_signup_otp,
    verify_signup_otp,
)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    email: EmailStr
    # Omit when sendInvite is true — the invitee sets their own password.
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)
    displayName: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=32)
    role: str  # "user" | "partner" | "admin" | "executive" | "super_admin"
    partnerEntityId: Optional[UUID] = None
    sendInvite: bool = False


class ResolveIdentifierRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=255)


class UpdateRoleRequest(BaseModel):
    role: str
    partnerEntityId: Optional[UUID] = None


_NAME_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ '\-]){1,39}$", re.UNICODE)
_COUNTRY_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|[ .,'()\-]){1,55}$", re.UNICODE)
_RESIDENCE_RE = re.compile(r"^[^\W\d_](?:[^\W\d_]|[0-9 .,'\-]){1,79}$", re.UNICODE)
_USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{2,31}$")
_PHONE_RE = re.compile(r"^\+?[0-9]{8,15}$")


class RegisterRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: str = Field(min_length=8, max_length=10)
    firstName: str = Field(min_length=2, max_length=40)
    lastName: str = Field(min_length=2, max_length=40)
    phone: str = Field(min_length=8, max_length=16)
    country: str = Field(min_length=2, max_length=56)
    residence: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=32)
    verificationToken: str = Field(min_length=20, max_length=256)

    @field_validator("firstName", "lastName", mode="before")
    @classmethod
    def clean_name(cls, value: object) -> str:
        text = " ".join(str(value or "").split())
        if not _NAME_RE.match(text):
            raise ValueError("Use 2–40 letters. Spaces, hyphens, and apostrophes are allowed.")
        return text

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, value: object) -> str:
        compact = re.sub(r"[\s\-().]", "", str(value or "").strip())
        if not _PHONE_RE.match(compact):
            raise ValueError("Use 8–15 digits. A leading + is allowed. Letters are not allowed.")
        return compact

    @field_validator("country", mode="before")
    @classmethod
    def clean_country(cls, value: object) -> str:
        text = " ".join(str(value or "").split())
        if not _COUNTRY_RE.match(text):
            raise ValueError("Select a country from the list.")
        return text

    @field_validator("residence", mode="before")
    @classmethod
    def clean_residence(cls, value: object) -> str:
        text = " ".join(str(value or "").split())
        if not _RESIDENCE_RE.match(text):
            raise ValueError("Use 2–80 letters or numbers for city or town.")
        return text

    @field_validator("username", mode="before")
    @classmethod
    def clean_username(cls, value: object) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Username is required.")
        if not _USERNAME_RE.match(text):
            raise ValueError(
                "Username must be 3–32 characters, start with a letter, and use only letters, numbers, and underscores."
            )
        return text.lower()

    @field_validator("password")
    @classmethod
    def clean_password(cls, value: str) -> str:
        broken: list[str] = []
        if not 8 <= len(value) <= 10:
            broken.append("use 8 to 10 characters")
        if not re.search(r"[A-Z]", value):
            broken.append("include 1 capital letter")
        if not re.search(r"\d", value):
            broken.append("include 1 number")
        if not re.search(r"[^A-Za-z0-9]", value):
            broken.append("include 1 special character")
        if broken:
            raise ValueError("Password must " + ", ".join(broken) + ".")
        return value


class SessionTokenRequest(BaseModel):
    id_token: str = Field(min_length=20, max_length=8192)


class ApproveUserRequest(BaseModel):
    """Approval decision: designate the account as GS Member or Partner worker."""
    worker_type: Optional[str] = None        # "gs_registered" | "partner_worker"
    partner_entity_id: Optional[UUID] = None
    country: Optional[str] = None


class LoginOtpVerifyRequest(BaseModel):
    challenge_id: UUID
    code: str = Field(min_length=6, max_length=8, pattern=r"^\d+$")


class LoginOtpChallengeRequest(BaseModel):
    resend: bool = False


class SignupOtpChallengeRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    resend: bool = False


class SignupOtpVerifyRequest(BaseModel):
    email: EmailStr = Field(max_length=254)
    code: str = Field(min_length=6, max_length=8, pattern=r"^\d+$")


class LoginAttemptRequest(BaseModel):
    email: EmailStr


class PasswordRecoveryRequest(BaseModel):
    # Either a username or an email — whichever the person remembers.
    identifier: Optional[str] = Field(default=None, min_length=1, max_length=255)
    email: Optional[EmailStr] = None


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=12, max_length=128)


def _validate_optional_partner_entity(db: Session, role: str, entity_id: Optional[UUID]) -> Optional[str]:
    """Return partner_entity_id string for claims, or None. Raises HTTPException if invalid."""
    if role != "partner":
        return None
    if entity_id is None:
        return None
    if not db.get(PartnerEntity, entity_id):
        raise HTTPException(status_code=404, detail="Partner company not found.")
    return str(entity_id)


def _ensure_partner_entity_id(
    db: Session,
    *,
    display_name: str,
    entity_id: Optional[str],
) -> str:
    """Require a partner company id; create a Self company from the display name if missing."""
    if entity_id:
        return entity_id
    name = (display_name or "Partner").strip() or "Partner"
    existing = db.exec(select(PartnerEntity).where(PartnerEntity.name == name)).first()
    if existing:
        return str(existing.id)
    entity = PartnerEntity(name=name, status=EntityStatusEnum.active, is_self=True)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return str(entity.id)


def _store_account_username(
    db: Session,
    *,
    uid: str,
    email: str,
    display_name: str,
    username: str,
) -> None:
    """
    Persist the sign-in username on the account row, creating the row when the
    account has no local profile yet (staff accounts get one lazily).
    """
    if not uid or not username:
        return
    row = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    if not row:
        row = AdminUser(
            auth_user_id=uid,
            email=email or f"{uid}@unknown.local",
            role=AdminRoleEnum.technical_admin,
            display_name=display_name or (email or "").split("@")[0] or "Account",
            status=AccountStatusEnum.active,
        )
        db.add(row)
    row.username = username
    db.add(row)

    # Keep the worker profile's username in step so either table resolves.
    worker = db.exec(select(Worker).where(Worker.admin_user_id == row.id)).first()
    if worker is not None:
        worker.username = username
        db.add(worker)
    db.commit()


def _ensure_login_profile(
    db: Session,
    *,
    uid: str,
    email: str,
    display_name: str,
    as_partner: bool = False,
    partner_entity_id: str | None = None,
) -> Worker:
    """Ensure admin_users + workers rows exist so partner/worker can use worker APIs / inbox."""
    from uuid import UUID as UUIDType

    admin_row = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    if not admin_row:
        admin_row = AdminUser(
            auth_user_id=uid,
            email=email or f"{uid}@unknown.local",
            role=AdminRoleEnum.technical_admin,
            display_name=display_name or (email or "").split("@")[0] or "Partner",
            status=AccountStatusEnum.active,
        )
        db.add(admin_row)
        db.commit()
        db.refresh(admin_row)

    worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_row.id)).first()
    entity_uuid = UUIDType(partner_entity_id) if partner_entity_id else None

    if not worker:
        worker = Worker(
            admin_user_id=admin_row.id,
            worker_type=WorkerTypeEnum.partner_worker if as_partner else WorkerTypeEnum.gs_registered,
            partner_entity_id=entity_uuid if as_partner else None,
            display_name=admin_row.display_name,
            country="Unassigned",
            pay_tier="unassigned",
            status=WorkerStatusEnum.active,
            start_date=date.today(),
            work_ready=False,
        )
        db.add(worker)
        db.commit()
        db.refresh(worker)
    elif as_partner:
        worker.worker_type = WorkerTypeEnum.partner_worker
        if entity_uuid:
            worker.partner_entity_id = entity_uuid
        if not worker.partner_entity_id:
            raise HTTPException(
                status_code=400,
                detail="Partner accounts require a company link (use Self if independent).",
            )
        db.add(worker)
        db.commit()
        db.refresh(worker)
    return worker


FAILED_LOGIN_LIMIT = 10
FAILED_LOGIN_WINDOW_SECONDS = 900
FAILED_LOGIN_DETAIL = (
    "Too many failed sign-in attempts (10). Try again in about 15 minutes."
)
OTP_RESEND_DETAIL = (
    "You can resend the verification code 5 times per hour. Try again later."
)


def _queue_otp_email(background_tasks: BackgroundTasks, payload: dict, *, signup: bool) -> dict:
    delivery = payload.pop("_delivery", None)
    if delivery:
        if signup:
            background_tasks.add_task(deliver_signup_otp_email, **delivery)
        else:
            background_tasks.add_task(deliver_login_otp_email, **delivery)
    return payload

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(
    body: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Public self-registration. Requires a code sent to the email first.
    Creates a banned Supabase user pending admin approval.
    """
    email = body.email.strip().lower()
    first = body.firstName.strip()
    last = body.lastName.strip()
    try:
        username = assert_username_available(db, body.username or "")
    except UsernameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    check_rate_limit(request, scope="auth-register", limit=5, window_seconds=3600, key_suffix=email)
    check_rate_limit(request, scope="auth-register-ip", limit=20, window_seconds=3600)
    assert_signup_proof(email, body.verificationToken)
    if not 8 <= len(body.password) <= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be 8 to 10 characters.",
        )
    try:
        user = register_pending_user(
            email=body.email,
            password=body.password,
            display_name=f"{first} {last}".strip(),
            first_name=first,
            last_name=last,
            phone=body.phone.strip(),
            country=body.country.strip(),
            residence=body.residence.strip(),
            username=username,
        )
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    consume_signup_proof(email, body.verificationToken)
    _store_account_username(
        db,
        uid=user.get("id", ""),
        email=user.get("email") or email,
        display_name=f"{first} {last}".strip(),
        username=username,
    )
    return user_to_dict(user)


@router.get("/register-countries")
def register_countries(db: Session = Depends(get_db)):
    """Public country list for the signup form."""
    from models.currency import Country

    rows = db.exec(select(Country).where(Country.is_active == True).order_by(Country.name)).all()  # noqa: E712
    return [{"id": str(row.id), "name": row.name} for row in rows]


@router.post("/register-otp/challenge")
def register_otp_challenge(
    body: SignupOtpChallengeRequest,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Send a code before a worker account exists. Resend is limited to 5 per hour."""
    email = body.email.strip().lower()
    try:
        existing = get_auth_user_by_email(email)
    except Exception:
        existing = None
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    resends_remaining = SIGNUP_OTP_RESEND_LIMIT
    if body.resend:
        used = check_rate_limit(
            request,
            scope="signup-otp-resend",
            limit=SIGNUP_OTP_RESEND_LIMIT,
            window_seconds=OTP_RESEND_WINDOW_SECONDS,
            key_suffix=email,
            detail=OTP_RESEND_DETAIL,
        )
        resends_remaining = max(SIGNUP_OTP_RESEND_LIMIT - used, 0)
    else:
        # Allow a few fresh starts, but don't treat them as resends.
        check_rate_limit(
            request,
            scope="signup-otp-start",
            limit=8,
            window_seconds=OTP_RESEND_WINDOW_SECONDS,
            key_suffix=email,
            detail="Too many verification emails for this address. Try again in about an hour.",
        )
        used = current_rate_count(
            request,
            scope="signup-otp-resend",
            key_suffix=email,
        )
        resends_remaining = max(SIGNUP_OTP_RESEND_LIMIT - used, 0)

    return _queue_otp_email(
        background_tasks,
        issue_signup_otp(email, resends_remaining=resends_remaining),
        signup=True,
    )


@router.post("/register-otp/verify")
def register_otp_verify(body: SignupOtpVerifyRequest, request: Request):
    """Confirm the signup code and return a one-time token for account creation."""
    email = body.email.strip().lower()
    check_rate_limit(
        request,
        scope="signup-otp-verify",
        limit=10,
        window_seconds=900,
        key_suffix=email,
        detail="Too many incorrect codes. Try again in about 15 minutes.",
    )
    return verify_signup_otp(email, body.code)


_ORG_ROLE_TO_AUTH_ROLE = {
    AdminRoleEnum.ceo_leadership: "super_admin",
    AdminRoleEnum.operations_lead: "admin",
}


def _list_postgres_users(db: Session) -> list[dict]:
    """Project local account rows into the shape expected by the Accounts page."""
    users: list[dict] = []
    admin_rows = db.exec(select(AdminUser).order_by(AdminUser.display_name)).all()

    for admin in admin_rows:
        worker = db.exec(
            select(Worker).where(Worker.admin_user_id == admin.id)
        ).first()
        role = _ORG_ROLE_TO_AUTH_ROLE.get(admin.role)
        if role is None:
            role = (
                "partner"
                if worker and worker.worker_type == WorkerTypeEnum.partner_worker
                else "user"
            )

        disabled = admin.status == AccountStatusEnum.deactivated
        created_at_ms = (
            int(admin.created_at.timestamp() * 1000)
            if admin.created_at
            else 0
        )
        users.append({
            "uid": admin.auth_user_id,
            "email": admin.email,
            "displayName": admin.display_name,
            "role": role,
            "status": "banned" if disabled else "approved",
            "disabled": disabled,
            "banned": disabled,
            "createdAt": created_at_ms,
            "partnerEntityId": (
                str(worker.partner_entity_id)
                if worker and worker.partner_entity_id
                else None
            ),
        })

    return users


@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """List accounts from Supabase Auth."""
    return list_auth_users()


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Create a new Supabase user with a role in app_metadata.
    - admin       : can create worker, partner, or operations lead
    - super_admin : can create any role including executive

    With sendInvite the admin sets no password: the account is created with an
    unguessable placeholder and the invitee receives a one-time link to choose
    their own credential.
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot create accounts with role '{body.role}'.",
        )

    if not body.sendInvite and not body.password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide a password, or enable sendInvite to email a setup link.",
        )
    password = body.password or generate_placeholder_password()

    try:
        username = assert_username_available(db, body.username)
    except UsernameError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    partner_entity_id = _validate_optional_partner_entity(db, body.role, body.partnerEntityId)
    if body.role == "partner":
        partner_entity_id = _ensure_partner_entity_id(
            db,
            display_name=body.displayName,
            entity_id=partner_entity_id,
        )

    try:
        user = create_auth_user(
            email=body.email,
            password=password,
            display_name=body.displayName,
            role=body.role,
            partner_entity_id=partner_entity_id,
        )
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    _store_account_username(
        db,
        uid=user.get("id", ""),
        email=user.get("email") or str(body.email),
        display_name=body.displayName,
        username=username,
    )

    if body.sendInvite:
        # Queued so a slow mail hop never blocks account creation.
        background_tasks.add_task(
            deliver_account_invite,
            to_email=user.get("email") or str(body.email),
            display_name=body.displayName,
            role=body.role,
        )

    if body.role in {"user", "partner"}:
        _ensure_login_profile(
            db,
            uid=user.get("id", ""),
            email=user.get("email") or body.email,
            display_name=(user.get("user_metadata") or {}).get("full_name") or body.displayName,
            as_partner=body.role == "partner",
            partner_entity_id=partner_entity_id,
        )

    return user_to_dict(user)


@router.post("/users/{uid}/resend-invite")
def resend_account_invite(
    uid: str,
    background_tasks: BackgroundTasks,
    request: Request,
    current_user: dict = Depends(require_admin),
):
    """
    Send a fresh set-your-password link. Invite links are single-use and
    expire, so this is the supported way to recover a lost invitation.
    """
    check_rate_limit(
        request, scope="auth-resend-invite", limit=10, window_seconds=3600, key_suffix=uid
    )
    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    email = target.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account has no email address",
        )

    actor_role = current_user["role"]
    target_role = (target.get("app_metadata") or {}).get("role", "user")
    if actor_role == "admin" and target_role in {"executive", "super_admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot send invites for leadership accounts.",
        )

    display_name = (
        (target.get("user_metadata") or {}).get("full_name")
        or email.split("@")[0]
    )
    background_tasks.add_task(
        deliver_account_invite,
        to_email=email,
        display_name=display_name,
        role=target_role,
    )
    return {"sent_to": email, "sending": True}


@router.patch("/users/{uid}/approve")
def approve_user(
    uid: str,
    background_tasks: BackgroundTasks,
    body: ApproveUserRequest | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Enable a pending account so the user can sign in, and (optionally) provision
    the worker profile as a GS Member or Partner worker in the same step.
    New workers start with work_ready=false until onboarding training is done.
    """
    body = body or ApproveUserRequest()

    worker_type: Optional[WorkerTypeEnum] = None
    if body.worker_type:
        try:
            worker_type = WorkerTypeEnum(body.worker_type)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid worker type.")
        if worker_type == WorkerTypeEnum.partner_worker:
            if not body.partner_entity_id:
                raise HTTPException(
                    status_code=400,
                    detail="Select the partner company for a partner worker.",
                )
            if not db.get(PartnerEntity, body.partner_entity_id):
                raise HTTPException(status_code=404, detail="Partner company not found.")

    try:
        user = approve_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    profile = user_to_dict(user if isinstance(user, dict) else {})
    email = profile.get("email") or f"{uid}@unknown.local"
    display_name = profile.get("displayName") or email.split("@")[0] or "New Worker"

    # Eagerly provision admin_users + workers so the admin can finish the
    # profile immediately instead of waiting for the worker's first login.
    if worker_type is not None:
        admin_row = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
        if not admin_row:
            admin_row = AdminUser(
                auth_user_id=uid,
                email=email,
                role=AdminRoleEnum.technical_admin,
                display_name=display_name,
                status=AccountStatusEnum.active,
            )
            db.add(admin_row)
            db.commit()
            db.refresh(admin_row)

        worker = db.exec(select(Worker).where(Worker.admin_user_id == admin_row.id)).first()
        profile = user_to_dict(user if isinstance(user, dict) else {})
        display_name = profile.get("displayName") or admin_row.display_name
        country_name = body.country or profile.get("country") or "Unassigned"
        username = (profile.get("username") or "").strip().lower() or None
        if username:
            taken = db.exec(select(Worker).where(Worker.username == username)).first()
            if taken and taken.admin_user_id != admin_row.id:
                username = None
        if display_name and admin_row.display_name != display_name:
            admin_row.display_name = display_name
            db.add(admin_row)
        if not worker:
            worker = Worker(
                admin_user_id=admin_row.id,
                worker_type=worker_type,
                partner_entity_id=body.partner_entity_id if worker_type == WorkerTypeEnum.partner_worker else None,
                display_name=display_name or "New Worker",
                username=username,
                country=country_name,
                pay_tier="unassigned",
                status=WorkerStatusEnum.active,
                start_date=date.today(),
                work_ready=False,
            )
        else:
            worker.worker_type = worker_type
            worker.partner_entity_id = (
                body.partner_entity_id if worker_type == WorkerTypeEnum.partner_worker else None
            )
            worker.display_name = display_name or worker.display_name
            worker.country = country_name
            if username:
                worker.username = username
        db.add(worker)
        db.commit()

    email = (profile.get("email") or "").strip().lower()
    if "@" in email and not email.endswith("@unknown.local"):
        first = (profile.get("firstName") or "").strip()
        greeting = first or (display_name.strip().split(" ")[0] if display_name.strip() else "there")
        background_tasks.add_task(send_account_approved_email, email, greeting)

    return user_to_dict(user)


@router.patch("/users/{uid}/reject")
def reject_user(
    uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Reject a pending request and delete the account."""
    del current_user
    admin = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    if admin:
        worker = db.exec(select(Worker).where(Worker.admin_user_id == admin.id)).first()
        if worker:
            db.delete(worker)
        db.delete(admin)
        db.commit()
    try:
        delete_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return {"ok": True, "deleted": True}


@router.patch("/users/{uid}/role")
def update_user_role(
    uid: str,
    body: UpdateRoleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Update the role of an existing user (promote/demote).
    - admin       : can set worker, partner, or operations lead (not executive)
    - super_admin : can set any role
    Admins cannot change Executive accounts.
    """
    actor_role = current_user["role"]
    allowed = ROLE_CAN_ASSIGN.get(actor_role, set())

    if body.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role '{actor_role}' cannot assign role '{body.role}'.",
        )

    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.get("app_metadata") or {}).get("role", "user")
    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot change Executive account roles.",
        )

    partner_entity_id = _validate_optional_partner_entity(db, body.role, body.partnerEntityId)
    if body.role == "partner":
        partner_entity_id = _ensure_partner_entity_id(
            db,
            display_name=(target.get("user_metadata") or {}).get("full_name") or (target.get("email") or "").split("@")[0] or "Partner",
            entity_id=partner_entity_id,
        )

    try:
        set_user_role(uid, body.role, partner_entity_id=partner_entity_id)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    if body.role == "partner":
        _ensure_login_profile(
            db,
            uid=uid,
            email=target.get("email") or f"{uid}@unknown.local",
            display_name=(target.get("user_metadata") or {}).get("full_name") or (target.get("email") or "").split("@")[0] or "Partner",
            as_partner=True,
            partner_entity_id=partner_entity_id,
        )

    return user_to_dict(get_auth_user(uid))


@router.post("/resolve-identifier")
def resolve_identifier(
    body: ResolveIdentifierRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Map a username OR email to the address Supabase authenticates against, so
    someone who remembers only one of the two can still sign in.

    Rate-limited, and deliberately vague on failure: a precise "no such user"
    would turn this into a username-enumeration oracle.
    """
    check_rate_limit(request, scope="auth-resolve-ip", limit=30, window_seconds=300)
    identifier = body.identifier.strip()
    check_rate_limit(
        request,
        scope="auth-resolve-id",
        limit=10,
        window_seconds=300,
        key_suffix=identifier.lower()[:120],
    )

    email = email_for_identifier(db, identifier)
    if not email:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account matches that username or email.",
        )
    return {"email": email}


@router.get("/username-available")
def username_available(
    username: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Live availability check for signup and account-creation forms."""
    check_rate_limit(request, scope="auth-username-check", limit=40, window_seconds=300)
    try:
        assert_username_available(db, username)
    except UsernameError as exc:
        return {"available": False, "reason": str(exc), "username": normalize_username(username)}
    return {"available": True, "reason": None, "username": normalize_username(username)}


@router.get("/account-status")
def get_account_status(email: str, request: Request):
    """
    Rate-limited status lookup for the login page when auth returns user-disabled.
    Returns a generic response when the address is not registered to reduce enumeration.
    """
    check_rate_limit(request, scope="auth-account-status", limit=10, window_seconds=60)
    check_rate_limit(
        request,
        scope="auth-account-status-email",
        limit=5,
        window_seconds=300,
        key_suffix=email.lower()[:120],
    )
    try:
        user = get_auth_user_by_email(email)
    except Exception:
        return {"status": "unknown"}
    claims = user.get("app_metadata") or {} if isinstance(user, dict) else {}
    profile = user_to_dict(user) if isinstance(user, dict) else {}
    status = profile.get("status") or claims.get("status") or "unknown"
    return {"status": status}


@router.post("/session-token")
def create_session_token(
    body: SessionTokenRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verify Supabase ID token and return a signed cookie value for Next.js middleware."""
    check_rate_limit(request, scope="auth-session-token", limit=30, window_seconds=60)
    try:
        decoded = verify_supabase_token(body.id_token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    role = decoded.get("role", "user")
    if role not in {"user", "partner", "admin", "executive", "super_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    uid = decoded["uid"]
    admin = db.exec(select(AdminUser).where(AdminUser.auth_user_id == uid)).first()
    # JIT-provision so first login can still evaluate OTP rules.
    if not admin:
        from .deps import get_admin_user as _get_admin

        admin = _get_admin(db, {"uid": uid, "email": decoded.get("email"), "role": role, "name": decoded.get("name")})

    if login_otp_required(admin, role) and not has_login_mfa(uid):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="login_otp_required",
        )

    token = sign_session(uid, role)
    return {"token": token, "role": role}


@router.post("/login-attempt")
def login_attempt(body: LoginAttemptRequest, request: Request):
    """
    Count a *failed* password login toward rate limits.
    Frontend must call this only after signInWithPassword fails.
    """
    email = body.email.strip().lower()
    check_rate_limit(
        request,
        scope="login-attempt-ip",
        limit=FAILED_LOGIN_LIMIT,
        window_seconds=FAILED_LOGIN_WINDOW_SECONDS,
        detail=FAILED_LOGIN_DETAIL,
    )
    check_rate_limit(
        request,
        scope="login-attempt-email",
        limit=FAILED_LOGIN_LIMIT,
        window_seconds=FAILED_LOGIN_WINDOW_SECONDS,
        key_suffix=email,
        detail=FAILED_LOGIN_DETAIL,
    )
    return {"ok": True}


@router.post("/password-recovery")
def password_recovery(
    body: PasswordRecoveryRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Queue a recovery email for a username or an email address.

    The account is resolved first: nothing is sent when no account matches, so
    we never fire codes at an address that does not exist (a bounce there gets
    the sending domain suppressed and hurts real deliveries).
    """
    raw = (body.identifier or (str(body.email) if body.email else "")).strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter your username or email.",
        )
    check_rate_limit(request, scope="password-recovery-ip", limit=3, window_seconds=6 * 3600)
    check_rate_limit(
        request,
        scope="password-recovery-email",
        limit=3,
        window_seconds=6 * 3600,
        key_suffix=raw.lower()[:120],
    )

    generic = {"message": "If this account exists, a recovery link is on its way."}

    email = email_for_identifier(db, raw)
    if not email:
        # No such account — send nothing, but stay vague so the response
        # cannot be used to enumerate usernames.
        return generic

    try:
        get_auth_user_by_email(email)
    except Exception:
        return generic

    redirect_to = f"{settings.APP_BASE_URL.rstrip('/')}/reset-password"

    def _send() -> None:
        try:
            send_password_recovery_email(email, redirect_to)
        except Exception:
            # Keep failures silent — response must not reveal account existence.
            pass

    background_tasks.add_task(_send)
    return generic


@router.post("/password-reset")
def password_reset(
    body: PasswordResetRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Complete a recovery-session password update once every 24 hours."""
    uid = current_user.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your recovery session has expired. Request a new link.")
    check_rate_limit(request, scope="password-reset-ip", limit=5, window_seconds=24 * 3600)
    check_rate_limit(
        request,
        scope="password-reset-user",
        limit=1,
        window_seconds=24 * 3600,
        key_suffix=uid,
    )
    try:
        update_auth_user_password(uid, body.password)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return {"message": "Your password has been updated."}


@router.post("/login-otp/challenge")
def login_otp_challenge(
    request: Request,
    background_tasks: BackgroundTasks,
    body: LoginOtpChallengeRequest = Body(default_factory=LoginOtpChallengeRequest),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """After password auth: send login OTP for admin / super_admin only."""
    email = (current_user.get("email") or "").lower()
    resend = bool(body.resend)
    resends_remaining = OTP_RESEND_LIMIT
    if resend and email:
        used = check_rate_limit(
            request,
            scope="login-otp-resend",
            limit=OTP_RESEND_LIMIT,
            window_seconds=OTP_RESEND_WINDOW_SECONDS,
            key_suffix=email,
            detail=OTP_RESEND_DETAIL,
        )
        resends_remaining = max(OTP_RESEND_LIMIT - used, 0)
    elif email:
        used = current_rate_count(
            request,
            scope="login-otp-resend",
            key_suffix=email,
        )
        resends_remaining = max(OTP_RESEND_LIMIT - used, 0)

    admin = get_admin_user(db, current_user)
    return _queue_otp_email(
        background_tasks,
        issue_login_otp(
            db,
            admin=admin,
            auth_role=current_user.get("role", "user"),
            resends_remaining=resends_remaining,
        ),
        signup=False,
    )


@router.post("/login-otp/verify")
def login_otp_verify(
    body: LoginOtpVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Consume login OTP and unlock session-token / cookie issuance."""
    check_rate_limit(request, scope="login-otp-verify", limit=10, window_seconds=900)
    admin = get_admin_user(db, current_user)
    return verify_login_otp(
        db,
        admin=admin,
        challenge_id=body.challenge_id,
        code=body.code,
    )


@router.post("/login-otp/clear")
def login_otp_clear(
    current_user: dict = Depends(get_current_user),
):
    """Clear MFA flag on logout so the next privileged login requires OTP again."""
    clear_login_mfa(current_user["uid"])
    return {"ok": True}


@router.patch("/users/{uid}/ban")
def ban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Disable a user's account and mark it as banned. Admins cannot ban super_admins."""
    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.get("app_metadata") or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot ban Super Admin accounts.",
        )

    try:
        user = ban_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return user_to_dict(user)


@router.patch("/users/{uid}/unban")
def unban_user(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    """Re-enable a previously banned account."""
    try:
        target = get_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc

    target_role = (target.get("app_metadata") or {}).get("role", "user")
    actor_role = current_user["role"]

    if actor_role == "admin" and target_role == "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins cannot modify Super Admin accounts.",
        )

    try:
        user = unban_auth_user(uid)
    except Exception as exc:
        raise http_error_from_auth(exc) from exc
    return user_to_dict(user)


@router.post("/bootstrap-super-admin")
def bootstrap(current_user: dict = Depends(require_super_admin)):
    """
    Idempotent: ensures support.globalsolutions@gmail.com has the super_admin claim.
    Only callable by an existing super_admin. Run once after initial Supabase setup.
    """
    try:
        return bootstrap_super_admin()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
