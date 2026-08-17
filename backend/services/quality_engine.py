"""
Composite quality scoring engine (confirmed weights):

  40% assessment scores   — MCQ + graded task assessment average
  20% admin ratings       — 1-5 manual ratings averaged over all
                            payroll periods, normalized to 0-100
  25% reliability         — completed vs abandoned sessions in the window
  15% consistency         — low variance of weekly hours in the window

Each component contributes only its assigned slice of the 100-point score.
Missing data contributes zero; weights are never re-normalized.

Two leaderboard views are maintained: "calendar" (current calendar month) and
"payroll" (one snapshot per payroll period). One shared board — partners and
GS workers rank together.
"""
import logging
import statistics
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlmodel import Session, col, delete, select

from models.enums import IndicatorInputEnum, SessionCloseEnum
from models.mcq import McqResult
from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore, QualityIndicator, QualityIndicatorRating
from models.session import Session as WorkSession
from models.task_assessment import TaskAssessmentResult
from models.worker import Worker
from services.period_labels import period_label_from_date

logger = logging.getLogger(__name__)

WEIGHTS = {
    "assessment": Decimal("0.40"),
    "rating": Decimal("0.20"),
    "reliability": Decimal("0.25"),
    "consistency": Decimal("0.15"),
}
TWO_DP = Decimal("0.01")
DEFAULT_RATING_INDICATOR = {
    "code": "admin_overall",
    "name": "Admin Overall Rating",
    "description": "Overall 1-5 admin rating, given at each payroll period end.",
    "weight_in_subjective_pool": Decimal("100.00"),
    "input_mode": IndicatorInputEnum.manual,
    "scale_min": 1,
    "scale_max": 5,
}


def _q(v: Decimal) -> Decimal:
    return v.quantize(TWO_DP, rounding=ROUND_HALF_UP)


def ensure_default_indicator(db: Session) -> QualityIndicator:
    indicator = db.exec(
        select(QualityIndicator).where(QualityIndicator.code == DEFAULT_RATING_INDICATOR["code"])
    ).first()
    if not indicator:
        indicator = QualityIndicator(**DEFAULT_RATING_INDICATOR)
        db.add(indicator)
        db.commit()
        db.refresh(indicator)
    return indicator


def _latest_payroll_period(db: Session) -> Optional[PayrollPeriod]:
    return db.exec(select(PayrollPeriod).order_by(col(PayrollPeriod.start_date).desc())).first()


def _window_for(
    db: Session,
    period_type: str,
    payroll_period: Optional[PayrollPeriod] = None,
) -> tuple[date, date, str]:
    today = date.today()
    if period_type == "payroll":
        period = payroll_period or _latest_payroll_period(db)
        if period:
            return period.start_date, period.end_date, period.label
    start = today.replace(day=1)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1) - timedelta(days=1)
    else:
        end = start.replace(month=start.month + 1) - timedelta(days=1)
    return start, end, period_label_from_date(start)


def _assessment_component(db: Session, worker_id) -> Optional[Decimal]:
    scores: list[Decimal] = []
    for r in db.exec(select(McqResult).where(McqResult.worker_id == worker_id)).all():
        scores.append(Decimal(r.score_pct))
    for r in db.exec(
        select(TaskAssessmentResult).where(
            TaskAssessmentResult.worker_id == worker_id,
            TaskAssessmentResult.score_pct.is_not(None),
        )
    ).all():
        scores.append(Decimal(r.score_pct))
    if not scores:
        return None
    return _q(sum(scores) / len(scores))


def _rating_component(db: Session, worker_id, indicators: dict) -> Optional[Decimal]:
    """Average of every period's 1-5 rating, normalized to 0-100.

    Prefers ratings linked to a payroll_period_id. Legacy ratings (no period)
    still count, keyed by their own id so they do not collide with periods.
    """
    ratings = db.exec(
        select(QualityIndicatorRating).where(QualityIndicatorRating.worker_id == worker_id)
    ).all()

    by_key: dict = {}
    for r in ratings:
        key = r.payroll_period_id or r.id
        if r.payroll_period_id is not None or key not in by_key:
            by_key[key] = r

    normalized: list[Decimal] = []
    for r in by_key.values():
        indicator = indicators.get(r.indicator_id)
        scale_max = Decimal(indicator.scale_max) if indicator else Decimal(5)
        if scale_max > 0:
            normalized.append(Decimal(r.score) / scale_max * 100)
    if not normalized:
        return None
    return _q(sum(normalized) / len(normalized))


def _reliability_component(sessions: list[WorkSession]) -> Optional[Decimal]:
    closed = [s for s in sessions if s.close_status is not None]
    if not closed:
        return None
    completed = sum(1 for s in closed if s.close_status == SessionCloseEnum.completed)
    return _q(Decimal(completed) / Decimal(len(closed)) * 100)


def _consistency_component(sessions: list[WorkSession], start: date, end: date) -> Optional[Decimal]:
    """100 minus the coefficient of variation of weekly hours (bounded to 0-100)."""
    weekly: dict[int, float] = {}
    for s in sessions:
        if not s.duration_minutes:
            continue
        week = s.start_time.date().isocalendar()[1]
        weekly[week] = weekly.get(week, 0.0) + s.duration_minutes / 60.0
    values = list(weekly.values())
    if len(values) < 2:
        return None
    mean = statistics.mean(values)
    if mean <= 0:
        return None
    cv = statistics.pstdev(values) / mean
    score = max(0.0, min(100.0, 100.0 * (1 - cv)))
    return _q(Decimal(str(score)))


def _streak_days(sessions: list[WorkSession]) -> int:
    days = {s.start_time.date() for s in sessions}
    if not days:
        return 0
    streak, cursor = 0, max(days)
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _composite_score(components: dict[str, Optional[Decimal]]) -> Decimal:
    """Quality intelligence layer: convert each raw 0–100 signal to its score slice.

    Assessment:  raw average × 40% = maximum 40 points
    Rating:      normalized 1–5 average × 20% = maximum 20 points
    Reliability: completed-session share × 25% = maximum 25 points
    Consistency: weekly-hours stability × 15% = maximum 15 points

    A missing signal gives no points for its slice, preventing partial data from
    inflating a worker's score. For example, a 5/5 admin-only rating is 20.00.
    """
    points = [
        (value if value is not None else Decimal("0")) * WEIGHTS[key]
        for key, value in components.items()
    ]
    return _q(sum(points, Decimal("0")))


def recalculate(
    db: Session,
    period_type: str = "calendar",
    payroll_period_id: Optional[UUID] = None,
) -> dict:
    """Recompute composite scores + ranks for one leaderboard view or named period."""
    payroll_period: Optional[PayrollPeriod] = None
    if period_type == "payroll":
        if payroll_period_id:
            payroll_period = db.get(PayrollPeriod, payroll_period_id)
            if not payroll_period:
                raise ValueError("Payroll period not found")
        else:
            payroll_period = _latest_payroll_period(db)

    start, end, label = _window_for(db, period_type, payroll_period)
    indicators = {i.id: i for i in db.exec(select(QualityIndicator)).all()}
    workers = db.exec(select(Worker)).all()

    window_start = datetime.combine(start, time.min, tzinfo=timezone.utc)
    window_end = datetime.combine(end, time.max, tzinfo=timezone.utc)

    results: list[dict] = []
    for worker in workers:
        sessions = db.exec(
            select(WorkSession).where(
                WorkSession.worker_id == worker.id,
                WorkSession.start_time >= window_start,
                WorkSession.start_time <= window_end,
            )
        ).all()

        components = {
            "assessment": _assessment_component(db, worker.id),
            "rating": _rating_component(db, worker.id, indicators),
            "reliability": _reliability_component(sessions),
            "consistency": _consistency_component(sessions, start, end),
        }
        if all(value is None for value in components.values()):
            continue

        composite = _composite_score(components)
        results.append({
            "worker": worker,
            "components": components,
            "composite": composite,
            "streak": _streak_days(sessions),
        })

    results.sort(key=lambda r: r["composite"], reverse=True)

    if period_type == "payroll" and payroll_period:
        db.exec(
            delete(QualityCompositeScore).where(
                QualityCompositeScore.payroll_period_id == payroll_period.id
            )
        )
        latest = _latest_payroll_period(db)
        if latest and latest.id == payroll_period.id:
            db.exec(
                delete(QualityCompositeScore).where(
                    QualityCompositeScore.period_type == "payroll",
                    QualityCompositeScore.payroll_period_id.is_(None),
                )
            )
    else:
        db.exec(delete(QualityCompositeScore).where(QualityCompositeScore.period_type == period_type))

    country_counters: dict[str, int] = {}
    for global_rank, row in enumerate(results, start=1):
        worker: Worker = row["worker"]
        country_counters[worker.country] = country_counters.get(worker.country, 0) + 1
        c = row["components"]
        db.add(QualityCompositeScore(
            worker_id=worker.id,
            mcq_component=c["assessment"] or Decimal("0"),
            subjective_component=c["rating"] or Decimal("0"),
            composite_score=row["composite"],
            assessment_component=c["assessment"],
            rating_component=c["rating"],
            reliability_component=c["reliability"],
            consistency_component=c["consistency"],
            period_type=period_type,
            period_label=label,
            payroll_period_id=payroll_period.id if payroll_period else None,
            country_rank=country_counters[worker.country],
            global_rank=global_rank,
            session_streak_days=row["streak"],
        ))
    db.commit()
    return {
        "period_type": period_type,
        "period_label": label,
        "payroll_period_id": str(payroll_period.id) if payroll_period else None,
        "workers_ranked": len(results),
    }


def recalculate_all(db: Session) -> dict:
    latest = _latest_payroll_period(db)
    return {
        "calendar": recalculate(db, "calendar"),
        "payroll": recalculate(
            db,
            "payroll",
            payroll_period_id=latest.id if latest else None,
        ),
    }
