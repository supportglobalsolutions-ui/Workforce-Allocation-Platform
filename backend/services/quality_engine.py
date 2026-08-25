"""
Composite quality scoring engine (confirmed weights):

  40% assessment scores   — one current 0–100 per named test; average those scores
                            (period window, or all tests when viewing All periods)
  20% admin ratings       — 1-5 manual ratings averaged over all
                            payroll periods, normalized to 0-100
  15% reliability         — finished vs not-finished closed sessions
  25% consistency         — paid hours, unique days, weeks present (average of three 0–100s)

Reliability is finish quality only (not hours). Consistency is how much they
worked (screenshot hours, unique days) and whether they showed up across weeks.
Caps: ~40 paid hours / 30 days is a full hours score; 3 session-days / 7
calendar days is a full days score. Weeks score is weeks with paid hours
divided by ISO weeks in the period.

Each component contributes only its assigned slice of the 100-point score.
Missing data contributes zero; weights are never re-normalized.

Leaderboard views: "calendar" (current calendar month), "payroll" (one snapshot
per payroll period), and "all" (all-time tests and sessions). One shared board —
partners and GS workers rank together.
"""
import logging
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
from uuid import UUID

from sqlmodel import Session, delete, select

from models.enums import IndicatorInputEnum, SessionCloseEnum
from models.mcq import McqResult
from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore, QualityIndicator, QualityIndicatorRating
from models.session import Session as WorkSession
from models.task_assessment import TaskAssessmentResult
from models.worker import Worker
from services.period_current import resolve_current_period
from services.period_labels import period_label_from_date

logger = logging.getLogger(__name__)

WEIGHTS = {
    "assessment": Decimal("0.40"),
    "rating": Decimal("0.20"),
    "reliability": Decimal("0.15"),
    "consistency": Decimal("0.25"),
}
TWO_DP = Decimal("0.01")
HOURS_FULL_PER_30_DAYS = Decimal("40")
DAYS_FULL_PER_7_DAYS = Decimal("3")
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
    return resolve_current_period(db)


def _as_utc_date(stamp) -> Optional[date]:
    if stamp is None:
        return None
    if isinstance(stamp, datetime):
        t = stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)
        return t.astimezone(timezone.utc).date()
    return stamp


def _window_for(
    db: Session,
    period_type: str,
    payroll_period: Optional[PayrollPeriod] = None,
) -> tuple[date, date, str]:
    today = date.today()
    if period_type == "all":
        return date(1970, 1, 1), today, "All periods"
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


def _assessment_component(
    db: Session,
    worker_id,
    start: Optional[date] = None,
    end: Optional[date] = None,
    all_periods: bool = False,
) -> Optional[Decimal]:
    """Average of the current 0–100 score for each named test.

    One row per worker per test: a retake overwrites that score. A named period
    averages tests whose current completion/grade date falls in the window.
    All periods averages every current test score.
    """
    scores: list[Decimal] = []

    def include(stamp) -> bool:
        if all_periods:
            return True
        if start is None or end is None:
            return True
        d = _as_utc_date(stamp)
        return d is not None and start <= d <= end

    for r in db.exec(select(McqResult).where(McqResult.worker_id == worker_id)).all():
        if include(r.completed_at):
            scores.append(Decimal(r.score_pct))

    for r in db.exec(
        select(TaskAssessmentResult).where(
            TaskAssessmentResult.worker_id == worker_id,
            TaskAssessmentResult.score_pct.is_not(None),
        )
    ).all():
        if include(r.graded_at or r.submitted_at or r.created_at):
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
    """Finished sessions ÷ closed sessions × 100. Hours are not in this score."""
    closed = [s for s in sessions if s.close_status is not None]
    if not closed:
        return None
    completed = sum(1 for s in closed if s.close_status == SessionCloseEnum.completed)
    return _q(Decimal(completed) / Decimal(len(closed)) * 100)


def _window_days(start: date, end: date) -> int:
    return max(1, (end - start).days + 1)


def _session_day(session: WorkSession) -> date:
    t = session.start_time
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc).date()


def _paid_minutes(session: WorkSession) -> int:
    """Screenshot start/end only. Does not write duration_minutes."""
    start, end = session.image_start_at, session.image_end_at
    if not start or not end:
        return 0
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    minutes = int((end - start).total_seconds() // 60)
    return max(0, minutes)


def _cap100(actual: Decimal, cap: Decimal) -> Decimal:
    if cap <= 0 or actual <= 0:
        return Decimal("0")
    if actual >= cap:
        return Decimal("100")
    return _q(actual / cap * 100)


def _iso_weeks_in_window(start: date, end: date) -> set[tuple[int, int]]:
    weeks: set[tuple[int, int]] = set()
    cursor = start
    while cursor <= end:
        iso = cursor.isocalendar()
        weeks.add((iso[0], iso[1]))
        cursor += timedelta(days=1)
    return weeks


def _weeks_present_raw(worked: set[tuple[int, int]], start: date, end: date) -> Decimal:
    period_weeks = _iso_weeks_in_window(start, end)
    if not period_weeks:
        return Decimal("0")
    hit = sum(1 for w in period_weeks if w in worked)
    return _q(Decimal(hit) / Decimal(len(period_weeks)) * 100)


def _consistency_component(sessions: list[WorkSession], start: date, end: date) -> Optional[Decimal]:
    """Average of hours, unique days, and weeks present, each 0–100.

    Hours use screenshot start/end only. Several logins on one calendar day
    count as one day. Weeks = ISO weeks in the window that have paid hours.
    """
    if not sessions:
        return None

    days = Decimal(_window_days(start, end))
    hours_cap = HOURS_FULL_PER_30_DAYS * days / Decimal(30)
    days_cap = DAYS_FULL_PER_7_DAYS * days / Decimal(7)

    paid_minutes = 0
    weekly: set[tuple[int, int]] = set()
    present: set[date] = set()
    for s in sessions:
        present.add(_session_day(s))
        minutes = _paid_minutes(s)
        if minutes <= 0:
            continue
        paid_minutes += minutes
        iso = _session_day(s).isocalendar()
        weekly.add((iso[0], iso[1]))

    hours_raw = _cap100(Decimal(paid_minutes) / Decimal(60), hours_cap)
    days_raw = _cap100(Decimal(len(present)), days_cap)
    weeks_raw = _weeks_present_raw(weekly, start, end)
    return _q((hours_raw + days_raw + weeks_raw) / Decimal("3"))


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
    Reliability: finished-session share × 15% = maximum 15 points
    Consistency: average of hours, days, weeks present × 25% = maximum 25 points

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
            "assessment": _assessment_component(
                db,
                worker.id,
                start=start,
                end=end,
                all_periods=period_type == "all",
            ),
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
        "all": recalculate(db, "all"),
    }
