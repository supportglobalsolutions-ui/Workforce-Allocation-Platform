"""
Monthly Hours Log (/hours-log): paid hours per worker per desktop.

Session hours fill the rows; an admin can type over any of them. Every edit
moves the worker's payslip hours to the new total straight away.
"""
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client
from models.enums import PayrollPeriodStatusEnum
from models.hours_log import HoursLogEntry
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.rdp_machine import RDPResource
from models.worker import Worker
from services import hours_log, payroll_engine
from services.audit_service import record_audit
from services.client_import import cell_text, read_sheet
from .deps import get_admin_user

router = APIRouter()


class HoursLogRow(BaseModel):
    id: UUID
    worker_id: UUID
    worker_name: str
    rdp_resource_id: Optional[UUID] = None
    desktop: Optional[str] = None
    client_id: Optional[UUID] = None
    client_name: Optional[str] = None
    hours: Decimal
    session_hours: Decimal
    is_manual: bool
    note: Optional[str] = None
    updated_at: Optional[datetime] = None


class PickOption(BaseModel):
    id: UUID
    name: str
    client_name: Optional[str] = None


class HoursLogSheet(BaseModel):
    period_id: UUID
    period_label: str
    status: str
    editable: bool
    rows: list[HoursLogRow]
    workers: list[PickOption]
    desktops: list[PickOption]


class EntryBody(BaseModel):
    worker_id: UUID
    rdp_resource_id: Optional[UUID] = None
    hours: Decimal = Field(ge=0)
    note: Optional[str] = None


class ImportResult(BaseModel):
    updated: int
    skipped: int
    errors: list[str]


def _period(db: Session, period_id: UUID, *, edit: bool = False) -> PayrollPeriod:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Work month not found")
    if edit and not hours_log.is_editable(period):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This month is already paid.")
    return period


def sync_payslip_hours(db: Session, period: PayrollPeriod, worker_ids: list[UUID]) -> None:
    """Put the new log totals on the workers' payslip rows. Caller commits."""
    if period.status == PayrollPeriodStatusEnum.paid or not worker_ids:
        return
    totals = hours_log.totals(db, period.id, worker_ids)
    summaries = db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id == period.id,
            PayrollWorkerSummary.worker_id.in_(worker_ids),
        )
    ).all()
    for summary in summaries:
        total = totals.get(summary.worker_id, Decimal("0"))
        if summary.hours_logged == total:
            continue
        summary.hours_logged = total
        payroll_engine.recompute_summary(db, summary, commit=False)


def _sheet(db: Session, period: PayrollPeriod) -> HoursLogSheet:
    rows = hours_log.entries(db, period.id)
    workers = {w.id: w for w in db.exec(select(Worker)).all()}
    desktops = {r.id: r for r in db.exec(select(RDPResource)).all()}
    clients = {c.id: c for c in db.exec(select(Client)).all()}

    out: list[HoursLogRow] = []
    for row in rows:
        desk = desktops.get(row.rdp_resource_id) if row.rdp_resource_id else None
        client = clients.get(desk.client_id) if desk and desk.client_id else None
        worker = workers.get(row.worker_id)
        out.append(HoursLogRow(
            id=row.id,
            worker_id=row.worker_id,
            worker_name=worker.display_name if worker else "Unknown worker",
            rdp_resource_id=row.rdp_resource_id,
            desktop=desk.nickname if desk else None,
            client_id=client.id if client else None,
            client_name=client.name if client else None,
            hours=row.hours,
            session_hours=row.session_hours,
            is_manual=row.is_manual,
            note=row.note,
            updated_at=row.updated_at,
        ))
    out.sort(key=lambda r: (r.worker_name.lower(), (r.desktop or "~").lower()))
    return HoursLogSheet(
        period_id=period.id,
        period_label=period.label,
        status=period.status.value if hasattr(period.status, "value") else str(period.status),
        editable=hours_log.is_editable(period),
        rows=out,
        workers=sorted(
            (PickOption(id=w.id, name=w.display_name) for w in workers.values()),
            key=lambda o: o.name.lower(),
        ),
        desktops=sorted(
            (
                PickOption(
                    id=d.id, name=d.nickname,
                    client_name=clients[d.client_id].name if d.client_id in clients else None,
                )
                for d in desktops.values()
            ),
            key=lambda o: o.name.lower(),
        ),
    )


@router.get("/periods/{period_id}", response_model=HoursLogSheet)
def get_hours_log(
    period_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    period = _period(db, period_id)
    if hours_log.refreshes(period):
        touched = {r.worker_id for r in hours_log.refresh(db, period)}
        sync_payslip_hours(db, period, list(touched))
        db.commit()
    return _sheet(db, period)


@router.put("/periods/{period_id}/entries", response_model=HoursLogSheet)
def set_entry(
    period_id: UUID,
    body: EntryBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    period = _period(db, period_id, edit=True)
    if not db.get(Worker, body.worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")
    if body.rdp_resource_id and not db.get(RDPResource, body.rdp_resource_id):
        raise HTTPException(status_code=404, detail="Desktop not found")
    admin = get_admin_user(db, current_user)
    row = hours_log.set_entry(
        db, period, body.worker_id, body.rdp_resource_id, body.hours, actor_id=admin.id, note=body.note,
    )
    record_audit(
        db, actor_id=admin.id, action="hours_log.entry_set", target_type="hours_log", target_id=row.id,
        new_value={"worker_id": str(body.worker_id), "rdp_resource_id": str(body.rdp_resource_id or ""),
                   "hours": str(row.hours), "session_hours": str(row.session_hours)},
        reason_note=body.note,
    )
    sync_payslip_hours(db, period, [body.worker_id])
    db.commit()
    return _sheet(db, period)


def _entry(db: Session, entry_id: UUID) -> tuple[HoursLogEntry, PayrollPeriod]:
    row = db.get(HoursLogEntry, entry_id)
    if not row:
        raise HTTPException(status_code=404, detail="Hours row not found")
    return row, _period(db, row.payroll_period_id, edit=True)


@router.post("/entries/{entry_id}/reset", response_model=HoursLogSheet)
def reset_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Go back to the session hours for one row."""
    row, period = _entry(db, entry_id)
    admin = get_admin_user(db, current_user)
    previous = str(row.hours)
    hours_log.reset_entry(db, row)
    record_audit(
        db, actor_id=admin.id, action="hours_log.entry_reset", target_type="hours_log", target_id=row.id,
        previous_value={"hours": previous}, new_value={"hours": str(row.hours)},
    )
    worker_id = row.worker_id
    if row.session_hours == 0:
        db.delete(row)
    sync_payslip_hours(db, period, [worker_id])
    db.commit()
    return _sheet(db, period)


@router.delete("/entries/{entry_id}", response_model=HoursLogSheet)
def delete_entry(
    entry_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Remove a typed row that sessions don't back up (session-filled rows reset instead)."""
    row, period = _entry(db, entry_id)
    if row.session_hours > 0:
        raise HTTPException(status_code=400, detail="This row has session hours. Reset it instead.")
    admin = get_admin_user(db, current_user)
    record_audit(
        db, actor_id=admin.id, action="hours_log.entry_deleted", target_type="hours_log", target_id=row.id,
        previous_value={"hours": str(row.hours)},
    )
    worker_id = row.worker_id
    db.delete(row)
    db.flush()
    sync_payslip_hours(db, period, [worker_id])
    db.commit()
    return _sheet(db, period)


_IMPORT_ALIASES = {
    "worker": "worker", "worker name": "worker", "name": "worker", "email": "worker", "worker email": "worker",
    "desktop": "desktop", "rdp": "desktop", "rdp nickname": "desktop", "machine": "desktop",
    "hours": "hours", "total hours": "hours", "hrs": "hours",
    "note": "note", "notes": "note",
}


@router.post("/periods/{period_id}/import", response_model=ImportResult)
async def import_hours(
    period_id: UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Type a month's hours from a sheet: Worker, Desktop (blank = No desktop), Hours, Note."""
    period = _period(db, period_id, edit=True)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB).")
    try:
        rows = read_sheet(file.filename or "hours.csv", data, _IMPORT_ALIASES)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found in the file.")
    if "worker" not in rows[0] or "hours" not in rows[0]:
        raise HTTPException(status_code=400, detail='The sheet needs "Worker" and "Hours" columns.')

    workers = db.exec(select(Worker)).all()
    by_name = {w.display_name.strip().lower(): w for w in workers if w.display_name}
    by_id = {str(w.id): w for w in workers}
    desks = {d.nickname.strip().lower(): d for d in db.exec(select(RDPResource)).all()}

    admin = get_admin_user(db, current_user)
    updated, skipped, errors = 0, 0, []
    touched: set[UUID] = set()
    for index, raw in enumerate(rows, start=2):
        who = cell_text(raw.get("worker"))
        worker = by_name.get(who.lower()) or by_id.get(who)
        if worker is None:
            errors.append(f"Row {index}: no worker called {who!r}")
            skipped += 1
            continue
        desk_name = cell_text(raw.get("desktop"))
        desk = desks.get(desk_name.lower()) if desk_name else None
        if desk_name and desk is None:
            errors.append(f"Row {index}: no desktop called {desk_name!r}")
            skipped += 1
            continue
        try:
            hours = Decimal(cell_text(raw.get("hours")).replace(",", "") or "x")
            if hours < 0:
                raise InvalidOperation
        except InvalidOperation:
            errors.append(f"Row {index}: hours must be a number of 0 or more")
            skipped += 1
            continue
        hours_log.set_entry(
            db, period, worker.id, desk.id if desk else None, hours,
            actor_id=admin.id, note=cell_text(raw.get("note")) or "Imported",
        )
        touched.add(worker.id)
        updated += 1

    if updated:
        record_audit(
            db, actor_id=admin.id, action="hours_log.imported", target_type="payroll_period",
            target_id=period.id, new_value={"rows": updated, "skipped": skipped},
        )
        sync_payslip_hours(db, period, list(touched))
    db.commit()
    return ImportResult(updated=updated, skipped=skipped, errors=errors[:50])
