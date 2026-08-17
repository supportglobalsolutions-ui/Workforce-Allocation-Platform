"""
Durable bulk-email dispatcher.

Queueing an email job only writes rows; this loop does the sending. That keeps a
1000-recipient payslip run off the HTTP request path and makes it crash-safe —
a restart resumes from whatever is still `pending`.

Two send modes:
  * attach_pdf = False → Resend's /emails/batch, 100 recipients per API call.
  * attach_pdf = True  → one call per recipient, because the batch endpoint
    rejects attachments. Much slower, so the UI warns about it.

Items are claimed with FOR UPDATE SKIP LOCKED so multiple Gunicorn workers can
drain the same queue without sending anything twice.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import text as sql_text
from sqlmodel import Session, select

from core.config import settings
from core.database import engine
from models.email_job import EmailJob, EmailJobItem
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from services.email_resend import (
    BatchMessage, render_broadcast_html, render_broadcast_text,
    render_payslip_html, render_payslip_text, send_email_batch, send_email_detailed,
)
from services.payslip_pdf import build_payslip_pdf, payslip_rows

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _claim_items(db: Session, job_id: UUID, limit: int) -> list[EmailJobItem]:
    """
    Take up to `limit` pending items for this job. SKIP LOCKED lets a second
    process claim a different slice instead of blocking on ours.
    """
    rows = db.exec(
        sql_text(
            """
            SELECT id FROM email_job_items
            WHERE job_id = :job_id AND status = 'pending'
            ORDER BY created_at
            LIMIT :lim
            FOR UPDATE SKIP LOCKED
            """
        ).bindparams(job_id=str(job_id), lim=limit)
    ).all()
    ids = [r[0] for r in rows]
    if not ids:
        return []

    items: list[EmailJobItem] = []
    now = _utc_now()
    for item_id in ids:
        item = db.get(EmailJobItem, item_id)
        if item and item.status == "pending":
            item.status = "claimed"
            item.claimed_at = now
            item.attempts += 1
            db.add(item)
            items.append(item)
    db.commit()
    for item in items:
        db.refresh(item)
    return items


def _reap_stuck_claims(db: Session) -> int:
    """
    Return items whose worker died mid-send to the queue. Items that already
    burned their attempt budget are failed instead of retried forever.
    """
    cutoff = _utc_now() - timedelta(minutes=settings.EMAIL_DISPATCH_STUCK_MINUTES)
    stuck = db.exec(
        select(EmailJobItem).where(
            EmailJobItem.status == "claimed",
            EmailJobItem.claimed_at < cutoff,
        )
    ).all()
    for item in stuck:
        if item.attempts >= settings.EMAIL_DISPATCH_MAX_ATTEMPTS:
            item.status = "failed"
            item.error = f"Abandoned after {item.attempts} attempt(s)"
        else:
            item.status = "pending"
            item.claimed_at = None
        db.add(item)
    if stuck:
        db.commit()
        logger.warning("Reaped %d stuck email job item(s)", len(stuck))
    return len(stuck)


def _payslip_content(
    db: Session, item: EmailJobItem, period: PayrollPeriod
) -> Optional[tuple[str, str, str, PayrollWorkerSummary, Worker]]:
    """Render subject/html/text for one payslip item, or None if data vanished."""
    if not item.payroll_worker_summary_id:
        return None
    summary = db.get(PayrollWorkerSummary, item.payroll_worker_summary_id)
    worker = db.get(Worker, item.worker_id) if item.worker_id else None
    if not summary or not worker:
        return None

    rows = payslip_rows(summary)
    base_currency = summary.base_currency or period.currency
    html = render_payslip_html(
        worker_name=worker.display_name,
        period_label=period.label,
        local_currency=summary.local_currency,
        base_currency=base_currency,
        rows=rows,
    )
    text = render_payslip_text(
        worker_name=worker.display_name,
        period_label=period.label,
        local_currency=summary.local_currency,
        rows=rows,
    )
    subject = f"Your GlobalSolutions payslip — {period.label}"
    return subject, html, text, summary, worker


def _finish_item(item: EmailJobItem, status: str, error: str | None, resend_id: str | None) -> None:
    item.status = status
    item.error = error
    item.resend_id = resend_id
    if status == "sent":
        item.sent_at = _utc_now()


def _process_batch_mode(db: Session, job: EmailJob, items: list[EmailJobItem]) -> None:
    """HTML-only sends: one Resend batch call for the whole claimed chunk."""
    messages: list[BatchMessage] = []
    worker_ids: dict[str, UUID] = {}
    period = db.get(PayrollPeriod, job.payroll_period_id) if job.payroll_period_id else None

    for item in items:
        ref = str(item.id)
        if job.kind == "payslip":
            if not period:
                _finish_item(item, "failed", "Payroll period no longer exists", None)
                db.add(item)
                continue
            content = _payslip_content(db, item, period)
            if not content:
                _finish_item(item, "skipped", "Worker or payslip row no longer exists", None)
                db.add(item)
                continue
            subject, html, text, _summary, worker = content
            worker_ids[ref] = worker.id
        else:
            if not job.body:
                _finish_item(item, "failed", "Broadcast body missing", None)
                db.add(item)
                continue
            subject = job.subject
            html = render_broadcast_html(job.subject, job.body)
            text = render_broadcast_text(job.subject, job.body)
            if item.worker_id:
                worker_ids[ref] = item.worker_id

        messages.append(BatchMessage(ref=ref, to_email=item.to_email, subject=subject, html=html, text=text))

    if messages:
        results = send_email_batch(
            db,
            messages=messages,
            template=job.kind,
            payroll_period_id=job.payroll_period_id,
            worker_ids=worker_ids,
        )
        by_ref = {r.ref: r for r in results}
        for item in items:
            res = by_ref.get(str(item.id))
            if res is None:
                continue
            if res.status == "sent":
                _finish_item(item, "sent", None, res.resend_id)
            else:
                retriable = item.attempts < settings.EMAIL_DISPATCH_MAX_ATTEMPTS
                _finish_item(item, "pending" if retriable else "failed", res.error, None)
                if retriable:
                    item.claimed_at = None
            db.add(item)
    db.commit()


def _process_single_mode(db: Session, job: EmailJob, items: list[EmailJobItem]) -> None:
    """PDF attachments require one API call per recipient."""
    period = db.get(PayrollPeriod, job.payroll_period_id) if job.payroll_period_id else None

    for item in items:
        if not period:
            _finish_item(item, "failed", "Payroll period no longer exists", None)
            db.add(item)
            continue
        content = _payslip_content(db, item, period)
        if not content:
            _finish_item(item, "skipped", "Worker or payslip row no longer exists", None)
            db.add(item)
            continue

        subject, html, text, summary, worker = content
        rows = payslip_rows(summary)
        pdf = build_payslip_pdf(
            worker_name=worker.display_name,
            period_label=period.label,
            local_currency=summary.local_currency,
            base_currency=summary.base_currency or period.currency,
            rows=rows,
        )
        filename = (
            f"payslip-{period.label.replace(' ', '-')}-"
            f"{worker.display_name.replace(' ', '-')}.pdf"
        )
        log, resend_id = send_email_detailed(
            db,
            to_email=item.to_email,
            subject=subject,
            html=html,
            text=text,
            template="payslip",
            attachments=[{"filename": filename, "content": base64.b64encode(pdf).decode()}],
            payroll_period_id=period.id,
            worker_id=worker.id,
            # Stable per item so a retry of the same item cannot double-send.
            idempotency_key=f"item-{item.id}-{item.attempts}",
        )
        if log.status == "sent":
            _finish_item(item, "sent", None, resend_id)
        else:
            retriable = item.attempts < settings.EMAIL_DISPATCH_MAX_ATTEMPTS
            _finish_item(item, "pending" if retriable else "failed", log.error, None)
            if retriable:
                item.claimed_at = None
        db.add(item)
        db.commit()


def _recount_job(db: Session, job: EmailJob) -> None:
    counts = db.exec(
        sql_text(
            """
            SELECT status, COUNT(*) FROM email_job_items
            WHERE job_id = :jid GROUP BY status
            """
        ).bindparams(jid=str(job.id))
    ).all()
    tally = {status: int(n) for status, n in counts}
    job.sent = tally.get("sent", 0)
    job.failed = tally.get("failed", 0)
    job.skipped = tally.get("skipped", 0)
    outstanding = tally.get("pending", 0) + tally.get("claimed", 0)
    if outstanding == 0:
        job.status = "completed"
        job.finished_at = _utc_now()
    db.add(job)
    db.commit()


def run_email_dispatch_tick() -> dict[str, int]:
    """One pass: reap stuck claims, then drain one chunk from each active job."""
    processed = 0
    jobs_touched = 0
    with Session(engine) as db:
        _reap_stuck_claims(db)

        jobs = db.exec(
            select(EmailJob)
            .where(EmailJob.status.in_(["queued", "running"]))
            .order_by(EmailJob.created_at)
        ).all()

        for job in jobs:
            items = _claim_items(db, job.id, settings.EMAIL_DISPATCH_CLAIM_SIZE)
            if not items:
                _recount_job(db, job)
                continue

            if job.status == "queued":
                job.status = "running"
                job.started_at = job.started_at or _utc_now()
                db.add(job)
                db.commit()

            try:
                if job.attach_pdf:
                    _process_single_mode(db, job, items)
                else:
                    _process_batch_mode(db, job, items)
            except Exception as exc:
                logger.exception("Email job %s chunk failed", job.id)
                db.rollback()
                # Release the claim so the chunk is retried rather than lost.
                for item in items:
                    fresh = db.get(EmailJobItem, item.id)
                    if fresh and fresh.status == "claimed":
                        fresh.status = "pending"
                        fresh.claimed_at = None
                        fresh.error = str(exc)[:500]
                        db.add(fresh)
                db.commit()

            processed += len(items)
            jobs_touched += 1
            _recount_job(db, job)

    return {"items": processed, "jobs": jobs_touched}


async def run_email_dispatch_loop() -> None:
    interval = settings.EMAIL_DISPATCH_INTERVAL_SECONDS
    logger.info("Email dispatch loop started (every %ss)", interval)
    while True:
        try:
            stats = await asyncio.to_thread(run_email_dispatch_tick)
            if stats["items"]:
                logger.info("Email dispatch tick: %s", stats)
        except Exception:
            logger.exception("Email dispatch tick failed")
        await asyncio.sleep(interval)
