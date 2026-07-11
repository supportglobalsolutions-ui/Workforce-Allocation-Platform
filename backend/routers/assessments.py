from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, func, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.mcq import McqAssessmentSet, McqQuestion, McqResult
from models.worker import Worker
from schemas.mcq import (
    McqAssessmentSetCreate,
    McqAssessmentSetResponse,
    McqAssessmentSetUpdate,
    McqQuestionCreate,
    McqQuestionResponse,
    McqQuestionUpdate,
    McqResultResponse,
)
from .deps import apply_update, get_admin_user

router = APIRouter()


# ── Assessment sets ────────────────────────────────────────────────────────────

class AssessmentSetWithStats(McqAssessmentSetResponse):
    question_count: int = 0
    result_count:   int = 0


@router.get("", response_model=list[AssessmentSetWithStats])
def list_assessments(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    sets = db.exec(select(McqAssessmentSet).order_by(col(McqAssessmentSet.title))).all()
    result = []
    for s in sets:
        qcount = db.exec(
            select(func.count()).where(McqQuestion.assessment_set_id == s.id)
        ).one()
        rcount = db.exec(
            select(func.count()).where(McqResult.assessment_set_id == s.id)
        ).one()
        item = AssessmentSetWithStats.model_validate(s)
        item.question_count = qcount
        item.result_count   = rcount
        result.append(item)
    return result


@router.post("", response_model=McqAssessmentSetResponse, status_code=status.HTTP_201_CREATED)
def create_assessment(
    body: McqAssessmentSetUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    if not body.title or not body.category:
        raise HTTPException(status_code=400, detail="Title and category are required.")
    s = McqAssessmentSet(
        title=body.title,
        category=body.category,
        passing_score_pct=body.passing_score_pct if body.passing_score_pct is not None else 70,
        is_active=body.is_active if body.is_active is not None else True,
        created_by=admin.id,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.get("/{set_id}", response_model=McqAssessmentSetResponse)
def get_assessment(
    set_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    return s


@router.patch("/{set_id}", response_model=McqAssessmentSetResponse)
def update_assessment(
    set_id: UUID,
    body: McqAssessmentSetUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    apply_update(s, body)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assessment(
    set_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    db.delete(s)
    db.commit()


# ── Questions ──────────────────────────────────────────────────────────────────

@router.get("/{set_id}/questions", response_model=list[McqQuestionResponse])
def list_questions(
    set_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return db.exec(
        select(McqQuestion)
        .where(McqQuestion.assessment_set_id == set_id)
        .order_by(McqQuestion.sort_order, col(McqQuestion.prompt))
    ).all()


@router.post("/{set_id}/questions", response_model=McqQuestionResponse, status_code=status.HTTP_201_CREATED)
def create_question(
    set_id: UUID,
    body: McqQuestionCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    q = McqQuestion(
        assessment_set_id=set_id,
        prompt=body.prompt,
        options=body.options,
        correct_option_key=body.correct_option_key,
        sort_order=body.sort_order,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.patch("/questions/{question_id}", response_model=McqQuestionResponse)
def update_question(
    question_id: UUID,
    body: McqQuestionUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    q = db.exec(select(McqQuestion).where(McqQuestion.id == question_id)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    apply_update(q, body)
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(
    question_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    q = db.exec(select(McqQuestion).where(McqQuestion.id == question_id)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found.")
    db.delete(q)
    db.commit()


# ── Results ────────────────────────────────────────────────────────────────────

class McqResultWithWorker(McqResultResponse):
    worker_display_name: str = ""
    worker_country:      str = ""


@router.get("/{set_id}/results", response_model=list[McqResultWithWorker])
def list_results(
    set_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rows = db.exec(
        select(McqResult, Worker)
        .join(Worker, Worker.id == McqResult.worker_id)
        .where(McqResult.assessment_set_id == set_id)
        .order_by(McqResult.completed_at.desc())
    ).all()
    result = []
    for r, w in rows:
        item = McqResultWithWorker.model_validate(r)
        item.worker_display_name = w.display_name
        item.worker_country      = w.country
        result.append(item)
    return result
