from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, func, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.mcq import McqAssessmentSet, McqQuestion, McqResult, McqResultAnswer
from models.task_assessment import TaskAssessmentResult
from models.worker import Worker
from schemas.mcq import (
    McqAssessmentSetResponse,
    McqAssessmentSetUpdate,
    McqQuestionCreate,
    McqQuestionResponse,
    McqQuestionUpdate,
    McqResultResponse,
)
from services.assessment_marks import (
    attempt_progress,
    attempts_exhausted_detail,
    require_marks_total_100,
)
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _question_marks(set_id: UUID, db: Session) -> list[Decimal]:
    qs = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == set_id)).all()
    return [q.marks for q in qs]


def _require_ready_to_sit(s: McqAssessmentSet, db: Session) -> list[McqQuestion]:
    questions = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == s.id)).all()
    if not questions:
        raise HTTPException(status_code=400, detail="This assessment has no questions yet.")
    require_marks_total_100([q.marks for q in questions], "MCQ")
    return questions


def _current_mcq_result(db: Session, worker_id: UUID, source_id: UUID) -> McqResult | None:
    return db.exec(
        select(McqResult).where(McqResult.worker_id == worker_id, McqResult.source_id == source_id)
    ).first()


def _enforce_attempts(s: McqAssessmentSet, existing: McqResult | None) -> None:
    used = existing.attempt_count if existing else 0
    progress = attempt_progress(s.allow_retakes, s.max_attempts, used)
    if not progress["can_attempt"]:
        raise HTTPException(status_code=409, detail=progress["blocked_reason"])


class AvailableAssessment(BaseModel):
    id: UUID
    title: str
    category: str
    passing_score_pct: float
    question_count: int
    best_score_pct: float | None = None
    latest_score_pct: float | None = None
    passed: bool | None = None
    attempts: int = 0
    allow_retakes: bool = False
    max_attempts: int = 1
    retakes_allowed: int = 0
    retakes_remaining: int = 0
    can_attempt: bool = True
    attempt_blocked_reason: str | None = None


class QuestionForWorker(BaseModel):
    id: UUID
    prompt: str
    options: list[Any]
    sort_order: int
    marks: float


class McqSubmission(BaseModel):
    answers: dict[str, str]


class McqResultScorePatch(BaseModel):
    score_pct: Decimal


class GradeLedgerRow(BaseModel):
    kind: Literal["mcq", "task"]
    result_id: UUID
    source_id: UUID
    title: str
    worker_id: UUID
    worker_display_name: str
    worker_country: str
    score_pct: float | None
    passed: bool | None
    completed_at: str | None


@router.get("/grade-ledger", response_model=list[GradeLedgerRow])
def grade_ledger(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rows: list[GradeLedgerRow] = []
    mcq_rows = db.exec(
        select(McqResult, Worker)
        .join(Worker, Worker.id == McqResult.worker_id)
        .order_by(McqResult.completed_at.desc())
    ).all()
    for r, w in mcq_rows:
        rows.append(GradeLedgerRow(
            kind="mcq",
            result_id=r.id,
            source_id=r.source_id,
            title=r.title_snapshot or "MCQ",
            worker_id=w.id,
            worker_display_name=w.display_name,
            worker_country=w.country or "",
            score_pct=float(r.score_pct),
            passed=r.passed,
            completed_at=r.completed_at.isoformat() if r.completed_at else None,
        ))
    task_rows = db.exec(
        select(TaskAssessmentResult, Worker)
        .join(Worker, Worker.id == TaskAssessmentResult.worker_id)
        .order_by(col(TaskAssessmentResult.graded_at).desc().nulls_last(), TaskAssessmentResult.created_at.desc())
    ).all()
    for r, w in task_rows:
        when = r.graded_at or r.submitted_at or r.created_at
        rows.append(GradeLedgerRow(
            kind="task",
            result_id=r.id,
            source_id=r.source_id,
            title=r.title_snapshot or "Task",
            worker_id=w.id,
            worker_display_name=w.display_name,
            worker_country=w.country or "",
            score_pct=float(r.score_pct) if r.score_pct is not None else None,
            passed=r.passed,
            completed_at=when.isoformat() if when else None,
        ))
    rows.sort(key=lambda x: x.completed_at or "", reverse=True)
    return rows


@router.patch("/results/{result_id}/score", response_model=McqResultResponse)
def patch_mcq_score(
    result_id: UUID,
    body: McqResultScorePatch,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    r = db.exec(select(McqResult).where(McqResult.id == result_id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found.")
    score = Decimal(body.score_pct)
    if score < 0 or score > 100:
        raise HTTPException(status_code=400, detail="Score must be between 0 and 100.")
    r.score_pct = score
    passing = Decimal("70")
    if r.assessment_set_id:
        s = db.get(McqAssessmentSet, r.assessment_set_id)
        if s:
            passing = s.passing_score_pct
    r.passed = score >= passing
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


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
        by_set.setdefault(r.source_id, []).append(r)

    out = []
    for s in sets:
        questions = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == s.id)).all()
        try:
            require_marks_total_100([q.marks for q in questions], "MCQ")
        except HTTPException:
            continue
        mine = by_set.get(s.id, [])
        row = mine[0] if mine else None
        used = row.attempt_count if row else 0
        progress = attempt_progress(s.allow_retakes, s.max_attempts, used)
        out.append(AvailableAssessment(
            id=s.id,
            title=s.title,
            category=s.category,
            passing_score_pct=float(s.passing_score_pct),
            question_count=len(questions),
            best_score_pct=float(row.score_pct) if row else None,
            latest_score_pct=float(row.score_pct) if row else None,
            passed=row.passed if row else None,
            attempts=used,
            allow_retakes=s.allow_retakes,
            max_attempts=progress["cap"],
            retakes_allowed=progress["retakes_allowed"],
            retakes_remaining=progress["retakes_remaining"],
            can_attempt=progress["can_attempt"],
            attempt_blocked_reason=progress["blocked_reason"],
        ))
    return out


@router.get("/{set_id}/take", response_model=list[QuestionForWorker])
def get_questions_for_taking(
    set_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Assessment not found or inactive.")
    worker = get_worker_for_user(db, current_user)
    questions = _require_ready_to_sit(s, db)
    existing = _current_mcq_result(db, worker.id, set_id)
    _enforce_attempts(s, existing)
    questions = sorted(questions, key=lambda q: (q.sort_order, str(q.id)))
    return [
        QuestionForWorker(
            id=q.id,
            prompt=q.prompt,
            options=q.options or [],
            sort_order=q.sort_order,
            marks=float(q.marks),
        )
        for q in questions
    ]


@router.post("/{set_id}/submit", response_model=McqResultResponse, status_code=status.HTTP_201_CREATED)
def submit_assessment(
    set_id: UUID,
    body: McqSubmission,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    s = db.exec(select(McqAssessmentSet).where(McqAssessmentSet.id == set_id)).first()
    if not s or not s.is_active:
        raise HTTPException(status_code=404, detail="Assessment not found or inactive.")
    worker = get_worker_for_user(db, current_user)
    questions = _require_ready_to_sit(s, db)
    existing = _current_mcq_result(db, worker.id, set_id)
    _enforce_attempts(s, existing)

    earned = Decimal("0")
    graded: list[tuple[McqQuestion, str, bool]] = []
    for q in questions:
        selected = body.answers.get(str(q.id), "")
        is_correct = selected == q.correct_option_key
        if is_correct:
            earned += Decimal(q.marks)
        graded.append((q, selected, is_correct))

    score_pct = earned.quantize(Decimal("0.01"))
    if score_pct > 100:
        score_pct = Decimal("100.00")
    now = datetime.now(timezone.utc)
    try:
        if existing:
            for ans in list(existing.answers or []):
                db.delete(ans)
            db.flush()
            existing.score_pct = score_pct
            existing.passed = score_pct >= Decimal(s.passing_score_pct)
            existing.completed_at = now
            existing.title_snapshot = s.title
            existing.assessment_set_id = set_id
            existing.attempt_count = (existing.attempt_count or 1) + 1
            result = existing
            db.add(result)
            db.flush()
        else:
            result = McqResult(
                worker_id=worker.id,
                assessment_set_id=set_id,
                source_id=set_id,
                title_snapshot=s.title,
                score_pct=score_pct,
                passed=score_pct >= Decimal(s.passing_score_pct),
                attempt_count=1,
                completed_at=now,
            )
            db.add(result)
            db.flush()
        for q, selected, is_correct in graded:
            db.add(McqResultAnswer(
                mcq_result_id=result.id,
                question_id=q.id,
                selected_option_key=selected or "-",
                is_correct=is_correct,
                prompt_snapshot=q.prompt,
                options_snapshot=q.options,
                marks_snapshot=q.marks,
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=attempts_exhausted_detail(s.allow_retakes, s.max_attempts),
        ) from None
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


class AssessmentSetWithStats(McqAssessmentSetResponse):
    question_count: int = 0
    result_count:   int = 0
    marks_total:    Decimal = Decimal("0")


@router.get("", response_model=list[AssessmentSetWithStats])
def list_assessments(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    sets = db.exec(select(McqAssessmentSet).order_by(col(McqAssessmentSet.title))).all()
    result = []
    for s in sets:
        qs = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == s.id)).all()
        rcount = db.exec(
            select(func.count()).where(McqResult.source_id == s.id)
        ).one()
        item = AssessmentSetWithStats.model_validate(s)
        item.question_count = len(qs)
        item.result_count = rcount
        item.marks_total = sum((q.marks for q in qs), Decimal("0"))
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
        is_active=False,
        allow_retakes=body.allow_retakes or False,
        max_attempts=body.max_attempts or 1,
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
    if s.is_active:
        require_marks_total_100(_question_marks(s.id, db), "MCQ")
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
    questions = db.exec(select(McqQuestion).where(McqQuestion.assessment_set_id == set_id)).all()
    for q in questions:
        db.delete(q)
    db.flush()
    db.delete(s)
    db.commit()


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
        marks=body.marks if body.marks is not None else Decimal("0"),
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
        .where(McqResult.source_id == set_id)
        .order_by(McqResult.completed_at.desc())
    ).all()
    result = []
    for r, w in rows:
        item = McqResultWithWorker.model_validate(r)
        item.worker_display_name = w.display_name
        item.worker_country      = w.country
        result.append(item)
    return result
