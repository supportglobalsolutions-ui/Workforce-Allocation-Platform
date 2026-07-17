from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.mcq import McqAssessmentSet, McqQuestion, McqResult, McqResultAnswer
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
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


# ── Worker: take assessments ───────────────────────────────────────────────────
# (Defined before /{set_id} routes so the static paths match first.)

class AvailableAssessment(BaseModel):
    id: UUID
    title: str
    category: str
    passing_score_pct: float
    question_count: int
    best_score_pct: float | None = None
    passed: bool | None = None
    attempts: int = 0


class QuestionForWorker(BaseModel):
    id: UUID
    prompt: str
    options: list[Any]
    sort_order: int


class McqSubmission(BaseModel):
    answers: dict[str, str]  # question_id -> selected option key


@router.get("/available", response_model=list[AvailableAssessment])
def list_available_assessments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    sets = db.exec(
        select(McqAssessmentSet).where(McqAssessmentSet.is_active.is_(True)).order_by(col(McqAssessmentSet.title))
    ).all()
    results = db.exec(select(McqResult).where(McqResult.worker_id == worker.id)).all()
    by_set: dict[UUID, list[McqResult]] = {}
    for r in results:
        by_set.setdefault(r.assessment_set_id, []).append(r)

    out = []
    for s in sets:
        qcount = db.exec(select(func.count()).where(McqQuestion.assessment_set_id == s.id)).one()
        mine = by_set.get(s.id, [])
        out.append(AvailableAssessment(
            id=s.id,
            title=s.title,
            category=s.category,
            passing_score_pct=float(s.passing_score_pct),
            question_count=qcount,
            best_score_pct=max((float(r.score_pct) for r in mine), default=None),
            passed=any(r.passed for r in mine) if mine else None,
            attempts=len(mine),
        ))
    return out


@router.get("/{set_id}/take", response_model=list[QuestionForWorker])
def get_questions_for_taking(
    set_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Questions without the correct answer keys — for the worker taking flow."""
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Assessment not found or inactive.")
    questions = db.exec(
        select(McqQuestion)
        .where(McqQuestion.assessment_set_id == set_id)
        .order_by(McqQuestion.sort_order)
    ).all()
    return [
        QuestionForWorker(id=q.id, prompt=q.prompt, options=q.options or [], sort_order=q.sort_order)
        for q in questions
    ]


@router.post("/{set_id}/submit", response_model=McqResultResponse, status_code=status.HTTP_201_CREATED)
def submit_assessment(
    set_id: UUID,
    body: McqSubmission,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    """Auto-grade a worker's MCQ submission and store the result + answers."""
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Assessment not found or inactive.")
    worker = get_worker_for_user(db, current_user)

    questions = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == set_id)).all()
    if not questions:
        raise HTTPException(status_code=400, detail="This assessment has no questions yet.")

    correct = 0
    graded: list[tuple[McqQuestion, str, bool]] = []
    for q in questions:
        selected = body.answers.get(str(q.id), "")
        is_correct = selected == q.correct_option_key
        if is_correct:
            correct += 1
        graded.append((q, selected, is_correct))

    score_pct = round(correct / len(questions) * 100, 2)
    result = McqResult(
        worker_id=worker.id,
        assessment_set_id=set_id,
        score_pct=score_pct,
        passed=score_pct >= float(s.passing_score_pct),
    )
    db.add(result)
    db.flush()
    for q, selected, is_correct in graded:
        db.add(McqResultAnswer(
            mcq_result_id=result.id,
            question_id=q.id,
            selected_option_key=selected or "-",
            is_correct=is_correct,
        ))
    db.commit()
    db.refresh(result)
    return result


@router.get("/results/mine", response_model=list[McqResultResponse])
def my_results(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return db.exec(
        select(McqResult)
        .where(McqResult.worker_id == worker.id)
        .order_by(McqResult.completed_at.desc())
    ).all()


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
