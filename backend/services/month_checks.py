"""
Month checks: mismatches that block approving a working month.

    - a finished session with hours but no client linked (client income needs this)
    - hours on a desktop that is not linked to a client
    - a session on a desktop the worker is not linked to
    - a session with no desktop that an admin did not add
    - a client split whose % do not add up to 100 or whose amounts do not add up to the net
    - a payee with an amount but no payout details
    - (warning only) a session linked to a client whose worker is not on that client's roster

Each issue links to where it is fixed. A Super Admin can approve anyway with a
reason; the reason and the open issues are kept on the month. Soft warnings
(`blocks: False`) are listed but do not stop approval.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client, ClientWorkerLink
from models.enums import PayrollSessionEnum, SessionTypeEnum
from models.hours_log import HoursLogEntry
from models.payroll import PayrollPeriod
from models.rdp_machine import RDPResource, RDPResourceWorker
from models.session import Session as WorkSession
from models.worker import Worker
from services import client_billing
from services.session_evidence import work_minutes

ZERO = Decimal("0")


def _issue(kind: str, message: str, href: str, key: str, *, blocks: bool = True) -> dict:
    return {"key": key, "kind": kind, "message": message, "href": href, "blocks": blocks}


def blocking_issues(open_issues: list[dict]) -> list[dict]:
    return [i for i in open_issues if i.get("blocks", True)]


def _worker_name(w: Optional[Worker]) -> str:
    if w is None:
        return "A worker"
    return w.display_name or w.username or "A worker"


def _period_sessions(db: Session, period: PayrollPeriod) -> list[WorkSession]:
    start = datetime.combine(period.start_date, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, datetime.max.time(), tzinfo=timezone.utc)
    rows = db.exec(
        select(WorkSession).where(
            WorkSession.end_time.is_not(None),
            WorkSession.start_time >= start,
            WorkSession.start_time <= end,
            WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
            WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
        )
    ).all()
    return [s for s in rows if s.payroll_period_id in (None, period.id)]


def issues(db: Session, period: PayrollPeriod, months: Optional[list] = None) -> list[dict]:
    pid = period.id
    q = f"?period={pid}"
    out: list[dict] = []
    desks = {d.id: d for d in db.exec(select(RDPResource)).all()}
    workers = {w.id: w for w in db.exec(select(Worker)).all()}

    # Hours on a desktop with no client.
    clientless: dict[UUID, Decimal] = {}
    for row in db.exec(select(HoursLogEntry).where(HoursLogEntry.payroll_period_id == pid)).all():
        desk = desks.get(row.rdp_resource_id) if row.rdp_resource_id else None
        if desk is not None and desk.client_id is None and Decimal(row.hours) > 0:
            clientless[desk.id] = clientless.get(desk.id, ZERO) + Decimal(row.hours)
    for desk_id, hours in clientless.items():
        name = desks[desk_id].nickname or "Unnamed desktop"
        out.append(_issue(
            "desktop_no_client", f"{name} has {hours.quantize(Decimal('0.01'))} h this month but no client.",
            "/admin/rdp", f"desktop_no_client:{desk_id}",
        ))

    # Sessions needing a client link; desktop access hygiene; admin sessions without a machine.
    links = {(l.rdp_resource_id, l.worker_id) for l in db.exec(select(RDPResourceWorker)).all()}
    roster = {
        (link.client_id, link.worker_id)
        for link in db.exec(select(ClientWorkerLink)).all()
    }
    client_names = {c.id: c.name for c in db.exec(select(Client)).all()}
    seen_roster: set[str] = set()
    for s in _period_sessions(db, period):
        if work_minutes(s) <= 0:
            continue
        who = _worker_name(workers.get(s.worker_id))
        day = s.start_time.date().isoformat() if s.start_time else ""
        if s.client_id is None:
            out.append(_issue(
                "session_no_client",
                f"{who}'s session on {day} has no client — link it so the hours count as client income.",
                "/admin/sessions", f"session_no_client:{s.id}",
            ))
        else:
            key = f"roster:{s.client_id}:{s.worker_id}"
            if key not in seen_roster and (s.client_id, s.worker_id) not in roster:
                seen_roster.add(key)
                client_name = client_names.get(s.client_id, "A client")
                out.append(_issue(
                    "worker_not_on_roster",
                    f"{who} has a session on {client_name} but is not on that client's worker roster.",
                    f"/admin/clients?client={s.client_id}",
                    key,
                    blocks=False,
                ))
        if s.session_type != SessionTypeEnum.gs_rdp:
            continue
        if s.rdp_resource_id is not None:
            desk = desks.get(s.rdp_resource_id)
            if desk is None:
                continue
            if (desk.id, s.worker_id) not in links and desk.assigned_worker_id != s.worker_id:
                out.append(_issue(
                    "session_unlinked_desktop",
                    f"{who} worked on {desk.nickname} on {day} but isn't linked to that desktop.",
                    "/admin/rdp", f"session_unlinked_desktop:{s.id}",
                ))
        elif not s.added_by_admin:
            out.append(_issue(
                "session_no_desktop",
                f"{who} has a session on {day} with no desktop.",
                f"/admin/workers?worker={s.worker_id}", f"session_no_desktop:{s.id}",
            ))

    # Client splits and payees.
    months = months if months is not None else client_billing.build(db, period)
    for m in months:
        active = m.billing or m.net_distributable or m.client_costs
        if not active:
            continue
        if m.split_check != "OK":
            total_pct = sum((r["pct"] for r in m.recipients), ZERO)
            total_amount = sum((r["amount"] for r in m.recipients), ZERO)
            if not m.recipients:
                detail = "has no recipients"
            elif total_pct != Decimal("100"):
                detail = f"recipients add up to {total_pct}%"
            else:
                detail = f"recipient amounts add up to {total_amount} USD, not {m.net_distributable} USD"
            out.append(_issue(
                "split", f"{m.client_name}: {detail}.", f"/admin/clients/ledger{q}&split=1", f"split:{m.client_id}",
            ))
        for r in m.recipients:
            if r["is_gs"] or r["amount"] <= 0:
                continue
            if r["payee_id"] is None:
                out.append(_issue(
                    "payee_missing", f"{r['name']} on {m.client_name}'s split isn't on the Recipients list.",
                    f"/admin/clients/ledger{q}&split=1", f"payee_missing:{m.client_id}:{r['name']}",
                ))
            elif not r["payout_ready"]:
                out.append(_issue(
                    "payee_details", f"{r['name']} is owed money but has no payout currency or details.",
                    "/admin/clients/recipients", f"payee_details:{r['payee_id']}",
                ))
    seen: set[str] = set()
    unique = []
    for issue in out:
        if issue["key"] in seen:
            continue
        seen.add(issue["key"])
        unique.append(issue)
    return unique


def bypass(db: Session, period: PayrollPeriod, *, reason: str, actor_id: UUID, open_issues: list[dict]) -> None:
    """Record a Super Admin bypass of the open issues. Caller commits."""
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise ValueError("Give a reason for approving with open checks.")
    period.bypass_reason = reason
    period.bypassed_by = actor_id
    period.bypassed_at = datetime.now(timezone.utc)
    period.bypassed_issues = open_issues
    db.add(period)


def clear_bypass(period: PayrollPeriod) -> None:
    period.bypass_reason = None
    period.bypassed_by = None
    period.bypassed_at = None
    period.bypassed_issues = None


def is_bypassed(period: PayrollPeriod, open_issues: list[dict]) -> bool:
    """A bypass covers the issues open when it was recorded; a new issue needs a new bypass."""
    if not period.bypassed_at:
        return False
    covered = {i.get("key") for i in (period.bypassed_issues or [])}
    return all(i["key"] in covered for i in open_issues)
