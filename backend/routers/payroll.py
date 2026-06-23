from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.permissions import require_admin
from models.payroll import PayrollLineItem, PayrollPeriod
from schemas.payroll import (
    PayrollLineItemCreate,
    PayrollLineItemResponse,
    PayrollLineItemUpdate,
    PayrollPeriodCreate,
    PayrollPeriodResponse,
    PayrollPeriodUpdate,
)
from .deps import apply_update

router = APIRouter()


# ── Payroll periods ───────────────────────────────────────────────────────────

@router.get("/periods", response_model=list[PayrollPeriodResponse])
def list_payroll_periods(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.query(PayrollPeriod).order_by(PayrollPeriod.start_date.desc()).all()


@router.get("/periods/{period_id}", response_model=PayrollPeriodResponse)
def get_payroll_period(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
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
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    apply_update(period, body)
    db.commit()
    db.refresh(period)
    return period


# ── Payroll line items ────────────────────────────────────────────────────────

@router.get("/line-items", response_model=list[PayrollLineItemResponse])
def list_payroll_line_items(
    payroll_period_id: UUID | None = None,
    worker_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    query = db.query(PayrollLineItem)
    if payroll_period_id:
        query = query.filter(PayrollLineItem.payroll_period_id == payroll_period_id)
    if worker_id:
        query = query.filter(PayrollLineItem.worker_id == worker_id)
    return query.order_by(PayrollLineItem.created_at.desc()).all()


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
    item = db.query(PayrollLineItem).filter(PayrollLineItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll line item not found")

    apply_update(item, body)
    db.commit()
    db.refresh(item)
    return item
