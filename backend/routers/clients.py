from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlmodel import Session, func, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client, ClientPeriodEarning, ClientRevenueAgreement
from models.payroll import PayrollPeriod
from models.rdp_machine import RDPResource
from models.worker import Worker
from schemas.client import (
    ClientCreate,
    ClientPeriodEarningResponse,
    ClientPeriodEarningUpsert,
    ClientResponse,
    ClientRevenueAgreementBulk,
    ClientRevenueAgreementCreate,
    ClientRevenueAgreementResponse,
    ClientRevenueAgreementUpdate,
    ClientUpdate,
)
from services.client_import import parse_client_import_file, upsert_clients_from_rows
from services.client_owners import client_owner_name
from .deps import apply_update

router = APIRouter()


class ClientImportResult(BaseModel):
    created: int
    updated: int
    skipped: int
    errors: list[str]
    total_rows: int


def _earning_response(db: Session, earning: ClientPeriodEarning) -> ClientPeriodEarningResponse:
    resp = ClientPeriodEarningResponse.model_validate(earning)
    period = db.get(PayrollPeriod, earning.payroll_period_id)
    if period:
        resp.period_label = period.label
        resp.period_currency = period.currency
    return resp


def _to_response(db: Session, client: Client, rdp_counts: dict | None = None, splits: dict | None = None) -> ClientResponse:
    resp = ClientResponse.model_validate(client)
    resp.owner_name = client_owner_name(db, client)
    if rdp_counts is not None:
        resp.rdp_count = rdp_counts.get(client.id, 0)
    if splits is not None and client.id in splits:
        resp.gs_pct, resp.owner_pct = splits[client.id]
    return resp


@router.get("", response_model=list[ClientResponse])
def list_clients(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    clients = db.exec(select(Client).order_by(Client.name)).all()
    rdp_counts = dict(db.exec(
        select(RDPResource.client_id, func.count())
        .where(RDPResource.client_id.is_not(None))
        .group_by(RDPResource.client_id)
    ).all())
    agreements = db.exec(
        select(ClientRevenueAgreement).order_by(ClientRevenueAgreement.effective_from.desc())
    ).all()
    splits: dict = {}
    for agreement in agreements:
        if agreement.client_id not in splits:
            splits[agreement.client_id] = (agreement.gs_pct, agreement.owner_pct)
    return [_to_response(db, c, rdp_counts, splits) for c in clients]


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    body: ClientCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    client = Client(**body.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return _to_response(db, client)


@router.post("/import", response_model=ClientImportResult)
async def import_clients(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Bulk upsert clients from a CSV or Excel (.xlsx) rate sheet.

    Expected columns (extras ignored; missing system fields stay blank):
    Client, Billing Rate USD/hr, Active?, Notes — plus optional platform /
    account fields. Matching is by client name (case-insensitive); existing
    rows are updated. Platform defaults to Unassigned on create.
    """
    filename = file.filename or "upload.csv"
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB).")
    try:
        rows = parse_client_import_file(filename, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not rows:
        raise HTTPException(status_code=400, detail="No data rows found in the file.")
    result = upsert_clients_from_rows(db, rows)
    return ClientImportResult(**result)


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return _to_response(db, client)


@router.patch("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: UUID,
    body: ClientUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    apply_update(client, body)
    db.add(client)
    db.commit()
    db.refresh(client)
    return _to_response(db, client)


@router.get("/{client_id}/earnings", response_model=list[ClientPeriodEarningResponse])
def list_client_earnings(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(Client, client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    rows = db.exec(
        select(ClientPeriodEarning)
        .where(ClientPeriodEarning.client_id == client_id)
        .order_by(ClientPeriodEarning.created_at.desc())
    ).all()
    return [_earning_response(db, row) for row in rows]


@router.put(
    "/{client_id}/earnings/{period_id}",
    response_model=ClientPeriodEarningResponse,
)
def upsert_client_earning(
    client_id: UUID,
    period_id: UUID,
    body: ClientPeriodEarningUpsert,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(Client, client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    if not db.get(PayrollPeriod, period_id):
        raise HTTPException(status_code=404, detail="Payroll period not found")

    earning = db.exec(
        select(ClientPeriodEarning).where(
            ClientPeriodEarning.client_id == client_id,
            ClientPeriodEarning.payroll_period_id == period_id,
        )
    ).first()
    if earning is None:
        earning = ClientPeriodEarning(
            client_id=client_id,
            payroll_period_id=period_id,
            amount=body.amount,
            notes=body.notes.strip() if body.notes and body.notes.strip() else None,
        )
    else:
        earning.amount = body.amount
        earning.notes = body.notes.strip() if body.notes and body.notes.strip() else None
        earning.updated_at = datetime.now(timezone.utc)

    db.add(earning)
    db.commit()
    db.refresh(earning)
    return _earning_response(db, earning)


@router.get("/{client_id}/rdps")
def list_client_rdps(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """RDPs on this client account with their assigned workers (traceability)."""
    rows = db.exec(
        select(RDPResource).where(RDPResource.client_id == client_id).order_by(RDPResource.nickname)
    ).all()
    result = []
    for rdp in rows:
        worker = db.get(Worker, rdp.assigned_worker_id) if rdp.assigned_worker_id else None
        result.append({
            "id": str(rdp.id),
            "nickname": rdp.nickname,
            "country": rdp.country,
            "status": rdp.status,
            "assigned_worker_id": str(rdp.assigned_worker_id) if rdp.assigned_worker_id else None,
            "assigned_worker_name": worker.display_name if worker else None,
        })
    return result


# ── Revenue agreements ─────────────────────────────────────────────────────────

@router.get("/{client_id}/agreements", response_model=list[ClientRevenueAgreementResponse])
def list_agreements(
    client_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(ClientRevenueAgreement)
        .where(ClientRevenueAgreement.client_id == client_id)
        .order_by(ClientRevenueAgreement.effective_from.desc())
    ).all()


@router.post("/agreements", response_model=ClientRevenueAgreementResponse, status_code=status.HTTP_201_CREATED)
def create_agreement(
    body: ClientRevenueAgreementCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(Client, body.client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    agreement = ClientRevenueAgreement(**body.model_dump())
    db.add(agreement)
    db.commit()
    db.refresh(agreement)
    return agreement


@router.post("/agreements/bulk")
def bulk_create_agreements(
    body: ClientRevenueAgreementBulk,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Set the same GS / owner split on many client accounts."""
    from datetime import date

    if round(body.gs_pct + body.owner_pct, 2) != 100:
        raise HTTPException(status_code=400, detail="gs_pct + owner_pct must equal 100.00")
    if not body.client_ids:
        raise HTTPException(status_code=400, detail="Select at least one client.")

    start = body.effective_from or date.today()
    updated = 0
    for client_id in body.client_ids:
        if not db.get(Client, client_id):
            continue
        db.add(ClientRevenueAgreement(
            client_id=client_id,
            gs_pct=body.gs_pct,
            owner_pct=body.owner_pct,
            effective_from=start,
            notes=body.notes,
        ))
        updated += 1
    db.commit()
    return {"updated": updated, "gs_pct": str(body.gs_pct), "owner_pct": str(body.owner_pct)}


@router.patch("/agreements/{agreement_id}", response_model=ClientRevenueAgreementResponse)
def update_agreement(
    agreement_id: UUID,
    body: ClientRevenueAgreementUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    agreement = db.get(ClientRevenueAgreement, agreement_id)
    if not agreement:
        raise HTTPException(status_code=404, detail="Agreement not found")
    apply_update(agreement, body)
    if round(agreement.gs_pct + agreement.owner_pct, 2) != 100:
        raise HTTPException(status_code=400, detail="GS + owner percentages must equal 100.")
    db.add(agreement)
    db.commit()
    db.refresh(agreement)
    return agreement
