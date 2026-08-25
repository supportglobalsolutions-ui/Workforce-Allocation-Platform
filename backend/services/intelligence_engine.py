"""Leadership intelligence snapshot.

Each domain (finance, RDP, quality, time, owners) loads on its own. A failure
in one source is recorded and rolled back; the others still return. The engine
does not call HTTP — it reads the same tables the payroll and quality engines use.
"""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any, Callable
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client
from models.payroll import PayrollLineItem, PayrollPeriod, PayrollWorkerSummary
from models.quality import QualityCompositeScore
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker
from services.client_owners import client_owner_name
from services import payroll_engine

logger = logging.getLogger(__name__)


def _uid(value: Any) -> str | None:
    return str(value) if value is not None else None


def _dec(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _enum(value: Any) -> str | None:
    if value is None:
        return None
    return getattr(value, "value", str(value))


def _isolate(db: Session, label: str, empty: Any, run: Callable[[], Any]) -> dict[str, Any]:
    try:
        return {"ok": True, "data": run(), "error": None}
    except Exception as exc:
        logger.exception("intelligence source failed: %s", label)
        try:
            db.rollback()
        except Exception:
            logger.exception("intelligence rollback failed after %s", label)
        return {"ok": False, "data": empty, "error": f"{label}: {exc}"}


def _payslips(db: Session, period_id: UUID) -> list[dict[str, Any]]:
    rows = db.exec(
        select(PayrollWorkerSummary, Worker)
        .join(Worker, Worker.id == PayrollWorkerSummary.worker_id)
        .where(PayrollWorkerSummary.payroll_period_id == period_id)
    ).all()
    out = []
    for summary, worker in rows:
        out.append({
            "id": _uid(summary.id),
            "worker_id": _uid(summary.worker_id),
            "worker_display_name": worker.display_name,
            "hours_logged": _dec(summary.hours_logged),
            "rate_per_hour": _dec(summary.rate_per_hour),
            "gross_earned": _dec(summary.gross_earned),
            "final_net": _dec(summary.final_net),
            "total_deductions": _dec(summary.total_deductions),
            "local_currency": summary.local_currency,
            "session_count": None,
        })
    out.sort(key=lambda r: r["worker_display_name"] or "")
    return out


def _line_items(db: Session, period_id: UUID) -> list[dict[str, Any]]:
    rows = db.exec(
        select(PayrollLineItem).where(PayrollLineItem.payroll_period_id == period_id)
    ).all()
    return [
        {
            "id": _uid(li.id),
            "session_id": _uid(li.session_id),
            "worker_id": _uid(li.worker_id),
            "payroll_period_id": _uid(li.payroll_period_id),
            "gross_amount": _dec(li.gross_amount),
            "worker_net": _dec(li.worker_net),
        }
        for li in rows
    ]


def serialize_session(s: WorkSession) -> dict[str, Any]:
    return {
        "id": _uid(s.id),
        "worker_id": _uid(s.worker_id),
        "rdp_resource_id": _uid(s.rdp_resource_id),
        "client_id": _uid(s.client_id),
        "start_time": _iso(s.start_time),
        "end_time": _iso(s.end_time),
        "image_start_at": _iso(s.image_start_at),
        "image_end_at": _iso(s.image_end_at),
        "payroll_period_id": _uid(s.payroll_period_id),
    }


def fetch_sessions_in_range(db: Session, start: datetime, end: datetime) -> list[dict[str, Any]]:
    rows = db.exec(
        select(WorkSession).where(
            WorkSession.start_time >= start,
            WorkSession.start_time < end,
        )
    ).all()
    return [serialize_session(s) for s in rows]


def _sessions(db: Session, period: PayrollPeriod) -> list[dict[str, Any]]:
    start = datetime.combine(period.start_date, time.min, tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, time.max, tzinfo=timezone.utc)
    return fetch_sessions_in_range(db, start, end + timedelta(microseconds=1))


def _quality(db: Session, period_id: UUID) -> list[dict[str, Any]]:
    rows = db.exec(
        select(QualityCompositeScore).where(QualityCompositeScore.payroll_period_id == period_id)
    ).all()
    if not rows:
        rows = db.exec(
            select(QualityCompositeScore).order_by(QualityCompositeScore.calculated_at.desc())
        ).all()
    return [
        {
            "id": _uid(q.id),
            "worker_id": _uid(q.worker_id),
            "composite_score": _dec(q.composite_score),
            "payroll_period_id": _uid(q.payroll_period_id),
            "calculated_at": _iso(q.calculated_at),
        }
        for q in rows
    ]


def _clients(db: Session) -> list[dict[str, Any]]:
    rows = db.exec(select(Client).order_by(Client.name)).all()
    return [
        {
            "id": _uid(c.id),
            "name": c.name,
            "platform": c.platform,
            "owner_type": _enum(c.owner_type),
            "owner_worker_id": _uid(c.owner_worker_id),
            "owner_partner_entity_id": _uid(c.owner_partner_entity_id),
            "owner_name": client_owner_name(db, c),
            "contract_status": _enum(c.contract_status),
        }
        for c in rows
    ]


def _rdps(db: Session) -> list[dict[str, Any]]:
    rows = db.exec(select(RDPResource).order_by(RDPResource.nickname)).all()
    return [
        {
            "id": _uid(r.id),
            "nickname": r.nickname,
            "country": r.country,
            "client_id": _uid(r.client_id),
            "status": _enum(r.status),
            "assigned_worker_id": _uid(r.assigned_worker_id),
        }
        for r in rows
    ]


def _workers(db: Session) -> list[dict[str, Any]]:
    rows = db.exec(select(Worker).order_by(Worker.display_name)).all()
    return [
        {
            "id": _uid(w.id),
            "display_name": w.display_name,
            "country": w.country,
            "status": _enum(w.status),
            "worker_type": _enum(w.worker_type),
            "partner_entity_id": _uid(w.partner_entity_id),
        }
        for w in rows
    ]


def build_snapshot(db: Session, period_id: UUID) -> dict[str, Any]:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    payslips = _isolate(db, "payslips", [], lambda: _payslips(db, period_id))
    revenue_share = _isolate(
        db, "client revenue", [], lambda: payroll_engine.client_revenue_report(db, period_id)
    )
    rdp_earnings = _isolate(
        db,
        "rdp earnings",
        {"currency": period.currency or "USD", "rdps": [], "owners": []},
        lambda: payroll_engine.rdp_earnings_report(db, period_id),
    )
    line_items = _isolate(db, "line items", [], lambda: _line_items(db, period_id))
    sessions = _isolate(db, "sessions", [], lambda: _sessions(db, period))
    quality = _isolate(db, "quality", [], lambda: _quality(db, period_id))
    clients = _isolate(db, "clients", [], lambda: _clients(db))
    rdps = _isolate(db, "rdps", [], lambda: _rdps(db))
    workers = _isolate(db, "workers", [], lambda: _workers(db))

    sources = [
        payslips, revenue_share, rdp_earnings, line_items, sessions,
        quality, clients, rdps, workers,
    ]
    warnings = [s["error"] for s in sources if not s["ok"] and s.get("error")]

    return {
        "period_id": str(period_id),
        "payslips": payslips,
        "revenue_share": revenue_share,
        "rdp_earnings": rdp_earnings,
        "line_items": line_items,
        "sessions": sessions,
        "quality": quality,
        "clients": clients,
        "rdps": rdps,
        "workers": workers,
        "warnings": warnings,
    }
