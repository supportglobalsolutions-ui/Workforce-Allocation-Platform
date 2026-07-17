from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from core.database import get_db
from core.permissions import require_admin
from models.partner import PartnerArrangement, PartnerClientOverride, PartnerEntity
from models.worker import Worker
from schemas.partner import (
    PartnerArrangementCreate,
    PartnerArrangementResponse,
    PartnerArrangementUpdate,
    PartnerClientOverrideCreate,
    PartnerClientOverrideResponse,
    PartnerClientOverrideUpdate,
    PartnerEntityCreate,
    PartnerEntityResponse,
    PartnerEntityUpdate,
)
from schemas.worker import WorkerResponse
from .deps import apply_update

router = APIRouter()


# ── Partner entities ───────────────────────────────────────────────────────────

@router.get("", response_model=list[PartnerEntityResponse])
def list_partners(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    entities = db.exec(select(PartnerEntity).order_by(PartnerEntity.name)).all()
    counts = dict(db.exec(
        select(Worker.partner_entity_id, func.count())
        .where(Worker.partner_entity_id.is_not(None))
        .group_by(Worker.partner_entity_id)
    ).all())
    result = []
    for e in entities:
        resp = PartnerEntityResponse.model_validate(e)
        resp.worker_count = counts.get(e.id, 0)
        result.append(resp)
    return result


@router.post("", response_model=PartnerEntityResponse, status_code=status.HTTP_201_CREATED)
def create_partner(
    body: PartnerEntityCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    existing = db.exec(select(PartnerEntity).where(PartnerEntity.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="A partner with this name already exists.")
    entity = PartnerEntity(**body.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@router.get("/{partner_id}", response_model=PartnerEntityResponse)
def get_partner(
    partner_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    entity = db.get(PartnerEntity, partner_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Partner not found")
    return entity


@router.patch("/{partner_id}", response_model=PartnerEntityResponse)
def update_partner(
    partner_id: UUID,
    body: PartnerEntityUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    entity = db.get(PartnerEntity, partner_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Partner not found")
    apply_update(entity, body)
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


@router.get("/{partner_id}/workers", response_model=list[WorkerResponse])
def list_partner_workers(
    partner_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(Worker).where(Worker.partner_entity_id == partner_id).order_by(Worker.display_name)
    ).all()


# ── Arrangements (worker / GS / partner splits) ────────────────────────────────

@router.get("/{partner_id}/arrangements", response_model=list[PartnerArrangementResponse])
def list_arrangements(
    partner_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(PartnerArrangement)
        .where(PartnerArrangement.partner_entity_id == partner_id)
        .order_by(PartnerArrangement.effective_from.desc())
    ).all()


@router.post("/arrangements", response_model=PartnerArrangementResponse, status_code=status.HTTP_201_CREATED)
def create_arrangement(
    body: PartnerArrangementCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(PartnerEntity, body.partner_entity_id):
        raise HTTPException(status_code=404, detail="Partner not found")
    arrangement = PartnerArrangement(**body.model_dump())
    db.add(arrangement)
    db.commit()
    db.refresh(arrangement)
    return arrangement


@router.patch("/arrangements/{arrangement_id}", response_model=PartnerArrangementResponse)
def update_arrangement(
    arrangement_id: UUID,
    body: PartnerArrangementUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    arrangement = db.get(PartnerArrangement, arrangement_id)
    if not arrangement:
        raise HTTPException(status_code=404, detail="Arrangement not found")
    apply_update(arrangement, body)
    total = arrangement.worker_pct + arrangement.gs_pct + arrangement.partner_pct
    if round(total, 2) != 100:
        raise HTTPException(status_code=400, detail="worker + GS + partner percentages must equal 100.")
    db.add(arrangement)
    db.commit()
    db.refresh(arrangement)
    return arrangement


# ── Client overrides ───────────────────────────────────────────────────────────

@router.get("/arrangements/{arrangement_id}/overrides", response_model=list[PartnerClientOverrideResponse])
def list_overrides(
    arrangement_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(PartnerClientOverride)
        .where(PartnerClientOverride.partner_arrangement_id == arrangement_id)
        .order_by(PartnerClientOverride.client_name)
    ).all()


@router.post("/overrides", response_model=PartnerClientOverrideResponse, status_code=status.HTTP_201_CREATED)
def create_override(
    body: PartnerClientOverrideCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    override = PartnerClientOverride(**body.model_dump())
    db.add(override)
    db.commit()
    db.refresh(override)
    return override


@router.patch("/overrides/{override_id}", response_model=PartnerClientOverrideResponse)
def update_override(
    override_id: UUID,
    body: PartnerClientOverrideUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    override = db.get(PartnerClientOverride, override_id)
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    apply_update(override, body)
    db.add(override)
    db.commit()
    db.refresh(override)
    return override
