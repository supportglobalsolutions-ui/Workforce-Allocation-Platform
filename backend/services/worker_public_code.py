"""Public worker codes: G/P + DDMMYY + daily sequence (e.g. G190926001, P190926001).

- G = Global Solutions registered worker
- P = partner worker
- Leadership / ops / country-manager accounts do not get a code
- UUID stays the internal primary key
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from models.admin_users import AdminUser
from models.enums import AdminRoleEnum, WorkerTypeEnum
from models.worker import Worker

MAX_ALLOCATE_ATTEMPTS = 20

# Org roles that are platform staff — no human-facing worker/partner ID.
STAFF_ORG_ROLES = frozenset(
    {
        AdminRoleEnum.ceo_leadership,
        AdminRoleEnum.operations_lead,
        AdminRoleEnum.country_manager,
    }
)


def letter_for_worker(worker: Worker) -> str:
    if worker.worker_type == WorkerTypeEnum.partner_worker:
        return "P"
    return "G"


def date_prefix(letter: str, d: date) -> str:
    return f"{letter}{d.day:02d}{d.month:02d}{d.year % 100:02d}"


def format_public_code(letter: str, d: date, seq: int) -> str:
    if seq < 1:
        raise ValueError("sequence must be >= 1")
    if letter not in {"G", "P"}:
        raise ValueError("letter must be G or P")
    prefix = date_prefix(letter, d)
    if seq <= 999:
        return f"{prefix}{seq:03d}"
    return f"{prefix}{seq}"


def _signup_date(worker: Worker) -> date:
    when = worker.created_at
    if when is None:
        return datetime.now(timezone.utc).date()
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when.astimezone(timezone.utc).date()


def _admin_for(db: Session, worker: Worker) -> AdminUser | None:
    if worker.admin_user is not None:
        return worker.admin_user
    if not worker.admin_user_id:
        return None
    return db.exec(select(AdminUser).where(AdminUser.id == worker.admin_user_id)).first()


def is_eligible_for_public_code(db: Session, worker: Worker) -> bool:
    """Workers and partners only — not leadership / ops staff accounts."""
    admin = _admin_for(db, worker)
    if admin is not None and admin.role in STAFF_ORG_ROLES:
        return False
    return worker.worker_type in {
        WorkerTypeEnum.gs_registered,
        WorkerTypeEnum.partner_worker,
    }


def _next_seq_for_day(db: Session, letter: str, d: date) -> int:
    prefix = date_prefix(letter, d)
    codes = db.exec(
        select(Worker.public_code).where(
            Worker.public_code.is_not(None),
            col(Worker.public_code).like(f"{prefix}%"),
        )
    ).all()
    max_seq = 0
    for code in codes:
        if not code or not code.startswith(prefix):
            continue
        tail = code[len(prefix) :]
        if tail.isdigit():
            max_seq = max(max_seq, int(tail))
    return max_seq + 1


def assign_public_code(db: Session, worker: Worker) -> str | None:
    """Set worker.public_code if eligible and missing. Returns None for staff."""
    if not is_eligible_for_public_code(db, worker):
        if worker.public_code:
            worker.public_code = None
            db.add(worker)
            db.flush()
        return None

    if worker.public_code:
        return worker.public_code

    letter = letter_for_worker(worker)
    d = _signup_date(worker)
    last_err: Exception | None = None
    for _ in range(MAX_ALLOCATE_ATTEMPTS):
        seq = _next_seq_for_day(db, letter, d)
        code = format_public_code(letter, d, seq)
        worker.public_code = code
        try:
            with db.begin_nested():
                db.add(worker)
                db.flush()
            return code
        except IntegrityError as exc:
            last_err = exc
            worker.public_code = None
    raise RuntimeError(f"Could not allocate a unique public_code: {last_err}")


def ensure_public_code(db: Session, worker: Worker) -> str | None:
    """Assign or clear as needed, then commit (lazy path on reads)."""
    before = worker.public_code
    code = assign_public_code(db, worker)
    if before != worker.public_code:
        db.commit()
        db.refresh(worker)
    return code
