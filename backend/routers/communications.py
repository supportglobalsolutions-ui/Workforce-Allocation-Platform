import base64
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.admin_users import AdminUser
from models.email_log import EmailLog
from models.enums import WorkerStatusEnum, WorkerTypeEnum
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from services.email_resend import render_broadcast_html, render_payslip_html, send_email
from services.payslip_pdf import build_payslip_pdf, payslip_rows

router = APIRouter()


class SendPayslipsRequest(BaseModel):
    payroll_period_id: UUID
    worker_ids: Optional[list[UUID]] = None  # None = every worker in the period
    attach_pdf: bool = False


class BroadcastRequest(BaseModel):
    title: str
    message: str
    countries: Optional[list[str]] = None       # None = all countries
    worker_type: Optional[str] = None           # gs_registered | partner_worker | None = all
    active_only: bool = False


def _worker_email(db: Session, worker: Worker) -> Optional[str]:
    if not worker.admin_user_id:
        return None
    admin_user = db.get(AdminUser, worker.admin_user_id)
    return admin_user.email if admin_user else None


@router.post("/payslips/send")
def send_payslips(
    body: SendPayslipsRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Email HTML payslips (optional PDF attachment) to workers for a period."""
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

    sent = failed = skipped = 0
    for summary in summaries:
        worker = db.get(Worker, summary.worker_id)
        if not worker:
            skipped += 1
            continue
        email = _worker_email(db, worker)
        if not email:
            skipped += 1
            continue

        rows = payslip_rows(summary)
        html = render_payslip_html(
            worker_name=worker.display_name,
            period_label=period.label,
            local_currency=summary.local_currency,
            base_currency=summary.base_currency or period.currency,
            rows=rows,
        )
        attachments = None
        if body.attach_pdf:
            pdf = build_payslip_pdf(
                worker_name=worker.display_name,
                period_label=period.label,
                local_currency=summary.local_currency,
                base_currency=summary.base_currency or period.currency,
                rows=rows,
            )
            attachments = [{
                "filename": f"payslip-{period.label.replace(' ', '-')}-{worker.display_name.replace(' ', '-')}.pdf",
                "content": base64.b64encode(pdf).decode(),
            }]

        log = send_email(
            db,
            to_email=email,
            subject=f"Your GlobalSolutions payslip — {period.label}",
            html=html,
            template="payslip",
            attachments=attachments,
            payroll_period_id=period.id,
            worker_id=worker.id,
        )
        if log.status == "sent":
            sent += 1
        else:
            failed += 1

    return {"sent": sent, "failed": failed, "skipped": skipped}


@router.post("/broadcast")
def broadcast(
    body: BroadcastRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Send a styled announcement email to workers filtered by country/type/status."""
    if not body.title.strip() or not body.message.strip():
        raise HTTPException(status_code=400, detail="Title and message are required.")

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

    workers = db.exec(stmt).all()
    html = render_broadcast_html(body.title, body.message)

    sent = failed = skipped = 0
    for worker in workers:
        email = _worker_email(db, worker)
        if not email:
            skipped += 1
            continue
        log = send_email(
            db,
            to_email=email,
            subject=body.title,
            html=html,
            template="broadcast",
            worker_id=worker.id,
        )
        if log.status == "sent":
            sent += 1
        else:
            failed += 1

    return {"recipients": len(workers), "sent": sent, "failed": failed, "skipped": skipped}


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
