from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, func, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import TaskResultStatusEnum
from models.task_assessment import TaskAssessment, TaskAssessmentResult
from models.worker import Worker
from schemas.task_assessment import (
    TaskAssessmentCreate,
    TaskAssessmentResponse,
    TaskAssessmentUpdate,
    TaskAssessmentWithStats,
    TaskResultGrade,
    TaskResultResponse,
    TaskResultWithWorker,
)
from services import firestore_sync
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _to_dict(obj) -> dict:
    return {c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs}


# ── Assessment CRUD ────────────────────────────────────────────────────────────

@router.get("", response_model=list[TaskAssessmentWithStats])
def list_task_assessments(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    assessments = db.exec(select(TaskAssessment).order_by(col(TaskAssessment.title))).all()
    result = []
    for a in assessments:
        rcount = db.exec(
            select(func.count()).where(TaskAssessmentResult.task_assessment_id == a.id)
        ).one()
        item = TaskAssessmentWithStats.model_validate(a)
        item.result_count = rcount
        result.append(item)
    return result


@router.post("", response_model=TaskAssessmentResponse, status_code=status.HTTP_201_CREATED)
def create_task_assessment(
    body: TaskAssessmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    a = TaskAssessment(
        title=body.title,
        category=body.category,
        description=body.description,
        instructions=body.instructions,
        media_urls=body.media_urls,
        is_timed=body.is_timed,
        time_limit_minutes=body.time_limit_minutes,
        passing_score_pct=body.passing_score_pct,
        is_active=body.is_active,
        created_by=admin.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    firestore_sync.sync_task_assessment(_to_dict(a))
    return a


@router.get("/{assessment_id}", response_model=TaskAssessmentResponse)
def get_task_assessment(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task assessment not found.")
    return a


@router.patch("/{assessment_id}", response_model=TaskAssessmentResponse)
def update_task_assessment(
    assessment_id: UUID,
    body: TaskAssessmentUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task assessment not found.")
    apply_update(a, body)
    db.add(a)
    db.commit()
    db.refresh(a)
    firestore_sync.sync_task_assessment(_to_dict(a))
    return a


@router.delete("/{assessment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_assessment(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task assessment not found.")
    db.delete(a)
    db.commit()
    firestore_sync.delete_task_assessment(str(assessment_id))


# ── Results (admin view + grading) ─────────────────────────────────────────────

@router.get("/{assessment_id}/results", response_model=list[TaskResultWithWorker])
def list_task_results(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rows = db.exec(
        select(TaskAssessmentResult, Worker)
        .join(Worker, Worker.id == TaskAssessmentResult.worker_id)
        .where(TaskAssessmentResult.task_assessment_id == assessment_id)
        .order_by(TaskAssessmentResult.created_at.desc())
    ).all()
    result = []
    for r, w in rows:
        item = TaskResultWithWorker.model_validate(r)
        item.worker_display_name = w.display_name
        item.worker_country      = w.country
        result.append(item)
    return result


@router.patch("/results/{result_id}/grade", response_model=TaskResultResponse)
def grade_task_result(
    result_id: UUID,
    body: TaskResultGrade,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = db.exec(select(TaskAssessmentResult).where(TaskAssessmentResult.id == result_id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found.")
    admin = get_admin_user(db, current_user)
    r.score_pct    = body.score_pct
    r.passed       = body.passed
    r.grader_notes = body.grader_notes
    r.graded_at    = datetime.now(timezone.utc)
    r.graded_by    = admin.id
    r.status       = TaskResultStatusEnum.graded
    db.add(r)
    db.commit()
    db.refresh(r)
    firestore_sync.sync_task_result(_to_dict(r))
    return r


# ── Worker submission ─────────────────────────────────────────────────────────

@router.post("/{assessment_id}/submit", response_model=TaskResultResponse, status_code=status.HTTP_201_CREATED)
def submit_task_result(
    assessment_id: UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a or not a.is_active:
        raise HTTPException(status_code=404, detail="Task assessment not found or inactive.")
    worker = get_worker_for_user(db, current_user)

    r = TaskAssessmentResult(
        task_assessment_id=assessment_id,
        worker_id=worker.id,
        status=TaskResultStatusEnum.submitted,
        submission_notes=body.get("submission_notes"),
        submission_media_urls=body.get("submission_media_urls", []),
        submitted_at=datetime.now(timezone.utc),
        time_taken_seconds=body.get("time_taken_seconds"),
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    firestore_sync.sync_task_result(_to_dict(r))
    return r
