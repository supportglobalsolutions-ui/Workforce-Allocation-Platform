"""
Bulk email surface: payslips and broadcasts.

Sends are queued, not performed inline. The endpoint validates the audience,
writes an email_jobs row plus one email_job_items row per recipient, and returns
202 with a job id. services/email_dispatch.py drains the queue in the background,
which is what lets a 1000-recipient run finish without timing out the request or
losing progress on a restart.
"""
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
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
    extra_emails: Optional[list[str]] = None    # typed addresses for quick test / extra recipients
    skip_workers: bool = False                  # True = only email extra_emails (fast local test)


def _worker_email(db: Session, worker: Worker) -> Optional[str]:
    if not worker.admin_user_id:
        return None
    admin_user = db.get(AdminUser, worker.admin_user_id)
    return admin_user.email if admin_user else None


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

    extra = [e.strip() for e in (body.extra_emails or []) if e and is_valid_email_address(e)]
    if body.skip_workers and not extra:
        raise HTTPException(status_code=400, detail="Provide at least one test email when skip_workers is set.")

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


@router.get("/log")
def list_email_log(
    template: Optional[str] = None,
    payroll_period_id: Optional[UUID] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(EmailLog)
    if template:
        stmt = stmt.where(EmailLog.template == template)
    if payroll_period_id:
        stmt = stmt.where(EmailLog.payroll_period_id == payroll_period_id)
    logs = db.exec(stmt.order_by(EmailLog.created_at.desc()).limit(min(limit, 500))).all()
    return [
        {
            "id": str(l.id),
            "to_email": l.to_email,
            "subject": l.subject,
            "template": l.template,
            "status": l.status,
            "error": l.error,
            "payroll_period_id": str(l.payroll_period_id) if l.payroll_period_id else None,
            "worker_id": str(l.worker_id) if l.worker_id else None,
            "created_at": l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]
