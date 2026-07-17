from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import WalletTxTypeEnum
from models.payroll import PayrollPeriod
from models.wallet import Wallet, WalletTransaction
from models.worker import Worker
from schemas.wallet import WalletAdjustmentCreate, WalletResponse, WalletTransactionResponse
from services.fx import currency_for_country
from .deps import get_admin_user, get_worker_for_user

router = APIRouter()


def _get_or_create_wallet(db: Session, worker: Worker) -> Wallet:
    wallet = db.exec(select(Wallet).where(Wallet.worker_id == worker.id)).first()
    if not wallet:
        wallet = Wallet(worker_id=worker.id, currency=currency_for_country(db, worker.country))
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


def _tx_responses(db: Session, transactions: list[WalletTransaction]) -> list[WalletTransactionResponse]:
    period_ids = {t.payroll_period_id for t in transactions if t.payroll_period_id}
    labels = {}
    if period_ids:
        labels = {
            p.id: p.label
            for p in db.exec(select(PayrollPeriod).where(PayrollPeriod.id.in_(period_ids))).all()
        }
    result = []
    for t in transactions:
        resp = WalletTransactionResponse.model_validate(t)
        if t.payroll_period_id:
            resp.period_label = labels.get(t.payroll_period_id)
        result.append(resp)
    return result


# ── Worker side ────────────────────────────────────────────────────────────────

@router.get("/me", response_model=WalletResponse)
def get_my_wallet(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return _get_or_create_wallet(db, worker)


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
    result = []
    for worker in workers:
        wallet = wallets.get(worker.id) or _get_or_create_wallet(db, worker)
        resp = WalletResponse.model_validate(wallet)
        resp.worker_display_name = worker.display_name
        resp.worker_country = worker.country
        result.append(resp)
    return result


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
    currency = (body.currency or wallet.currency).upper()

    tx_type = WalletTxTypeEnum.adjustment if body.amount > 0 else WalletTxTypeEnum.payout
    tx = WalletTransaction(
        wallet_id=wallet.id,
        worker_id=worker.id,
        tx_type=tx_type,
        amount=body.amount,
        currency=currency,
        note=body.note.strip(),
        created_by=admin.id,
    )
    wallet.balance = Decimal(wallet.balance) + body.amount
    wallet.updated_at = datetime.now(timezone.utc)
    db.add(tx)
    db.add(wallet)
    db.commit()
    db.refresh(tx)
    return WalletTransactionResponse.model_validate(tx)
