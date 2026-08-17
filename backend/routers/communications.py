"""
Bulk email surface: payslips and broadcasts.

Sends are queued, not performed inline. The endpoint validates the audience,
writes an email_jobs row plus one email_job_items row per recipient, and returns
202 with a job id. services/email_dispatch.py drains the queue in the background,
which is what lets a 1000-recipient run finish without timing out the request or
losing progress on a restart.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.admin_users import AdminUser
from models.email_job import EmailJob, EmailJobItem
from models.email_log import EmailLog
from models.enums import WorkerStatusEnum, WorkerTypeEnum
from models.notification import Notification
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from routers.deps import get_admin_user
from services.email_events import apply_event, sync_delivery_events, verify_webhook_signature
from services.email_resend import blocked_recipient_reason, is_valid_email_address

router = APIRouter()
logger = logging.getLogger(__name__)


class SendPayslipsRequest(BaseModel):
    payroll_period_id: UUID
    worker_ids: Optional[list[UUID]] = None  # None = every worker in the period
    attach_pdf: bool = False
    override_email: Optional[str] = None     # send every payslip to this address instead (testing)
    force_resend: bool = False               # re-send to workers already emailed for this period
    notify_in_app: bool = True               # also raise a wallet notification


class BroadcastRequest(BaseModel):
    title: str
    message: str
    countries: Optional[list[str]] = None       # None = all countries
    worker_type: Optional[str] = None           # gs_registered | partner_worker | None = all
    active_only: bool = False
    extra_emails: Optional[list[str]] = None    # typed addresses emailed alongside the workers
    skip_workers: bool = False                  # True = email only extra_emails, no workers


def _worker_email(db: Session, worker: Worker) -> Optional[str]:
    if not worker.admin_user_id:
        return None
    admin_user = db.get(AdminUser, worker.admin_user_id)
    return admin_user.email if admin_user else None


def _worker_names(db: Session, worker_ids: list[Optional[UUID]]) -> dict[UUID, str]:
    ids = {w for w in worker_ids if w}
    if not ids:
        return {}
    rows = db.exec(select(Worker.id, Worker.display_name).where(Worker.id.in_(ids))).all()
    return {wid: name for wid, name in rows}


def _period_labels(db: Session, period_ids: list[Optional[UUID]]) -> dict[UUID, str]:
    ids = {p for p in period_ids if p}
    if not ids:
        return {}
    rows = db.exec(
        select(PayrollPeriod.id, PayrollPeriod.label).where(PayrollPeriod.id.in_(ids))
    ).all()
    return {pid: label for pid, label in rows}


def _log_row(log: EmailLog, names: dict[UUID, str], labels: dict[UUID, str]) -> dict:
    """One email history row: our outcome plus whatever the provider reported."""
    return {
        "id": str(log.id),
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "to_email": log.to_email,
        "from_email": log.from_email,
        "subject": log.subject,
        "template": log.template,
        "status": log.status,
        "error": log.error,
        "resend_id": log.resend_id,
        "last_event": log.last_event,
        "last_event_at": log.last_event_at.isoformat() if log.last_event_at else None,
        "provider_checked_at": log.provider_checked_at.isoformat() if log.provider_checked_at else None,
        "events": log.events or [],
        "email_job_id": str(log.email_job_id) if log.email_job_id else None,
        "payroll_period_id": str(log.payroll_period_id) if log.payroll_period_id else None,
        "period_label": labels.get(log.payroll_period_id) if log.payroll_period_id else None,
        "worker_id": str(log.worker_id) if log.worker_id else None,
        "worker_name": names.get(log.worker_id) if log.worker_id else None,
    }


def _job_response(db: Session, job: EmailJob) -> dict:
    items = db.exec(select(EmailJobItem).where(EmailJobItem.job_id == job.id)).all()
    tally: dict[str, int] = {}
    for item in items:
        tally[item.status] = tally.get(item.status, 0) + 1
    errors = [
        f"{i.to_email}: {i.error}"
        for i in items
        if i.status == "failed" and i.error
    ][:5]
    return {
        "job_id": str(job.id),
        "kind": job.kind,
        "status": job.status,
        "subject": job.subject,
        "attach_pdf": job.attach_pdf,
        "payroll_period_id": str(job.payroll_period_id) if job.payroll_period_id else None,
        "total": job.total,
        "sent": tally.get("sent", 0),
        "failed": tally.get("failed", 0),
        "skipped": tally.get("skipped", 0),
        "pending": tally.get("pending", 0) + tally.get("claimed", 0),
        "error": job.error,
        "errors": errors,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


@router.post("/payslips/send", status_code=status.HTTP_202_ACCEPTED)
def send_payslips(
    body: SendPayslipsRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Queue payslip emails for a period and return the job to poll."""
    period = db.get(PayrollPeriod, body.payroll_period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")

    stmt = select(PayrollWorkerSummary).where(
        PayrollWorkerSummary.payroll_period_id == body.payroll_period_id
    )
    if body.worker_ids:
        stmt = stmt.where(PayrollWorkerSummary.worker_id.in_(body.worker_ids))
    summaries = db.exec(stmt).all()
    if not summaries:
        raise HTTPException(status_code=400, detail="No payslip summaries — calculate the period first.")

    override = (body.override_email or "").strip()
    if override:
        blocked = blocked_recipient_reason(override)
        if blocked:
            raise HTTPException(status_code=400, detail=blocked)

    # Workers already emailed for this period are left alone unless asked again,
    # so re-running the send after fixing a few rows does not spam everyone.
    already_sent: set[UUID] = set()
    if not body.force_resend:
        prior = db.exec(
            select(EmailLog.worker_id).where(
                EmailLog.payroll_period_id == period.id,
                EmailLog.template == "payslip",
                EmailLog.status == "sent",
            )
        ).all()
        already_sent = {w for w in prior if w}

    admin = get_admin_user(db, current_user)
    job = EmailJob(
        kind="payslip",
        subject=f"Your GlobalSolutions payslip — {period.label}",
        attach_pdf=body.attach_pdf,
        payroll_period_id=period.id,
        created_by=admin.id,
    )
    db.add(job)
    db.flush()

    queued = 0
    skipped_no_email = 0
    skipped_already = 0
    seen_workers: set[UUID] = set()

    for summary in summaries:
        worker = db.get(Worker, summary.worker_id)
        if not worker or worker.id in seen_workers:
            continue
        seen_workers.add(worker.id)

        if worker.id in already_sent:
            skipped_already += 1
            continue

        email = override or _worker_email(db, worker)
        if not email or not is_valid_email_address(email):
            skipped_no_email += 1
            continue

        db.add(EmailJobItem(
            job_id=job.id,
            worker_id=worker.id,
            payroll_worker_summary_id=summary.id,
            to_email=email,
        ))
        queued += 1

        if body.notify_in_app:
            db.add(Notification(
                sender_admin_id=admin.id,
                title=f"Payslip ready — {period.label}",
                message=(
                    f"Your payslip for {period.label} is available. "
                    f"Net pay due: {summary.local_currency} {summary.final_net:,.2f}."
                    if summary.final_net is not None
                    else f"Your payslip for {period.label} is available in your wallet."
                ),
                category="payment",
                target_type="specific",
                target_worker_id=worker.id,
            ))

    if queued == 0:
        db.rollback()
        detail = "No payslips to send."
        if skipped_already:
            detail += f" {skipped_already} worker(s) were already emailed — use force_resend to send again."
        if skipped_no_email:
            detail += f" {skipped_no_email} worker(s) have no valid email address."
        raise HTTPException(status_code=400, detail=detail)

    job.total = queued
    job.skipped = skipped_no_email + skipped_already
    db.add(job)
    db.commit()
    db.refresh(job)

    payload = _job_response(db, job)
    payload.update({
        "queued": queued,
        "skipped_no_email": skipped_no_email,
        "skipped_already_sent": skipped_already,
    })
    return payload


@router.post("/broadcast", status_code=status.HTTP_202_ACCEPTED)
def broadcast(
    body: BroadcastRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Queue an announcement email to workers filtered by country/type/status."""
    if not body.title.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Title and message are required.")

    extra: list[str] = []
    for raw in body.extra_emails or []:
        addr = (raw or "").strip()
        if not addr:
            continue
        blocked = blocked_recipient_reason(addr)
        if blocked:
            raise HTTPException(status_code=400, detail=blocked)
        extra.append(addr)
    if body.skip_workers and not extra:
        raise HTTPException(
            status_code=400,
            detail="Add at least one email address when sending to typed addresses only.",
        )

    workers: list[Worker] = []
    if not body.skip_workers:
        stmt = select(Worker)
        if body.countries:
            stmt = stmt.where(Worker.country.in_(body.countries))
        if body.worker_type:
            try:
                stmt = stmt.where(Worker.worker_type == WorkerTypeEnum(body.worker_type))
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid worker type filter.")
        if body.active_only:
            stmt = stmt.where(Worker.status == WorkerStatusEnum.active)
        workers = list(db.exec(stmt).all())

    admin = get_admin_user(db, current_user)
    job = EmailJob(
        kind="broadcast",
        subject=body.title.strip(),
        body=body.message,
        created_by=admin.id,
    )
    db.add(job)
    db.flush()

    queued = 0
    skipped = 0
    seen: set[str] = set()

    for worker in workers:
        email = _worker_email(db, worker)
        if not email or not is_valid_email_address(email):
            skipped += 1
            continue
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        db.add(EmailJobItem(job_id=job.id, worker_id=worker.id, to_email=email))
        queued += 1

    for email in extra:
        key = email.lower()
        if key in seen:
            continue
        seen.add(key)
        # worker_id stays null so the job/worker unique constraint allows several
        # typed addresses on one job.
        db.add(EmailJobItem(job_id=job.id, to_email=email))
        queued += 1

    if queued == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="No recipients with a valid email address.")

    job.total = queued
    job.skipped = skipped
    db.add(job)
    db.commit()
    db.refresh(job)

    payload = _job_response(db, job)
    payload.update({"queued": queued, "skipped_no_email": skipped, "recipients": queued})
    return payload


@router.get("/jobs")
def list_email_jobs(
    kind: Optional[str] = None,
    payroll_period_id: Optional[UUID] = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(EmailJob)
    if kind:
        stmt = stmt.where(EmailJob.kind == kind)
    if payroll_period_id:
        stmt = stmt.where(EmailJob.payroll_period_id == payroll_period_id)
    jobs = db.exec(stmt.order_by(EmailJob.created_at.desc()).limit(min(limit, 100))).all()
    return [_job_response(db, j) for j in jobs]


@router.get("/jobs/{job_id}")
def get_email_job(
    job_id: UUID,
    include_items: bool = False,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    job = db.get(EmailJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Email job not found")
    payload = _job_response(db, job)
    if include_items:
        items = db.exec(
            select(EmailJobItem).where(EmailJobItem.job_id == job.id).order_by(EmailJobItem.created_at)
        ).all()
        payload["items"] = [
            {
                "id": str(i.id),
                "worker_id": str(i.worker_id) if i.worker_id else None,
                "to_email": i.to_email,
                "status": i.status,
                "attempts": i.attempts,
                "error": i.error,
                "sent_at": i.sent_at.isoformat() if i.sent_at else None,
            }
            for i in items
        ]
    return payload


@router.post("/jobs/{job_id}/retry")
def retry_email_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Re-queue the failed items of a job; already-sent recipients are untouched."""
    job = db.get(EmailJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Email job not found")

    failed = db.exec(
        select(EmailJobItem).where(EmailJobItem.job_id == job.id, EmailJobItem.status == "failed")
    ).all()
    if not failed:
        raise HTTPException(status_code=400, detail="This job has no failed recipients to retry.")

    for item in failed:
        item.status = "pending"
        item.attempts = 0
        item.error = None
        item.claimed_at = None
        db.add(item)

    job.status = "queued"
    job.finished_at = None
    job.error = None
    db.add(job)
    db.commit()
    db.refresh(job)
    payload = _job_response(db, job)
    payload["requeued"] = len(failed)
    return payload


@router.post("/jobs/{job_id}/cancel")
def cancel_email_job(
    job_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Stop a job. Recipients already sent stay sent; the rest are marked skipped."""
    job = db.get(EmailJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Email job not found")
    if job.status == "completed":
        raise HTTPException(status_code=400, detail="This job has already finished.")

    outstanding = db.exec(
        select(EmailJobItem).where(
            EmailJobItem.job_id == job.id,
            EmailJobItem.status.in_(["pending", "claimed"]),
        )
    ).all()
    for item in outstanding:
        item.status = "skipped"
        item.error = "Cancelled by admin"
        db.add(item)

    job.status = "cancelled"
    job.finished_at = datetime.now(timezone.utc)
    db.add(job)
    db.commit()
    db.refresh(job)
    payload = _job_response(db, job)
    payload["cancelled"] = len(outstanding)
    return payload


def _log_filters(
    template: Optional[str],
    status_filter: Optional[str],
    last_event: Optional[str],
    payroll_period_id: Optional[UUID],
    email_job_id: Optional[UUID],
    worker_id: Optional[UUID],
    search: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> list:
    """Shared WHERE clauses so the page and its totals always agree."""
    clauses = []
    if template:
        clauses.append(EmailLog.template == template)
    if status_filter:
        clauses.append(EmailLog.status == status_filter)
    if last_event:
        if last_event == "unknown":
            clauses.append(
                or_(EmailLog.last_event.is_(None), EmailLog.last_event.in_(("queued", "sent", "scheduled")))
            )
        elif last_event == "problem":
            clauses.append(EmailLog.last_event.in_(("bounced", "complained", "failed")))
        else:
            clauses.append(EmailLog.last_event == last_event)
    if payroll_period_id:
        clauses.append(EmailLog.payroll_period_id == payroll_period_id)
    if email_job_id:
        clauses.append(EmailLog.email_job_id == email_job_id)
    if worker_id:
        clauses.append(EmailLog.worker_id == worker_id)
    if search:
        needle = f"%{search.strip()}%"
        clauses.append(or_(EmailLog.to_email.ilike(needle), EmailLog.subject.ilike(needle)))
    if date_from:
        clauses.append(EmailLog.created_at >= date_from)
    if date_to:
        clauses.append(EmailLog.created_at <= date_to)
    return clauses


@router.get("/log")
def list_email_log(
    template: Optional[str] = None,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    last_event: Optional[str] = None,
    payroll_period_id: Optional[UUID] = None,
    email_job_id: Optional[UUID] = None,
    worker_id: Optional[UUID] = None,
    search: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """
    Paginated email history with provider delivery state.

    `stats` is computed over the whole filtered set, not the current page, so the
    counters stay meaningful while paging.
    """
    clauses = _log_filters(
        template, status_filter, last_event, payroll_period_id,
        email_job_id, worker_id, search, date_from, date_to,
    )

    page_size = max(1, min(limit, 200))
    stmt = select(EmailLog)
    for clause in clauses:
        stmt = stmt.where(clause)
    logs = db.exec(
        stmt.order_by(EmailLog.created_at.desc()).offset(max(offset, 0)).limit(page_size)
    ).all()

    count_stmt = select(func.count()).select_from(EmailLog)
    for clause in clauses:
        count_stmt = count_stmt.where(clause)
    total = db.exec(count_stmt).one()

    # Two grouped queries instead of one per row.
    status_stmt = select(EmailLog.status, func.count()).select_from(EmailLog)
    event_stmt = select(EmailLog.last_event, func.count()).select_from(EmailLog)
    for clause in clauses:
        status_stmt = status_stmt.where(clause)
        event_stmt = event_stmt.where(clause)
    by_status = dict(db.exec(status_stmt.group_by(EmailLog.status)).all())
    by_event = {
        (event or "unknown"): count
        for event, count in db.exec(event_stmt.group_by(EmailLog.last_event)).all()
    }

    names = _worker_names(db, [l.worker_id for l in logs])
    labels = _period_labels(db, [l.payroll_period_id for l in logs])

    return {
        "items": [_log_row(l, names, labels) for l in logs],
        "total": total,
        "limit": page_size,
        "offset": max(offset, 0),
        "stats": {
            "total": total,
            "accepted": by_status.get("sent", 0),
            "rejected": by_status.get("failed", 0),
            "delivered": by_event.get("delivered", 0),
            "opened": by_event.get("opened", 0) + by_event.get("clicked", 0),
            "bounced": by_event.get("bounced", 0),
            "complained": by_event.get("complained", 0),
            "in_flight": (
                by_event.get("unknown", 0) + by_event.get("sent", 0)
                + by_event.get("queued", 0) + by_event.get("delivery_delayed", 0)
            ),
        },
    }


@router.get("/log/{log_id}")
def get_email_log_entry(
    log_id: UUID,
    refresh: bool = False,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Everything known about one email: recipient, provider timeline, source job."""
    log = db.get(EmailLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Email log entry not found")

    if refresh and log.resend_id:
        sync_delivery_events(db, log_ids=[log.id], limit=1)
        db.refresh(log)

    names = _worker_names(db, [log.worker_id])
    labels = _period_labels(db, [log.payroll_period_id])
    payload = _log_row(log, names, labels)

    if log.worker_id:
        worker = db.get(Worker, log.worker_id)
        if worker:
            payload["worker"] = {
                "id": str(worker.id),
                "display_name": worker.display_name,
                "country": worker.country,
                "worker_type": worker.worker_type.value if worker.worker_type else None,
                "status": worker.status.value if worker.status else None,
            }

    if log.email_job_id:
        job = db.get(EmailJob, log.email_job_id)
        if job:
            payload["job"] = {
                "id": str(job.id),
                "kind": job.kind,
                "status": job.status,
                "subject": job.subject,
                "total": job.total,
                "sent": job.sent,
                "failed": job.failed,
                "skipped": job.skipped,
                "attach_pdf": job.attach_pdf,
                "created_at": job.created_at.isoformat() if job.created_at else None,
            }
        item = db.exec(
            select(EmailJobItem).where(
                EmailJobItem.job_id == log.email_job_id,
                EmailJobItem.to_email == log.to_email,
            )
        ).first()
        if item:
            payload["job_item"] = {
                "id": str(item.id),
                "status": item.status,
                "attempts": item.attempts,
                "error": item.error,
                "sent_at": item.sent_at.isoformat() if item.sent_at else None,
            }

    return payload


@router.post("/log/sync")
def sync_email_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """
    Pull delivery state from Resend for messages whose outcome is still unknown.

    The webhook keeps history current in production; this is the manual path for
    local development and for backfilling anything the webhook missed.
    """
    return sync_delivery_events(db, limit=limit)


@router.post("/resend/webhook", include_in_schema=False)
async def resend_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive Resend delivery events (delivered, bounced, complained, opened…).

    Public by necessity, so every request must carry a valid Svix signature —
    otherwise anyone could rewrite delivery history. Configure the endpoint URL
    and its whsec_ secret in the Resend dashboard.
    """
    body = await request.body()
    problem = verify_webhook_signature(dict(request.headers), body)
    if problem:
        logger.warning("Rejected Resend webhook: %s", problem)
        raise HTTPException(status_code=401, detail=problem)

    try:
        payload = json.loads(body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    data = payload.get("data") or {}
    resend_id = data.get("email_id") or data.get("id")
    event_type = payload.get("type") or ""
    if not resend_id or not event_type:
        raise HTTPException(status_code=400, detail="Missing event type or email id")

    occurred_at = None
    raw_at = payload.get("created_at") or data.get("created_at")
    if raw_at:
        try:
            occurred_at = datetime.fromisoformat(str(raw_at).replace("Z", "+00:00"))
        except ValueError:
            occurred_at = None

    log = apply_event(
        db, resend_id=resend_id, event_type=event_type, occurred_at=occurred_at, data=data,
    )
    # 200 either way: a retry storm for an id we never sent helps nobody.
    return {"received": True, "matched": log is not None}
