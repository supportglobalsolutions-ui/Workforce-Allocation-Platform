from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, col, func, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import TaskResultStatusEnum
from models.task_assessment import (
    TaskActivity,
    TaskAssessment,
    TaskAssessmentResult,
    TaskResultActivityScore,
)
from models.worker import Worker
from schemas.task_assessment import (
    TaskActivityCreate,
    TaskActivityResponse,
    TaskActivityUpdate,
    TaskAssessmentCreate,
    TaskAssessmentResponse,
    TaskAssessmentUpdate,
    TaskAssessmentWithStats,
    TaskResultGrade,
    TaskResultResponse,
    TaskResultScorePatch,
    TaskResultWithWorker,
)
from services import firestore_sync
from services.assessment_marks import max_attempts_for, require_marks_total_100
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _to_dict(obj) -> dict:
    return {c.key: getattr(obj, c.key) for c in obj.__mapper__.column_attrs}


def _activities(assessment_id: UUID, db: Session) -> list[TaskActivity]:
    return db.exec(
        select(TaskActivity)
        .where(TaskActivity.task_assessment_id == assessment_id)
        .order_by(TaskActivity.sort_order, TaskActivity.prompt)
    ).all()


def _require_ready_to_sit(a: TaskAssessment, db: Session) -> list[TaskActivity]:
    acts = _activities(a.id, db)
    if not acts:
        raise HTTPException(status_code=400, detail="Add activities whose marks add up to 100 first.")
    require_marks_total_100([x.max_marks for x in acts], "Task")
    return acts


def _current_task_result(db: Session, worker_id: UUID, source_id: UUID) -> TaskAssessmentResult | None:
    return db.exec(
        select(TaskAssessmentResult).where(
            TaskAssessmentResult.worker_id == worker_id,
            TaskAssessmentResult.source_id == source_id,
        )
    ).first()


def _enforce_attempts(a: TaskAssessment, existing: TaskAssessmentResult | None) -> None:
    cap = max_attempts_for(a.allow_retakes, a.max_attempts)
    used = existing.attempt_count if existing else 0
    if used >= cap:
        raise HTTPException(status_code=400, detail=f"Maximum attempts reached ({cap}).")


@router.get("/available", response_model=list[TaskAssessmentResponse])
def list_available_tasks(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    items = db.exec(
        select(TaskAssessment)
        .where(TaskAssessment.is_active.is_(True))
        .order_by(col(TaskAssessment.title))
    ).all()
    ready = []
    for a in items:
        acts = _activities(a.id, db)
        try:
            require_marks_total_100([x.max_marks for x in acts], "Task")
        except HTTPException:
            continue
        ready.append(a)
    return ready


@router.get("/results/mine", response_model=list[TaskResultResponse])
def my_task_results(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    return db.exec(
        select(TaskAssessmentResult)
        .where(TaskAssessmentResult.worker_id == worker.id)
        .order_by(TaskAssessmentResult.created_at.desc())
    ).all()


@router.get("", response_model=list[TaskAssessmentWithStats])
def list_task_assessments(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    assessments = db.exec(select(TaskAssessment).order_by(col(TaskAssessment.title))).all()
    result = []
    for a in assessments:
        rcount = db.exec(
            select(func.count()).where(TaskAssessmentResult.source_id == a.id)
        ).one()
        acts = _activities(a.id, db)
        item = TaskAssessmentWithStats.model_validate(a)
        item.result_count = rcount
        item.marks_total = sum((x.max_marks for x in acts), Decimal("0"))
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
        is_active=False,
        allow_retakes=body.allow_retakes,
        max_attempts=body.max_attempts or 1,
        created_by=admin.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    firestore_sync.sync_task_assessment(_to_dict(a))
    return a


@router.get("/{assessment_id}/activities", response_model=list[TaskActivityResponse])
def list_activities(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task assessment not found.")
    return _activities(assessment_id, db)


@router.post("/{assessment_id}/activities", response_model=TaskActivityResponse, status_code=status.HTTP_201_CREATED)
def create_activity(
    assessment_id: UUID,
    body: TaskActivityCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    a = db.exec(select(TaskAssessment).where(TaskAssessment.id == assessment_id)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Task assessment not found.")
    act = TaskActivity(
        task_assessment_id=assessment_id,
        prompt=body.prompt,
        max_marks=body.max_marks,
        sort_order=body.sort_order,
    )
    db.add(act)
    db.commit()
    db.refresh(act)
    return act


@router.patch("/activities/{activity_id}", response_model=TaskActivityResponse)
def update_activity(
    activity_id: UUID,
    body: TaskActivityUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    act = db.exec(select(TaskActivity).where(TaskActivity.id == activity_id)).first()
    if not act:
        raise HTTPException(status_code=404, detail="Activity not found.")
    apply_update(act, body)
    db.add(act)
    db.commit()
    db.refresh(act)
    return act


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    act = db.exec(select(TaskActivity).where(TaskActivity.id == activity_id)).first()
    if not act:
        raise HTTPException(status_code=404, detail="Activity not found.")
    db.delete(act)
    db.commit()


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
    if a.is_active:
        _require_ready_to_sit(a, db)
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
    for act in _activities(assessment_id, db):
        db.delete(act)
    db.flush()
    db.delete(a)
    db.commit()
    firestore_sync.delete_task_assessment(str(assessment_id))


@router.get("/{assessment_id}/results", response_model=list[TaskResultWithWorker])
def list_task_results(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    rows = db.exec(
        select(TaskAssessmentResult, Worker)
        .join(Worker, Worker.id == TaskAssessmentResult.worker_id)
        .where(TaskAssessmentResult.source_id == assessment_id)
        .order_by(TaskAssessmentResult.created_at.desc())
    ).all()
    result = []
    for r, w in rows:
        item = TaskResultWithWorker.model_validate(r)
        item.worker_display_name = w.display_name
        item.worker_country      = w.country
        result.append(item)
    return result


@router.patch("/results/{result_id}/score", response_model=TaskResultResponse)
def patch_task_score(
    result_id: UUID,
    body: TaskResultScorePatch,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    r = db.exec(select(TaskAssessmentResult).where(TaskAssessmentResult.id == result_id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found.")
    score = Decimal(body.score_pct)
    if score < 0 or score > 100:
        raise HTTPException(status_code=400, detail="Score must be between 0 and 100.")
    admin = get_admin_user(db, current_user)
    r.score_pct = score
    passing = Decimal("70")
    if r.task_assessment_id:
        a = db.get(TaskAssessment, r.task_assessment_id)
        if a:
            passing = a.passing_score_pct
    r.passed = score >= passing
    r.graded_at = datetime.now(timezone.utc)
    r.graded_by = admin.id
    r.status = TaskResultStatusEnum.graded
    db.add(r)
    db.commit()
    db.refresh(r)
    firestore_sync.sync_task_result(_to_dict(r))
    return r


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
    acts = []
    if r.task_assessment_id:
        acts = _activities(r.task_assessment_id, db)

    if body.activity_scores:
        by_id = {str(a.id): a for a in acts}
        total = Decimal("0")
        existing = db.exec(
            select(TaskResultActivityScore).where(TaskResultActivityScore.result_id == r.id)
        ).all()
        for row in existing:
            db.delete(row)
        db.flush()
        for item in body.activity_scores:
            act = by_id.get(str(item.activity_id)) if item.activity_id else None
            max_m = Decimal(act.max_marks) if act else Decimal("100")
            awarded = Decimal(item.marks_awarded)
            if awarded < 0 or awarded > max_m:
                raise HTTPException(
                    status_code=400,
                    detail=f"Marks must be between 0 and {max_m}.",
                )
            db.add(TaskResultActivityScore(
                result_id=r.id,
                activity_id=act.id if act else None,
                prompt_snapshot=act.prompt if act else "Activity",
                max_marks_snapshot=max_m,
                marks_awarded=awarded,
            ))
            total += awarded
        r.score_pct = total.quantize(Decimal("0.01"))
        if r.score_pct > 100:
            r.score_pct = Decimal("100.00")
    elif body.score_pct is not None:
        r.score_pct = body.score_pct
    else:
        raise HTTPException(status_code=400, detail="Provide activity_scores or score_pct.")

    passing = Decimal("70")
    if r.task_assessment_id:
        a = db.get(TaskAssessment, r.task_assessment_id)
        if a:
            passing = a.passing_score_pct
    r.passed = body.passed if body.passed is not None else (r.score_pct >= passing)
    r.grader_notes = body.grader_notes
    r.graded_at = datetime.now(timezone.utc)
    r.graded_by = admin.id
    r.status = TaskResultStatusEnum.graded
    db.add(r)
    db.commit()
    db.refresh(r)
    firestore_sync.sync_task_result(_to_dict(r))
    return r


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
    _require_ready_to_sit(a, db)
    existing = _current_task_result(db, worker.id, assessment_id)
    _enforce_attempts(a, existing)

    now = datetime.now(timezone.utc)
    if existing:
        existing.task_assessment_id = assessment_id
        existing.title_snapshot = a.title
        existing.status = TaskResultStatusEnum.submitted
        existing.submission_notes = body.get("submission_notes")
        existing.submission_media_urls = body.get("submission_media_urls", [])
        existing.submitted_at = now
        existing.time_taken_seconds = body.get("time_taken_seconds")
        existing.attempt_count = (existing.attempt_count or 1) + 1
        r = existing
        db.add(r)
    else:
        r = TaskAssessmentResult(
            task_assessment_id=assessment_id,
            source_id=assessment_id,
            title_snapshot=a.title,
            worker_id=worker.id,
            status=TaskResultStatusEnum.submitted,
            submission_notes=body.get("submission_notes"),
            submission_media_urls=body.get("submission_media_urls", []),
            submitted_at=now,
            time_taken_seconds=body.get("time_taken_seconds"),
            attempt_count=1,
        )
        db.add(r)
    db.commit()
    db.refresh(r)
    firestore_sync.sync_task_result(_to_dict(r))
    return r
