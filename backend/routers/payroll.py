import csv
import io
import zipfile
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.admin_users import AdminUser
from models.enums import PayrollPeriodStatusEnum
from models.payroll import CountryCostPool, PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.worker import Worker
from schemas.payroll import (
    CountryCostPoolResponse,
    CountryCostPoolUpsert,
    PayrollLineItemCreate,
    PayrollLineItemResponse,
    PayrollLineItemUpdate,
    PayrollPeriodCreate,
    PayrollPeriodResponse,
    PayrollPeriodUpdate,
    PayrollWorkerSummaryResponse,
    PayrollWorkerSummaryUpdate,
    WorkerPayrollOverviewResponse,
)
from services import payroll_engine
from services.payslip_pdf import build_payslip_pdf, payslip_rows
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


@router.get("/periods", response_model=list[PayrollPeriodResponse])
def list_payroll_periods(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
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
    period = PayrollPeriod(**body.model_dump())
    db.add(period)
    db.commit()
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

    apply_update(period, body)
    db.add(period)
    db.commit()
    db.refresh(period)
    return period


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
        return payroll_engine.calculate_period(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/periods/{period_id}/approve", response_model=PayrollPeriodResponse)
def approve_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    try:
        return payroll_engine.approve_period(db, period_id, admin.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


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

def _summary_response(db: Session, summary: PayrollWorkerSummary) -> PayrollWorkerSummaryResponse:
    resp = PayrollWorkerSummaryResponse.model_validate(summary)
    worker = db.get(Worker, summary.worker_id)
    if worker:
        resp.worker_display_name = worker.display_name
        resp.worker_country = worker.country
        resp.worker_type = worker.worker_type.value if worker.worker_type else None
        if worker.admin_user_id:
            admin_user = db.get(AdminUser, worker.admin_user_id)
            resp.worker_email = admin_user.email if admin_user else None
    return resp


@router.get("/periods/{period_id}/summaries", response_model=list[PayrollWorkerSummaryResponse])
def list_period_summaries(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    summaries = db.exec(
        select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    return sorted(
        (_summary_response(db, s) for s in summaries),
        key=lambda r: (r.worker_display_name or ""),
    )


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
    apply_update(summary, body)
    summary = payroll_engine.recompute_summary(db, summary)
    return _summary_response(db, summary)


@router.get("/my-summaries", response_model=list[PayrollWorkerSummaryResponse])
def my_payroll_history(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Worker payslip history (approved/paid periods only) for the wallet page."""
    worker = get_worker_for_user(db, current_user)
    rows = db.exec(
        select(PayrollWorkerSummary, PayrollPeriod)
        .join(PayrollPeriod, PayrollPeriod.id == PayrollWorkerSummary.payroll_period_id)
        .where(
            PayrollWorkerSummary.worker_id == worker.id,
            PayrollPeriod.status.in_([PayrollPeriodStatusEnum.approved, PayrollPeriodStatusEnum.paid]),
        )
        .order_by(PayrollPeriod.start_date.desc())
    ).all()
    result = []
    for summary, period in rows:
        resp = PayrollWorkerSummaryResponse.model_validate(summary)
        resp.period_label = period.label
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
    today = date.today()

    current = next((p for p in periods if p.start_date <= today <= p.end_date), None)
    if not current:
        current = next(
            (p for p in periods if p.status != PayrollPeriodStatusEnum.paid),
            None,
        )
    if not current and periods:
        current = periods[0]

    rate_amount = None
    rate_currency = None
    if current:
        rate_entry = payroll_engine._rate_entry_for(db, worker, current)
        if rate_entry is not None:
            rate_amount = rate_entry.amount
            rate_currency = rate_entry.currency

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


# ── Country cost pools ─────────────────────────────────────────────────────────

@router.get("/periods/{period_id}/cost-pools", response_model=list[CountryCostPoolResponse])
def list_cost_pools(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(CountryCostPool).where(CountryCostPool.payroll_period_id == period_id)
    ).all()


@router.put("/periods/{period_id}/cost-pools", response_model=list[CountryCostPoolResponse])
def upsert_cost_pools(
    period_id: UUID,
    body: list[CountryCostPoolUpsert],
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(PayrollPeriod, period_id):
        raise HTTPException(status_code=404, detail="Payroll period not found")
    existing = {
        p.country: p
        for p in db.exec(
            select(CountryCostPool).where(CountryCostPool.payroll_period_id == period_id)
        ).all()
    }
    for item in body:
        pool = existing.get(item.country)
        if pool:
            pool.transfer_cost_total = item.transfer_cost_total
            pool.external_cost_total = item.external_cost_total
            pool.note = item.note
        else:
            pool = CountryCostPool(payroll_period_id=period_id, **item.model_dump())
        db.add(pool)
    db.commit()
    return db.exec(
        select(CountryCostPool).where(CountryCostPool.payroll_period_id == period_id)
    ).all()


# ── Payslip PDFs ───────────────────────────────────────────────────────────────

def _pdf_for_summary(db: Session, summary: PayrollWorkerSummary, period: PayrollPeriod) -> tuple[str, bytes]:
    worker = db.get(Worker, summary.worker_id)
    name = worker.display_name if worker else "Worker"
    pdf = build_payslip_pdf(
        worker_name=name,
        period_label=period.label,
        local_currency=summary.local_currency,
        base_currency=summary.base_currency or period.currency,
        rows=payslip_rows(summary),
    )
    filename = f"payslip-{period.label.replace(' ', '-')}-{name.replace(' ', '-')}.pdf"
    return filename, pdf


@router.get("/summaries/{summary_id}/payslip.pdf")
def download_payslip_pdf(
    summary_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    summary = db.get(PayrollWorkerSummary, summary_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Payroll summary not found")
    period = db.get(PayrollPeriod, summary.payroll_period_id)
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
    rows = [
        _summary_response(db, s)
        for s in db.exec(
            select(PayrollWorkerSummary).where(PayrollWorkerSummary.payroll_period_id == period_id)
        ).all()
    ]
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
            "Client", "Platform", "Earnings", "Worker Cost", "Distributable",
            "GS %", "Owner %", "GS Share", "Owner Share",
        ])
        for r in rows:
            writer.writerow([
                r["client_name"], r["platform"], r["earnings"], r["worker_cost"],
                r["distributable"], r["gs_pct"], r["owner_pct"], r["gs_share"], r["owner_share"],
            ])
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="revenue-share-{period.label.replace(" ", "-")}.csv"'},
        )
    return rows
