from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from core.database import get_db
from core.permissions import require_admin
from models.client import Client, ClientRevenueAgreement
from models.enums import ClientOwnerTypeEnum
from models.partner import PartnerEntity
from models.rdp_machine import RDPResource
from models.worker import Worker
from schemas.client import (
    ClientCreate,
    ClientResponse,
    ClientRevenueAgreementCreate,
    ClientRevenueAgreementResponse,
    ClientRevenueAgreementUpdate,
    ClientUpdate,
)
from .deps import apply_update

router = APIRouter()


def _owner_name(db: Session, client: Client) -> str | None:
    if client.owner_type == ClientOwnerTypeEnum.gs:
        return "Global Solutions"
    if client.owner_type == ClientOwnerTypeEnum.worker and client.owner_worker_id:
        worker = db.get(Worker, client.owner_worker_id)
        return worker.display_name if worker else None
    if client.owner_type == ClientOwnerTypeEnum.partner_entity and client.owner_partner_entity_id:
        entity = db.get(PartnerEntity, client.owner_partner_entity_id)
        return entity.name if entity else None
    return None


def _to_response(db: Session, client: Client, rdp_counts: dict | None = None) -> ClientResponse:
    resp = ClientResponse.model_validate(client)
    resp.owner_name = _owner_name(db, client)
    if rdp_counts is not None:
        resp.rdp_count = rdp_counts.get(client.id, 0)
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
    return [_to_response(db, c, rdp_counts) for c in clients]


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
