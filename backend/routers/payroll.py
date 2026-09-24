import csv
import io
import logging
import zipfile
from datetime import date, datetime, time, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.admin_users import AdminUser
from models.enums import PayrollPeriodStatusEnum, WorkerStatusEnum
from models.payroll import PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from schemas.payroll import (
    LedgerSheetRow,
    PayrollHistoryRow,
    PayrollLineItemCreate,
    PayrollLineItemResponse,
    PayrollLineItemUpdate,
    PayrollPeriodCreate,
    PayrollPeriodResponse,
    PayrollPeriodUpdate,
    PayrollSummaryBulkRequest,
    PayrollWorkerSummaryResponse,
    PayrollWorkerSummaryUpdate,
    WorkerPayrollOverviewResponse,
)
from services import payroll_engine
from services.admin_otp import PURPOSE_DELETE_PERIOD, issue_otp, verify_otp
from services.audit_service import record_audit
from services.email_resend import render_otp_html, render_otp_text
from services.fx import currency_for_country
from services.period_lifecycle import ensure_current_work_month
from services.period_current import pin_current_period, resolve_current_period
from services.period_labels import period_label_from_date
from services.payslip_pdf import generate_period_pdfs, render_payslip_pdf
from services.security_risk import maybe_notify_threshold, record_event
from services.session_evidence import evidence_hours_for_worker, evidence_hours_for_workers
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/periods", response_model=list[PayrollPeriodResponse])
def list_payroll_periods(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    # Keep a covering work month pinned so dashboards never look empty mid-month.
    try:
        ensure_current_work_month(db)
    except Exception:
        logger.exception("ensure_current_work_month failed during period list")
    return db.exec(select(PayrollPeriod).order_by(PayrollPeriod.start_date.desc())).all()


@router.get("/periods/{period_id}", response_model=PayrollPeriodResponse)
def get_payroll_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.exec(select(PayrollPeriod).where(PayrollPeriod.id == period_id)).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")
    return period


@router.post("/periods", response_model=PayrollPeriodResponse, status_code=status.HTTP_201_CREATED)
def create_payroll_period(
    body: PayrollPeriodCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    label = period_label_from_date(body.start_date)
    existing = db.exec(select(PayrollPeriod).where(PayrollPeriod.label == label)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A period named {label} already exists.",
        )
    data = body.model_dump()
    data["label"] = label
    today = date.today()
    covers_today = body.start_date <= today <= body.end_date
    existing_pin = db.exec(select(PayrollPeriod).where(PayrollPeriod.is_current == True)).first()  # noqa: E712
    period = PayrollPeriod(**data)
    db.add(period)
    db.flush()
    if covers_today or existing_pin is None:
        pin_current_period(db, period)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A period named {label} already exists.",
        )
    db.refresh(period)
    return period


@router.patch("/periods/{period_id}", response_model=PayrollPeriodResponse)
def update_payroll_period(
    period_id: UUID,
    body: PayrollPeriodUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.exec(select(PayrollPeriod).where(PayrollPeriod.id == period_id)).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    if body.label is not None:
        label = body.label.strip()
        if not label:
            raise HTTPException(status_code=400, detail="Period name cannot be empty.")
        clash = db.exec(
            select(PayrollPeriod).where(PayrollPeriod.label == label, PayrollPeriod.id != period_id)
        ).first()
        if clash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A period named {label} already exists.",
            )
        body.label = label

    fields = body.model_dump(exclude_unset=True)
    pin = fields.pop("is_current", None)
    new_start = fields.get("start_date", period.start_date)
    new_end = fields.get("end_date", period.end_date)
    if "start_date" in fields or "end_date" in fields:
        if period.status in (PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid):
            raise HTTPException(
                status_code=400,
                detail="Dates cannot be changed after this period is approved or paid.",
            )
        if new_end < new_start:
            raise HTTPException(status_code=400, detail="End date must be on or after the start date.")
        period.start_date = new_start
        period.end_date = new_end
        fields.pop("start_date", None)
        fields.pop("end_date", None)

    for field, value in fields.items():
        setattr(period, field, value)
    db.add(period)
    if pin is True:
        pin_current_period(db, period)
    elif pin is False:
        period.is_current = False
        db.add(period)
    db.add(period)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A period named {body.label} already exists.",
        )
    db.refresh(period)
    return period


class DeletePeriodConfirm(BaseModel):
    challenge_id: UUID
    code: str


@router.post("/periods/{period_id}/delete/request-otp")
def request_period_delete_otp(
    period_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Email a 3-minute code to the ops alert inbox. Nothing is deleted yet."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    admin = get_admin_user(db, current_user)
    html = render_otp_html(
        title="Confirm work period deletion",
        intro=(
            f"An administrator asked to permanently delete the work period "
            f"<strong>{period.label}</strong>. Enter this code in the platform to continue."
        ),
        warning="This cannot be undone. Payslips and period quality scores will be removed.",
    )
    text = render_otp_text(
        title="Confirm work period deletion",
        intro=f"An administrator asked to permanently delete the work period {period.label}.",
        warning="This cannot be undone.",
    )
    payload = issue_otp(
        db,
        purpose=PURPOSE_DELETE_PERIOD,
        target_id=period.id,
        subject=f"Confirmation code — delete {period.label}",
        html=html,
        text=text,
        admin=admin,
    )
    payload["period_label"] = period.label
    return payload


@router.post("/periods/{period_id}/delete/confirm")
def confirm_period_delete(
    period_id: UUID,
    body: DeletePeriodConfirm,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Consume a valid code and purge the work period."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")

    verify_otp(
        db,
        challenge_id=body.challenge_id,
        purpose=PURPOSE_DELETE_PERIOD,
        target_id=period.id,
        code=body.code,
    )

    admin = get_admin_user(db, current_user)
    label = period.label
    snapshot = payroll_engine.purge_payroll_period(db, period)
    record_audit(
        db,
        actor_id=admin.id,
        action="payroll_period.deleted",
        target_type="payroll_period",
        target_id=period_id,
        previous_value=snapshot,
        reason_note="Deleted after email confirmation code",
    )
    record_event(
        db,
        admin_user_id=admin.id,
        event_type="payroll_period_deleted",
        payload={"period_id": str(period_id), "label": label},
    )
    maybe_notify_threshold(db, admin_user_id=admin.id, admin_email=admin.email)
    db.commit()
    return {"deleted": True, "id": str(period_id), "label": label}


@router.get("/line-items", response_model=list[PayrollLineItemResponse])
def list_payroll_line_items(
    payroll_period_id: UUID | None = None,
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(PayrollLineItem)
    if payroll_period_id:
        stmt = stmt.where(PayrollLineItem.payroll_period_id == payroll_period_id)
    if worker_id:
        stmt = stmt.where(PayrollLineItem.worker_id == worker_id)
    return db.exec(stmt.order_by(PayrollLineItem.created_at.desc())).all()


@router.post("/line-items", response_model=PayrollLineItemResponse, status_code=status.HTTP_201_CREATED)
def create_payroll_line_item(
    body: PayrollLineItemCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    item = PayrollLineItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/line-items/{item_id}", response_model=PayrollLineItemResponse)
def update_payroll_line_item(
    item_id: UUID,
    body: PayrollLineItemUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    item = db.exec(select(PayrollLineItem).where(PayrollLineItem.id == item_id)).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll line item not found")

    apply_update(item, body)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


# ── Engine actions ─────────────────────────────────────────────────────────────

@router.post("/periods/{period_id}/calculate")
def calculate_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    try:
        result = payroll_engine.calculate_period(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        pdfs = generate_period_pdfs(db, period_id, force=True)
        result["pdfs"] = pdfs["generated"]
    except Exception:
        logger.exception("Payslip PDF generation after calculate failed")
        result["pdfs"] = 0
    return result


@router.post("/periods/{period_id}/approve", response_model=PayrollPeriodResponse)
def approve_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    try:
        period = payroll_engine.approve_period(db, period_id, admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    try:
        generate_period_pdfs(db, period_id, force=True)
    except Exception:
        logger.exception("Payslip PDF generation after approve failed")
    return period


@router.post("/periods/{period_id}/reopen", response_model=PayrollPeriodResponse)
def reopen_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    if period.status == PayrollPeriodStatusEnum.paid:
        raise HTTPException(status_code=400, detail="A paid period cannot be reopened.")
    period.status = PayrollPeriodStatusEnum.open
    period.approved_by = None
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


@router.post("/periods/{period_id}/push-wallets")
def push_period_to_wallets(
    period_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    try:
        return payroll_engine.push_period_to_wallets(db, period_id, admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/periods/{period_id}/mark-paid", response_model=PayrollPeriodResponse)
def mark_period_paid(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    if period.status != PayrollPeriodStatusEnum.approved:
        raise HTTPException(status_code=400, detail="Only an approved period can be marked as paid.")
    period.status = PayrollPeriodStatusEnum.paid
    period.paid_at = datetime.now(timezone.utc)
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


# ── Worker summaries (payslip rows) ────────────────────────────────────────────

def _summary_response(db: Session, summary: PayrollWorkerSummary, period: PayrollPeriod | None = None) -> PayrollWorkerSummaryResponse:
    resp = PayrollWorkerSummaryResponse.model_validate(summary)
    worker = db.get(Worker, summary.worker_id)
    if worker:
        resp.worker_display_name = worker.display_name
        resp.worker_country = worker.country
        resp.worker_type = worker.worker_type.value if worker.worker_type else None
        resp.worker_pay_tier = worker.pay_tier
        if worker.admin_user_id:
            admin_user = db.get(AdminUser, worker.admin_user_id)
            resp.worker_email = admin_user.email if admin_user else None
    if period is None:
        period = db.get(PayrollPeriod, summary.payroll_period_id)
    if period:
        start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
        end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)
        hours, incomplete, session_count = evidence_hours_for_worker(
            db, summary.worker_id, start, end, period_id=period.id,
        )
        resp.suggested_hours = hours
        resp.evidence_incomplete = incomplete
        resp.session_count = session_count
    return resp


def _summary_responses(
    db: Session,
    summaries: list[PayrollWorkerSummary],
    period: PayrollPeriod | None = None,
) -> list[PayrollWorkerSummaryResponse]:
    """Batched sibling of :func:`_summary_response` for whole-period lists.

    Per row the single form costs a worker fetch, an admin-user fetch and a
    sessions scan. Multiplied by a roster on a hosted database that is tens of
    seconds — long enough for the browser to abort and the dashboard to report
    the report as simply missing. Here each of those becomes one query for the
    whole list.
    """
    if not summaries:
        return []

    worker_ids = [s.worker_id for s in summaries]
    workers = {
        w.id: w for w in db.exec(select(Worker).where(Worker.id.in_(worker_ids))).all()
    }
    admin_ids = [w.admin_user_id for w in workers.values() if w.admin_user_id]
    admins = (
        {a.id: a for a in db.exec(select(AdminUser).where(AdminUser.id.in_(admin_ids))).all()}
        if admin_ids
        else {}
    )

    evidence: dict = {}
    if period is not None:
        evidence = evidence_hours_for_workers(
            db,
            worker_ids,
            datetime.combine(period.start_date, time.min, tzinfo=timezone.utc),
            datetime.combine(period.end_date, time.max, tzinfo=timezone.utc),
            period_id=period.id,
        )

    responses = []
    for summary in summaries:
        resp = PayrollWorkerSummaryResponse.model_validate(summary)
        worker = workers.get(summary.worker_id)
        if worker:
            resp.worker_display_name = worker.display_name
            resp.worker_country = worker.country
            resp.worker_type = worker.worker_type.value if worker.worker_type else None
            resp.worker_pay_tier = worker.pay_tier
            if worker.admin_user_id:
                admin_user = admins.get(worker.admin_user_id)
                resp.worker_email = admin_user.email if admin_user else None
        if summary.worker_id in evidence:
            hours, incomplete, session_count = evidence[summary.worker_id]
            resp.suggested_hours = hours
            resp.evidence_incomplete = incomplete
            resp.session_count = session_count
        responses.append(resp)
    return responses


@router.get("/history", response_model=list[PayrollHistoryRow])
def payroll_history(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """All saved payslip rows across every working month, newest first."""
    rows = db.exec(
        select(PayrollWorkerSummary, PayrollPeriod, Worker)
        .join(PayrollPeriod, PayrollPeriod.id == PayrollWorkerSummary.payroll_period_id)
        .join(Worker, Worker.id == PayrollWorkerSummary.worker_id)
        .order_by(PayrollPeriod.start_date.desc(), Worker.display_name)
    ).all()
    return [
        PayrollHistoryRow(
            worker_id=worker.id,
            worker_display_name=worker.display_name,
            worker_country=worker.country,
            worker_type=worker.worker_type.value if worker.worker_type else None,
            worker_pay_tier=worker.pay_tier,
            partner_entity_id=worker.partner_entity_id,
            suggested_hours=summary.hours_logged,
            evidence_incomplete=False,
            session_count=0,
            summary=PayrollWorkerSummaryResponse.model_validate(summary),
            period_id=period.id,
            period_label=period.label,
            period_currency=period.currency,
            period_status=period.status,
            period_start_date=period.start_date,
            period_end_date=period.end_date,
        )
        for summary, period, worker in rows
    ]


def _apply_currency_switch(
    summary: PayrollWorkerSummary,
    period: PayrollPeriod,
    new_currency: str | None,
    explicit_fx: Decimal | None,
    db: Session,
) -> None:
    """
    Move a payslip row onto a different payout currency.

    recompute_summary keeps a locked row's stored fx_rate, and every admin edit
    locks the row, so the old currency's rate has to be replaced here or the row
    would keep converting at it.
    """
    if not new_currency:
        return
    code = new_currency.strip().upper()
    if not code or code == summary.local_currency:
        return
    summary.local_currency = code
    if explicit_fx is None:
        summary.fx_rate = payroll_engine._fx_to_local(db, period, code)


@router.get("/periods/{period_id}/summaries", response_model=list[PayrollWorkerSummaryResponse])
def list_period_summaries(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.get(PayrollPeriod, period_id)
    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    return sorted(
        _summary_responses(db, list(summaries), period),
        key=lambda r: (r.worker_display_name or ""),
    )


@router.get("/periods/{period_id}/ledger", response_model=list[LedgerSheetRow])
def period_ledger_sheet(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Anytime finance ledger: all active workers + suggested evidence hours + summary if any."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")

    workers = db.exec(
        select(Worker).where(Worker.status == WorkerStatusEnum.active).order_by(Worker.display_name)
    ).all()
    summaries = {
        s.worker_id: s
        for s in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    }
    start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)

    rows: list[LedgerSheetRow] = []
    for w in workers:
        hours, incomplete, session_count = evidence_hours_for_worker(
            db, w.id, start, end, period_id=period.id,
        )
        summary = summaries.get(w.id)
        rows.append(
            LedgerSheetRow(
                worker_id=w.id,
                worker_display_name=w.display_name,
                worker_country=w.country,
                worker_type=w.worker_type.value if w.worker_type else None,
                worker_pay_tier=w.pay_tier,
                partner_entity_id=w.partner_entity_id,
                suggested_hours=hours,
                evidence_incomplete=incomplete,
                session_count=session_count,
                summary=_summary_response(db, summary, period) if summary else None,
            )
        )
    return rows


@router.post("/periods/{period_id}/summaries/bulk", response_model=list[PayrollWorkerSummaryResponse])
def bulk_upsert_summaries(
    period_id: UUID,
    body: PayrollSummaryBulkRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    if period.status == PayrollPeriodStatusEnum.paid:
        raise HTTPException(status_code=400, detail="This period is already paid.")

    existing = {
        s.worker_id: s
        for s in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    }
    results: list[PayrollWorkerSummary] = []
    for item in body.rows:
        summary = existing.get(item.worker_id)
        if summary is None:
            if not body.upsert:
                continue
            worker = db.get(Worker, item.worker_id)
            if not worker:
                continue
            summary = PayrollWorkerSummary(
                payroll_period_id=period_id,
                worker_id=item.worker_id,
                local_currency=currency_for_country(db, worker.country) or period.currency,
                base_currency=period.currency,
            )
            existing[item.worker_id] = summary

        data = item.model_dump(exclude_unset=True, exclude={"worker_id", "local_currency", "hours_logged"})
        dumped = item.model_dump(exclude_unset=True)
        for key, value in data.items():
            if value is not None:
                setattr(summary, key, value)
        start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
        end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)
        session_hours, _, _ = evidence_hours_for_worker(
            db, item.worker_id, start, end, period_id=period.id,
        )
        summary.hours_logged = item.hours_logged if item.hours_logged is not None else session_hours
        _apply_currency_switch(summary, period, item.local_currency, item.fx_rate, db)
        if "rate_per_hour" not in dumped:
            worker = db.get(Worker, item.worker_id)
            if worker:
                rate_base = payroll_engine._hourly_rate_for(db, worker, period)
                if rate_base is not None:
                    fx = summary.fx_rate or payroll_engine._fx_to_local(
                        db, period, summary.local_currency or period.currency,
                    ) or Decimal("1")
                    summary.rate_per_hour = payroll_engine._q(rate_base * fx)
        if item.admin_locked is None:
            summary.admin_locked = True
        db.add(summary)
        db.flush()
        summary = payroll_engine.recompute_summary(db, summary)
        results.append(summary)

    if period.status == PayrollPeriodStatusEnum.open:
        period.status = PayrollPeriodStatusEnum.calculated
        db.add(period)
        db.commit()

    return _summary_responses(db, list(results), period)


@router.patch("/summaries/{summary_id}", response_model=PayrollWorkerSummaryResponse)
def update_summary(
    summary_id: UUID,
    body: PayrollWorkerSummaryUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Admin cost evaluation: adjust bonus/costs/rate — derived totals recompute."""
    summary = db.get(PayrollWorkerSummary, summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Payroll summary not found")
    period = db.get(PayrollPeriod, summary.payroll_period_id)
    if period and period.status == PayrollPeriodStatusEnum.paid:
        raise HTTPException(status_code=400, detail="This period is already paid.")
    for field, value in body.model_dump(exclude_unset=True, exclude={"local_currency"}).items():
        setattr(summary, field, value)
    if period:
        _apply_currency_switch(summary, period, body.local_currency, body.fx_rate, db)
        if body.hours_logged is None:
            start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
            end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)
            hours, _, _ = evidence_hours_for_worker(
                db, summary.worker_id, start, end, period_id=period.id,
            )
            summary.hours_logged = hours
    if body.model_dump(exclude_unset=True):
        summary.admin_locked = True if body.admin_locked is not False else summary.admin_locked
        if body.admin_locked is None:
            summary.admin_locked = True
    summary = payroll_engine.recompute_summary(db, summary)
    return _summary_response(db, summary, period)


@router.get("/my-summaries", response_model=list[PayrollWorkerSummaryResponse])
def my_payroll_history(
    include_pending: bool = False,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """
    Worker payslip history for the wallet page, newest period first.

    Approved and paid periods are always included. `include_pending` also returns
    calculated periods, so a worker can preview the month before it is approved.
    """
    worker = get_worker_for_user(db, current_user)
    statuses = [PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid]
    if include_pending:
        statuses.append(PayrollPeriodStatusEnum.calculated)
    rows = db.exec(
        select(PayrollWorkerSummary, PayrollPeriod)
        .join(PayrollPeriod, PayrollPeriod.id == PayrollWorkerSummary.payroll_period_id)
        .where(
            PayrollWorkerSummary.worker_id == worker.id,
            PayrollPeriod.status.in_(statuses),
        )
        .order_by(PayrollPeriod.start_date.desc())
    ).all()
    result = []
    for summary, period in rows:
        resp = PayrollWorkerSummaryResponse.model_validate(summary)
        resp.period_label = period.label
        resp.period_status = period.status.value
        result.append(resp)
    return result


@router.get("/my-overview", response_model=WorkerPayrollOverviewResponse)
def my_payroll_overview(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Current payroll period, pay tier, and applicable rate for the worker payments page."""
    worker = get_worker_for_user(db, current_user)
    periods = db.exec(select(PayrollPeriod).order_by(PayrollPeriod.start_date.desc())).all()
    current = resolve_current_period(db)

    rate_amount = None
    rate_currency = None
    if current:
        rate_entry = payroll_engine._rate_entry_for(db, worker, current)
        if rate_entry is not None:
            rate_amount = rate_entry.amount
            rate_currency = rate_entry.currency
            local_currency = currency_for_country(db, worker.country)
            # Workers see the rate they will actually be paid in. The payroll
            # engine uses the same resolver, including the live FX fallback.
            fx = payroll_engine._fx_to_local(db, current, local_currency)
            if fx is not None and fx > 0:
                rate_amount = payroll_engine._q(rate_entry.amount * fx)
                rate_currency = local_currency

    period_summary = None
    if current:
        summary = db.exec(
            select(PayrollWorkerSummary).where(
                PayrollWorkerSummary.payroll_period_id == current.id,
                PayrollWorkerSummary.worker_id == worker.id,
            )
        ).first()
        if summary and current.status in (
            PayrollPeriodStatusEnum.calculated,
            PayrollPeriodStatusEnum.approved,
            PayrollPeriodStatusEnum.paid,
        ):
            period_summary = PayrollWorkerSummaryResponse.model_validate(summary)
            period_summary.period_label = current.label

    return WorkerPayrollOverviewResponse(
        pay_tier=worker.pay_tier or "unassigned",
        rate_per_hour=rate_amount,
        rate_currency=rate_currency,
        current_period=PayrollPeriodResponse.model_validate(current) if current else None,
        period_summary=period_summary,
    )



# ── Payslip PDFs ───────────────────────────────────────────────────────────────

def _pdf_for_summary(db: Session, summary: PayrollWorkerSummary, period: PayrollPeriod) -> tuple[str, bytes]:
    worker = db.get(Worker, summary.worker_id)
    name = worker.display_name if worker else "Worker"
    return render_payslip_pdf(summary=summary, period=period, worker_name=name)


@router.post("/periods/{period_id}/payslips/generate")
def generate_period_payslip_pdfs(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Build cached PDFs for every payslip in the period so email/preview can reuse them."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    try:
        return generate_period_pdfs(db, period_id, force=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/summaries/{summary_id}/payslip.pdf")
def download_payslip_pdf(
    summary_id: UUID,
    inline: bool = Query(False),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    summary = db.get(PayrollWorkerSummary, summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Payroll summary not found")
    period = db.get(PayrollPeriod, summary.payroll_period_id)
    filename, pdf = _pdf_for_summary(db, summary, period)
    disposition = "inline" if inline else "attachment"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
    )


@router.get("/my-summaries/{summary_id}/payslip.pdf")
def download_my_payslip_pdf(
    summary_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """
    Worker download of their own payslip. Separate from the admin route so the
    ownership check cannot be bypassed by guessing a summary id.
    """
    worker = get_worker_for_user(db, current_user)
    summary = db.get(PayrollWorkerSummary, summary_id)
    if not summary or summary.worker_id != worker.id:
        raise HTTPException(status_code=404, detail="Payslip not found")

    period = db.get(PayrollPeriod, summary.payroll_period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    # Mirrors /my-summaries: an open period has no payslip to publish yet.
    if period.status not in (
        PayrollPeriodStatusEnum.calculated,
        PayrollPeriodStatusEnum.approved,
        PayrollPeriodStatusEnum.paid,
    ):
        raise HTTPException(status_code=404, detail="Payslip is not available yet")

    filename, pdf = _pdf_for_summary(db, summary, period)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/periods/{period_id}/payslips.zip")
def download_period_payslips(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Bulk payslip export: one PDF per worker, zipped."""
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    if not summaries:
        raise HTTPException(status_code=400, detail="No payslips — calculate the period first.")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for summary in summaries:
            filename, pdf = _pdf_for_summary(db, summary, period)
            zf.writestr(filename, pdf)

    period.export_generated_at = datetime.now(timezone.utc)
    db.add(period)
    db.commit()

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="payslips-{period.label.replace(" ", "-")}.zip"'},
    )


# ── Reports ────────────────────────────────────────────────────────────────────

@router.get("/periods/{period_id}/reports/payroll")
def payroll_report(
    period_id: UUID,
    format: str = "json",
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    rows = _summary_responses(
        db,
        list(db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()),
        period,
    )
    rows.sort(key=lambda r: r.worker_display_name or "")

    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow([
            "Worker", "Country", "Type", "Hours", "Rate/hr", "Base Pay", "Bonus", "Gross",
            "Transfer Cost", "External Cost", "Total Deductions", "Final Net",
            "Currency", f"{period.currency} Equivalent", "FX Rate",
        ])
        for r in rows:
            writer.writerow([
                r.worker_display_name, r.worker_country, r.worker_type, r.hours_logged,
                r.rate_per_hour, r.base_pay, r.bonus, r.gross_earned, r.transfer_cost,
                r.external_cost, r.total_deductions, r.final_net, r.local_currency,
                r.base_equivalent, r.fx_rate,
            ])
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="payroll-{period.label.replace(" ", "-")}.csv"'},
        )
    return rows


@router.get("/periods/{period_id}/reports/revenue-share")
def revenue_share_report(
    period_id: UUID,
    format: str = "json",
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Client earnings + GS/owner revenue split (after worker costs)."""
    try:
        rows = payroll_engine.client_revenue_report(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if format == "csv":
        period = db.get(PayrollPeriod, period_id)
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow([
            "Client", "Platform", "Earnings", "Earnings Source", "Worker Cost", "Distributable",
            "GS %", "Owner %", "GS Share", "Owner Share",
        ])
        for r in rows:
            writer.writerow([
                r["client_name"], r["platform"], r["earnings"], r["earnings_source"], r["worker_cost"],
                r["distributable"], r["gs_pct"], r["owner_pct"], r["gs_share"], r["owner_share"],
            ])
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="revenue-share-{period.label.replace(" ", "-")}.csv"'},
        )
    return rows


@router.get("/periods/{period_id}/reports/rdp-earnings")
def rdp_earnings_report(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Hours × worker rate per RDP, rolled up per owner for the payment month."""
    try:
        return payroll_engine.rdp_earnings_report(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
