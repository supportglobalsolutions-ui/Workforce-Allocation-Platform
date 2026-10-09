"""'Use tier' on payslip rows pays the worker's own tier, or refuses when there is none."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from models.payroll import PayrollPeriod, PayrollPeriodStatusEnum, PayrollWorkerSummary
from models.worker import Worker
from routers import payroll as payroll_router
from schemas.payroll import PayrollSummaryBulkItem, PayrollSummaryBulkRequest
from services import payroll_engine


class _FakeDB:
    def __init__(self, period, workers, summaries):
        self.period = period
        self.workers = {w.id: w for w in workers}
        self.summaries = summaries

    def get(self, model, key):
        if model is PayrollPeriod:
            return self.period if key == self.period.id else None
        if model is Worker:
            return self.workers.get(key)
        return None

    def exec(self, _stmt):
        return SimpleNamespace(all=lambda: list(self.summaries))

    def add(self, _obj):
        pass

    def flush(self):
        pass

    def commit(self):
        pass


def _setup(monkeypatch, terms_by_worker):
    period = SimpleNamespace(
        id=uuid4(), currency="USD", status=PayrollPeriodStatusEnum.calculated,
        start_date=date(2026, 9, 1), end_date=date(2026, 9, 30),
    )
    monkeypatch.setattr(payroll_engine, "pay_terms", lambda db, w, p: terms_by_worker[w.id])
    monkeypatch.setattr(payroll_engine, "_fx_to_local", lambda db, p, c: Decimal("3700"))
    monkeypatch.setattr(payroll_engine, "recompute_summary", lambda db, s: s)
    monkeypatch.setattr(payroll_router, "_payslip_hours", lambda *a, **k: Decimal("10"))
    monkeypatch.setattr(payroll_router, "_summary_responses", lambda db, rows, p: rows)
    return period


def test_use_tier_applies_own_tier_and_unlocks(monkeypatch):
    worker = SimpleNamespace(id=uuid4(), display_name="Amina", country="Uganda")
    terms = payroll_engine.PayTerms(
        currency="UGX", rate_local=Decimal("5000"), rate_base=None, fx=Decimal("3700"),
    )
    period = _setup(monkeypatch, {worker.id: terms})
    summary = PayrollWorkerSummary(
        payroll_period_id=period.id, worker_id=worker.id, local_currency="USD",
        rate_per_hour=Decimal("9"), admin_locked=True, base_currency="USD",
    )
    db = _FakeDB(period, [worker], [summary])
    body = PayrollSummaryBulkRequest(rows=[
        PayrollSummaryBulkItem(worker_id=worker.id, use_tier=True, rate_per_hour=Decimal("1")),
    ])

    payroll_router.bulk_upsert_summaries(period.id, body, db, {})

    assert summary.rate_per_hour == Decimal("5000.00")
    assert summary.local_currency == "UGX"
    assert summary.admin_locked is False


def test_use_tier_without_tier_is_refused(monkeypatch):
    worker = SimpleNamespace(id=uuid4(), display_name="Brian", country="Kenya")
    terms = payroll_engine.PayTerms(currency="KES", rate_local=None, rate_base=None, fx=None)
    period = _setup(monkeypatch, {worker.id: terms})
    db = _FakeDB(period, [worker], [])
    body = PayrollSummaryBulkRequest(rows=[PayrollSummaryBulkItem(worker_id=worker.id, use_tier=True)])

    with pytest.raises(HTTPException) as exc:
        payroll_router.bulk_upsert_summaries(period.id, body, db, {})

    assert exc.value.status_code == 400
    assert exc.value.detail.startswith("No tier allocated: Brian")
