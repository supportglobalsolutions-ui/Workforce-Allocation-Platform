from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from core.database import get_db
from core.permissions import require_admin
from schemas.intelligence import IntelligenceBriefing, IntelligenceInspection, IntelligenceSnapshot
from services.intelligence_briefing import build_briefing
from services.intelligence_engine import build_snapshot
from services.intelligence_inspect import inspect_briefing

router = APIRouter()


@router.get("/snapshot", response_model=IntelligenceSnapshot)
def intelligence_snapshot(
    period_id: UUID = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Concatenated leadership snapshot. Each source is isolated; one failure does not blank the rest."""
    try:
        return build_snapshot(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/briefing", response_model=IntelligenceBriefing)
def intelligence_briefing(
    period_id: UUID = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Ops briefing: month scorecard, last-7-day alarms, ranked playbooks. Rules are isolated."""
    try:
        return build_briefing(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/inspection", response_model=IntelligenceInspection)
def intelligence_inspection(
    period_id: UUID = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Gemini ops-chief notes from the briefing facts. Failure does not blank the briefing."""
    try:
        briefing = build_briefing(db, period_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return inspect_briefing(briefing)
