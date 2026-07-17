from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.enums import TrainingProgressEnum
from models.mcq import McqResult
from models.notification import Notification
from models.task_assessment import TaskAssessmentResult
from models.training import TrainingLesson, TrainingModule, TrainingProgress
from schemas.training import (
    TrainingLessonCreate,
    TrainingLessonResponse,
    TrainingLessonUpdate,
    TrainingModuleCreate,
    TrainingModuleResponse,
    TrainingModuleUpdate,
    TrainingProgressResponse,
)
from .deps import apply_update, get_admin_user, get_worker_for_user

router = APIRouter()


def _module_response(module: TrainingModule, progress: TrainingProgress | None = None) -> TrainingModuleResponse:
    resp = TrainingModuleResponse.model_validate(module)
    resp.lessons = sorted(
        [TrainingLessonResponse.model_validate(l) for l in module.lessons],
        key=lambda l: l.sort_order,
    )
    if progress:
        resp.progress_status = progress.status
        resp.completed_lesson_ids = progress.completed_lesson_ids or []
    return resp


def _assessment_passed(db: Session, module: TrainingModule, worker_id: UUID) -> bool:
    """True when the module has no linked assessment or the worker passed one."""
    if module.mcq_set_id:
        passed = db.exec(
            select(McqResult).where(
                McqResult.worker_id == worker_id,
                McqResult.assessment_set_id == module.mcq_set_id,
                McqResult.passed.is_(True),
            )
        ).first()
        return passed is not None
    if module.task_assessment_id:
        passed = db.exec(
            select(TaskAssessmentResult).where(
                TaskAssessmentResult.worker_id == worker_id,
                TaskAssessmentResult.task_assessment_id == module.task_assessment_id,
                TaskAssessmentResult.passed.is_(True),
            )
        ).first()
        return passed is not None
    return True


# ── Admin: modules ─────────────────────────────────────────────────────────────

@router.get("/modules", response_model=list[TrainingModuleResponse])
def list_modules(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    modules = db.exec(select(TrainingModule).order_by(TrainingModule.created_at.desc())).all()
    return [_module_response(m) for m in modules]


@router.post("/modules", response_model=TrainingModuleResponse, status_code=status.HTTP_201_CREATED)
def create_module(
    body: TrainingModuleCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    admin = get_admin_user(db, current_user)
    module = TrainingModule(**body.model_dump(), created_by=admin.id)
    db.add(module)
    db.commit()
    db.refresh(module)

    # Notify all workers about the newly published training.
    if module.is_active:
        db.add(Notification(
            sender_admin_id=admin.id,
            title="New training available",
            message=f'A new training module "{module.title}" has been published. Open Training to take it.',
            target_type="all",
        ))
        db.commit()
    return _module_response(module)


@router.patch("/modules/{module_id}", response_model=TrainingModuleResponse)
def update_module(
    module_id: UUID,
    body: TrainingModuleUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    module = db.get(TrainingModule, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Training module not found")
    apply_update(module, body)
    db.add(module)
    db.commit()
    db.refresh(module)
    return _module_response(module)


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    module_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    module = db.get(TrainingModule, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Training module not found")
    db.delete(module)
    db.commit()


# ── Admin: lessons ─────────────────────────────────────────────────────────────

@router.post("/lessons", response_model=TrainingLessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(
    body: TrainingLessonCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not db.get(TrainingModule, body.module_id):
        raise HTTPException(status_code=404, detail="Training module not found")
    lesson = TrainingLesson(**body.model_dump())
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.patch("/lessons/{lesson_id}", response_model=TrainingLessonResponse)
def update_lesson(
    lesson_id: UUID,
    body: TrainingLessonUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    lesson = db.get(TrainingLesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    apply_update(lesson, body)
    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    return lesson


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    lesson_id: UUID,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    lesson = db.get(TrainingLesson, lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.delete(lesson)
    db.commit()


@router.get("/progress", response_model=list[TrainingProgressResponse])
def list_all_progress(
    module_id: UUID | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(TrainingProgress)
    if module_id:
        stmt = stmt.where(TrainingProgress.module_id == module_id)
    return db.exec(stmt).all()


# ── Worker: my training ────────────────────────────────────────────────────────

@router.get("/my-modules", response_model=list[TrainingModuleResponse])
def my_modules(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    modules = db.exec(
        select(TrainingModule).where(TrainingModule.is_active.is_(True)).order_by(TrainingModule.created_at)
    ).all()
    progress = {
        p.module_id: p
        for p in db.exec(
            select(TrainingProgress).where(TrainingProgress.worker_id == worker.id)
        ).all()
    }
    return [_module_response(m, progress.get(m.id)) for m in modules]


@router.post("/modules/{module_id}/start", response_model=TrainingProgressResponse)
def start_module(
    module_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    module = db.get(TrainingModule, module_id)
    if not module or not module.is_active:
        raise HTTPException(status_code=404, detail="Training module not found")

    progress = db.exec(
        select(TrainingProgress).where(
            TrainingProgress.module_id == module_id,
            TrainingProgress.worker_id == worker.id,
        )
    ).first()
    if not progress:
        progress = TrainingProgress(
            module_id=module_id,
            worker_id=worker.id,
            status=TrainingProgressEnum.in_progress,
            started_at=datetime.now(timezone.utc),
        )
        db.add(progress)
        db.commit()
        db.refresh(progress)
    return progress


@router.post("/modules/{module_id}/lessons/{lesson_id}/complete", response_model=TrainingProgressResponse)
def complete_lesson(
    module_id: UUID,
    lesson_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_user),
):
    worker = get_worker_for_user(db, current_user)
    module = db.get(TrainingModule, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Training module not found")

    progress = db.exec(
        select(TrainingProgress).where(
            TrainingProgress.module_id == module_id,
            TrainingProgress.worker_id == worker.id,
        )
    ).first()
    if not progress:
        progress = TrainingProgress(
            module_id=module_id,
            worker_id=worker.id,
            status=TrainingProgressEnum.in_progress,
            started_at=datetime.now(timezone.utc),
        )

    completed = set(progress.completed_lesson_ids or [])
    completed.add(str(lesson_id))
    progress.completed_lesson_ids = sorted(completed)

    lesson_ids = {str(l.id) for l in module.lessons}
    all_lessons_done = lesson_ids.issubset(completed)
    if all_lessons_done and _assessment_passed(db, module, worker.id):
        progress.status = TrainingProgressEnum.completed
        progress.completed_at = datetime.now(timezone.utc)
    else:
        progress.status = TrainingProgressEnum.in_progress

    db.add(progress)
    db.commit()
    db.refresh(progress)
    return progress
