import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import PayrollPeriodStatusEnum, WalletTxTypeEnum
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.wallet import Wallet, WalletTransaction
from models.worker import Worker
from schemas.wallet import (
    PayoutPeriod,
    PayoutRow,
    PayoutSendRequest,
    PayoutSendResponse,
    WalletAdjustmentCreate,
    WalletResponse,
    WalletTransactionResponse,
)
from services import payroll_engine
from services.audit_service import record_audit
from services.fx import convert_amount, currency_symbol
from services.payroll_engine import payout_currency_for_worker
from services.payslip_pdf import generate_period_pdfs
from .deps import get_admin_user, get_worker_for_user

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_or_create_wallet(db: Session, worker: Worker) -> Wallet:
    local_currency = payout_currency_for_worker(db, worker)
    wallet = db.exec(select(Wallet).where(Wallet.worker_id == worker.id)).first()
    if not wallet:
        wallet = Wallet(worker_id=worker.id, currency=local_currency)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    elif Decimal(wallet.balance) == 0 and wallet.currency != local_currency:
        # A zero-balance wallet has no value to convert, so it can safely adopt
        # the worker's payout currency after their tier or profile changes.
        wallet.currency = local_currency
        wallet.updated_at = datetime.now(timezone.utc)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


def _wallet_response(db: Session, worker: Worker, wallet: Wallet) -> WalletResponse:
    """Answer with what the account says, not only what the row remembers.

    The stored ``currency`` is the ledger's: once money has moved through a
    wallet it cannot be relabelled. But a worker whose profile says Kenya must
    never be shown USD just because the row predates that profile, so the
    currency their country maps to travels with every response and the display
    follows it.
    """
    local = payout_currency_for_worker(db, worker)
    display = wallet.currency if Decimal(wallet.balance) != 0 else local
    payload = WalletResponse.model_validate(wallet)
    return payload.model_copy(
        update={
            "currency": display,
            "worker_display_name": worker.display_name,
            "worker_country": worker.country,
            "local_currency": local,
            "currency_symbol": currency_symbol(db, display),
        }
    )


def _tx_responses(db: Session, transactions: list[WalletTransaction]) -> list[WalletTransactionResponse]:
    period_ids = {t.payroll_period_id for t in transactions if t.payroll_period_id}
    periods: dict = {}
    summaries: dict = {}
    if period_ids:
        periods = {
            p.id: p
            for p in db.exec(select(PayrollPeriod).where(PayrollPeriod.id.in_(period_ids))).all()
        }
        worker_ids = {t.worker_id for t in transactions}
        summaries = {
            (s.payroll_period_id, s.worker_id): s
            for s in db.exec(
                select(PayrollWorkerSummary).where(
                    PayrollWorkerSummary.payroll_period_id.in_(period_ids),
                    PayrollWorkerSummary.worker_id.in_(worker_ids),
                )
            ).all()
        }
    result = []
    for t in transactions:
        resp = WalletTransactionResponse.model_validate(t)
        period = periods.get(t.payroll_period_id) if t.payroll_period_id else None
        if period:
            resp.period_label = period.label
            resp.period_start = period.start_date
            resp.period_end = period.end_date
        summary = summaries.get((t.payroll_period_id, t.worker_id))
        if summary and t.tx_type == WalletTxTypeEnum.payroll_credit:
            resp.hours_logged = summary.hours_logged
            resp.rate_per_hour = summary.rate_per_hour
            resp.rate_currency = summary.local_currency
        result.append(resp)
    return result


# ── Worker side ────────────────────────────────────────────────────────────────

@router.get("/me", response_model=WalletResponse)
def get_my_wallet(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return _wallet_response(db, worker, _get_or_create_wallet(db, worker))


@router.get("/me/transactions", response_model=list[WalletTransactionResponse])
def get_my_transactions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    transactions = db.exec(
        select(WalletTransaction)
        .where(WalletTransaction.worker_id == worker.id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(200)
    ).all()
    return _tx_responses(db, transactions)


# ── Admin side ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[WalletResponse])
def list_wallets(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    workers = db.exec(select(Worker).order_by(Worker.display_name)).all()
    wallets = {w.worker_id: w for w in db.exec(select(Wallet)).all()}
    # Same derivation as the worker's own view, so an admin reading the roster
    # never sees a different currency from the one the worker is shown.
    return [
        _wallet_response(db, worker, wallets.get(worker.id) or _get_or_create_wallet(db, worker))
        for worker in workers
    ]


@router.get("/payouts", response_model=list[PayoutPeriod])
def list_payouts(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Calculated pay per month, with who has already been sent their money."""
    periods = db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.status.in_([
            PayrollPeriodStatusEnum.calculated,
            PayrollPeriodStatusEnum.approved,
            PayrollPeriodStatusEnum.paid,
        ]))
        .order_by(PayrollPeriod.start_date.desc())
    ).all()
    if not periods:
        return []
    period_ids = [p.id for p in periods]
    summaries = db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id.in_(period_ids),
            PayrollWorkerSummary.final_net > 0,
        )
    ).all()
    credits = {
        (t.payroll_period_id, t.worker_id): t.created_at
        for t in db.exec(
            select(WalletTransaction).where(
                WalletTransaction.payroll_period_id.in_(period_ids),
                WalletTransaction.tx_type == WalletTxTypeEnum.payroll_credit,
            )
        ).all()
    }
    workers = {w.id: w for w in db.exec(select(Worker)).all()}

    by_period: dict = {}
    for s in summaries:
        worker = workers.get(s.worker_id)
        by_period.setdefault(s.payroll_period_id, []).append(PayoutRow(
            worker_id=s.worker_id,
            worker_display_name=worker.display_name if worker else "Unknown worker",
            worker_country=worker.country if worker else None,
            hours_logged=s.hours_logged,
            rate_per_hour=s.rate_per_hour,
            amount=s.final_net,
            currency=s.local_currency,
            sent_at=credits.get((s.payroll_period_id, s.worker_id)),
        ))

    result = []
    for p in periods:
        rows = by_period.get(p.id)
        if not rows:
            continue
        rows.sort(key=lambda r: r.worker_display_name.lower())
        result.append(PayoutPeriod(
            period_id=p.id,
            label=p.label,
            status=p.status.value,
            start_date=p.start_date,
            end_date=p.end_date,
            rows=rows,
        ))
    return result


@router.post("/payouts/send", response_model=PayoutSendResponse)
def send_payouts(
    body: PayoutSendRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """
    Credit calculated pay into worker wallets. A calculated month is approved
    first, which freezes its exchange rates. Already-paid workers are skipped.
    """
    period = db.get(PayrollPeriod, body.period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    admin = get_admin_user(db, current_user)

    approved = False
    if period.status == PayrollPeriodStatusEnum.calculated:
        try:
            payroll_engine.approve_period(db, period.id, admin.id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        approved = True
        try:
            generate_period_pdfs(db, period.id, force=True)
        except Exception:
            logger.exception("Payslip PDF generation after wallet send failed")

    try:
        result = payroll_engine.push_period_to_wallets(db, period.id, admin.id, body.worker_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    record_audit(
        db,
        action="wallets.payroll_sent",
        target_type="payroll_period",
        target_id=period.id,
        actor_id=admin.id,
        new_value={
            "period": period.label,
            "credited": result.get("credited", 0),
            "skipped": result.get("skipped", 0),
            "approved_first": approved,
        },
    )
    db.commit()
    return PayoutSendResponse(
        credited=result.get("credited", 0),
        skipped=result.get("skipped", 0),
        approved=approved,
        skipped_no_fx=result.get("skipped_no_fx", []),
    )


@router.get("/{worker_id}/transactions", response_model=list[WalletTransactionResponse])
def list_worker_transactions(
    worker_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    transactions = db.exec(
        select(WalletTransaction)
        .where(WalletTransaction.worker_id == worker_id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(200)
    ).all()
    return _tx_responses(db, transactions)


@router.post("/adjustments", response_model=WalletTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_adjustment(
    body: WalletAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Manual admin credit (positive) or debit (negative) with a mandatory note."""
    if not body.note.strip():
        raise HTTPException(status_code=400, detail="A reason note is required for wallet adjustments.")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="Amount cannot be zero.")

    worker = db.get(Worker, body.worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")

    admin = get_admin_user(db, current_user)
    wallet = _get_or_create_wallet(db, worker)
    wallet_currency = (wallet.currency or "USD").upper()
    currency = (body.currency or wallet_currency).upper()
    amount = Decimal(body.amount)
    note = body.note.strip()
    if currency != wallet_currency:
        # The balance holds one currency, so credits in another are converted.
        converted, rate, _ = convert_amount(db, amount, currency, wallet_currency)
        if converted is None:
            raise HTTPException(
                status_code=400,
                detail=f"No exchange rate from {currency} to {wallet_currency}. Add one under FX rates first.",
            )
        converted = converted.quantize(Decimal("0.01"))
        note = f"{note} ({body.amount} {currency} @ {rate})"
        amount, currency = converted, wallet_currency

    tx_type = WalletTxTypeEnum.adjustment if amount > 0 else WalletTxTypeEnum.payout
    tx = WalletTransaction(
        wallet_id=wallet.id,
        worker_id=worker.id,
        tx_type=tx_type,
        amount=amount,
        currency=currency,
        note=note,
        created_by=admin.id,
    )
    wallet.balance = Decimal(wallet.balance) + amount
    wallet.updated_at = datetime.now(timezone.utc)
    db.add(tx)
    db.add(wallet)
    db.commit()
    db.refresh(tx)
    return WalletTransactionResponse.model_validate(tx)
