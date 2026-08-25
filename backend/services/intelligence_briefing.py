"""Rule-based ops briefing on top of the intelligence snapshot.

Pay, time, fleet, and quality each run as isolated rules. A crash in one rule
is a warning; the rest of the briefing still returns. No writes, no emails.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Callable
from uuid import UUID

from sqlmodel import Session, select

from models.payroll import PayrollPeriod
from models.quality import QualityCompositeScore
from services.intelligence_engine import build_snapshot, fetch_sessions_in_range

logger = logging.getLogger(__name__)

WEEK_DAYS = 7
QUALITY_FLOOR = 70.0
QUALITY_DROP = 8.0
GHOST_RATIO = 0.5
GHOST_RDP_HOURS_MIN = 1.0
VOLUME_SLIP = 0.7
VOLUME_PREV_HOURS_MIN = 2.0
CONCENTRATION_SHARE = 0.6
CONCENTRATION_MIN_MACHINES = 3
BROKEN_NET = 1.0
BROKEN_HOURS = 0.5
MAX_MOVES = 7
MAX_ENTITIES = 8
OUT_OF_FLEET = {"offline", "maintenance", "admin_locked"}
SEVERITY_RANK = {"critical": 0, "watch": 1, "clear": 2}

HREF_PAYROLL = "/admin/payroll"
HREF_SESSIONS = "/admin/sessions"
HREF_RDP = "/admin/rdp"
HREF_QUALITY = "/admin/quality"


def _num(value: Any) -> float:
    try:
        n = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return n if n == n else 0.0  # NaN


def _hours(minutes: int) -> float:
    return round(max(0, minutes) / 60.0, 2)


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _work_minutes(session: dict[str, Any]) -> int:
    start = _parse_dt(session.get("image_start_at"))
    end = _parse_dt(session.get("image_end_at"))
    if not start or not end or end <= start:
        return 0
    return int((end - start).total_seconds() // 60)


def _rdp_minutes(session: dict[str, Any], now: datetime) -> int:
    start = _parse_dt(session.get("start_time"))
    if not start:
        return 0
    end = _parse_dt(session.get("end_time")) or now
    if end < start:
        return 0
    return int((end - start).total_seconds() // 60)


def _closed(session: dict[str, Any]) -> bool:
    return bool(session.get("end_time"))


def _has_evidence(session: dict[str, Any]) -> bool:
    return bool(session.get("image_start_at") and session.get("image_end_at"))


def _day(session: dict[str, Any]) -> str:
    start = session.get("start_time") or ""
    return start[:10]


def _source_data(snap: dict[str, Any], key: str) -> list | dict:
    block = snap.get(key) or {}
    return block.get("data") if isinstance(block, dict) else []


def _names(rows: list[dict[str, Any]], id_key: str, name_key: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in rows:
        rid = row.get(id_key)
        if rid:
            out[str(rid)] = str(row.get(name_key) or "Unknown")
    return out


def _isolate_rule(label: str, run: Callable[[], dict[str, Any] | None]) -> dict[str, Any] | None:
    try:
        return run()
    except Exception:
        logger.exception("briefing rule failed: %s", label)
        return {"_error": f"{label}: failed"}


def _step(label: str, href: str | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"label": label}
    if href:
        item["href"] = href
    return item


def _result(
    *,
    rule_id: str,
    domain: str,
    severity: str,
    headline: str,
    why: str,
    count: int = 0,
    hours_at_risk: float = 0,
    amount_at_risk: float = 0,
    entities: list[dict[str, Any]] | None = None,
    evidence: dict[str, Any] | None = None,
    steps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": rule_id,
        "domain": domain,
        "severity": severity,
        "headline": headline,
        "why": why,
        "count": count,
        "hours_at_risk": round(hours_at_risk, 2),
        "amount_at_risk": round(amount_at_risk, 2),
        "entities": (entities or [])[:MAX_ENTITIES],
        "evidence": evidence or {"kind": "list", "labels": [], "values": []},
        "steps": steps or [],
    }


def _worker_entities(
    worker_ids: list[str],
    names: dict[str, str],
    detail: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for wid in worker_ids:
        if not wid or wid in seen:
            continue
        seen.add(wid)
        row: dict[str, Any] = {"type": "worker", "id": wid, "name": names.get(wid, "Unknown")}
        if detail and wid in detail:
            row["detail"] = detail[wid]
        out.append(row)
    return out


def _rdp_entities(rdp_ids: list[str], names: dict[str, str], detail: dict[str, str] | None = None) -> list[dict[str, Any]]:
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for rid in rdp_ids:
        if not rid or rid in seen:
            continue
        seen.add(rid)
        row: dict[str, Any] = {"type": "rdp", "id": rid, "name": names.get(rid, "Unknown RDP")}
        if detail and rid in detail:
            row["detail"] = detail[rid]
        out.append(row)
    return out


def _bars(labels: list[str], values: list[float]) -> dict[str, Any]:
    return {"kind": "bars", "labels": labels, "values": values}


# ── Rules ──────────────────────────────────────────────────────────────────────

def _rule_no_calculate(month_sessions: list, payslips: list) -> dict[str, Any]:
    month_minutes = sum(_work_minutes(s) or _rdp_minutes(s, datetime.now(timezone.utc)) for s in month_sessions)
    if payslips:
        return _result(
            rule_id="calculate-run",
            domain="pay",
            severity="clear",
            headline=f"{len(payslips)} payslips are on this month",
            why="Pay for this month is already calculated. Run Calculate again when new hours come in.",
            count=len(payslips),
        )
    if month_minutes <= 0 and not month_sessions:
        return _result(
            rule_id="calculate-run",
            domain="pay",
            severity="watch",
            headline="No work and no payslips this month",
            why="Nobody logged time, or nothing was saved. Check sessions before you report this month.",
            steps=[_step("Open Sessions", HREF_SESSIONS), _step("Run Calculate on Finance if hours exist", HREF_PAYROLL)],
        )
    return _result(
        rule_id="calculate-run",
        domain="pay",
        severity="critical",
        headline="Pay has not been calculated this month",
        why="There is work time but no payslips. Open Finance and run Calculate.",
        count=len(month_sessions),
        hours_at_risk=_hours(month_minutes),
        steps=[_step("Open Finance and run Calculate", HREF_PAYROLL), _step("Open Sessions", HREF_SESSIONS)],
    )


def _rule_invisible_payday(
    week_sessions: list, payslips: list, names: dict[str, str], now: datetime,
) -> dict[str, Any]:
    paid = {str(p.get("worker_id")) for p in payslips if p.get("worker_id")}
    hours_by_worker: dict[str, int] = {}
    for s in week_sessions:
        minutes = _work_minutes(s)
        if minutes <= 0:
            minutes = _rdp_minutes(s, now)
        if minutes <= 0:
            continue
        wid = str(s.get("worker_id") or "")
        if not wid:
            continue
        hours_by_worker[wid] = hours_by_worker.get(wid, 0) + minutes
    missing = [wid for wid in hours_by_worker if wid not in paid]
    if not missing:
        if not hours_by_worker:
            headline = "No hours this week to miss on payday"
            why = "Nobody logged time this week."
        else:
            headline = "Everyone who worked this week has a payslip"
            why = "Nobody who worked is missing from this month's pay list."
        return _result(
            rule_id="invisible-payday",
            domain="pay",
            severity="clear",
            headline=headline,
            why=why,
            count=0,
        )
    missing.sort(key=lambda w: hours_by_worker[w], reverse=True)
    total_min = sum(hours_by_worker[w] for w in missing)
    detail = {w: f"{_hours(hours_by_worker[w]):.2f}h this week" for w in missing}
    return _result(
        rule_id="invisible-payday",
        domain="pay",
        severity="critical",
        headline=f"{len(missing)} people worked this week but have no payslip",
        why="They will not get paid until you run Calculate on Finance.",
        count=len(missing),
        hours_at_risk=_hours(total_min),
        entities=_worker_entities(missing, names, detail),
        evidence=_bars(
            [names.get(w, "Unknown") for w in missing[:6]],
            [_hours(hours_by_worker[w]) for w in missing[:6]],
        ),
        steps=[
            _step("Run Calculate on Finance", HREF_PAYROLL),
            _step("Confirm their screenshot times", HREF_SESSIONS),
        ],
    )


def _rule_broken_payslips(payslips: list, names: dict[str, str]) -> dict[str, Any]:
    broken: list[tuple[str, str, float]] = []
    for p in payslips:
        wid = str(p.get("worker_id") or "")
        hours = _num(p.get("hours_logged"))
        net = _num(p.get("final_net"))
        gross = _num(p.get("gross_earned"))
        name = p.get("worker_display_name") or names.get(wid, "Unknown")
        if hours >= BROKEN_HOURS and net < BROKEN_NET:
            broken.append((wid, f"{name}: {hours:.2f}h, net {net:.2f}", net))
        elif gross > 0 and hours < 0.05:
            broken.append((wid, f"{name}: earned {gross:.2f} with 0.00h", gross))
    if not broken:
        return _result(
            rule_id="broken-payslips",
            domain="pay",
            severity="clear",
            headline="Payslips look correct",
            why="No row has hours with almost no pay, or pay with no hours.",
            count=len(payslips),
        )
    entities = []
    for wid, detail, _amt in broken:
        entities.append({"type": "worker", "id": wid, "name": names.get(wid, "Unknown"), "detail": detail})
    return _result(
        rule_id="broken-payslips",
        domain="pay",
        severity="watch",
        headline=f"{len(broken)} payslips look wrong",
        why="Hours with almost no pay, or pay with no hours. Fix them before you approve the month.",
        count=len(broken),
        amount_at_risk=sum(a for *_, a in broken),
        entities=entities,
        evidence=_bars(
            [b[1].split(":")[0] for b in broken[:6]],
            [abs(b[2]) for b in broken[:6]],
        ),
        steps=[_step("Open Finance and inspect those payslips", HREF_PAYROLL)],
    )


def _rule_ghost(week_sessions: list, month_sessions: list, now: datetime) -> dict[str, Any]:
    def pack(rows: list) -> tuple[int, int]:
        return sum(_work_minutes(s) for s in rows), sum(_rdp_minutes(s, now) for s in rows)

    week_work, week_rdp = pack(week_sessions)
    month_work, month_rdp = pack(month_sessions)
    week_h, rdp_h = _hours(week_work), _hours(week_rdp)
    month_wh, month_rh = _hours(month_work), _hours(month_rdp)
    week_ghost = rdp_h >= GHOST_RDP_HOURS_MIN and week_h < rdp_h * GHOST_RATIO
    month_ghost = month_rh >= GHOST_RDP_HOURS_MIN and month_wh < month_rh * GHOST_RATIO
    if not week_ghost and not month_ghost:
        return _result(
            rule_id="ghost-connection",
            domain="time",
            severity="clear",
            headline="Work time matches connection time",
            why="People are not sitting connected far longer than they work.",
            hours_at_risk=0,
            evidence=_bars(["Week work", "Week RDP", "Month work", "Month RDP"], [week_h, rdp_h, month_wh, month_rh]),
        )
    gap = max(0.0, rdp_h - week_h)
    return _result(
        rule_id="ghost-connection",
        domain="time",
        severity="critical" if week_ghost else "watch",
        headline=f"Connected time is much higher than work time ({week_h:.2f}h work vs {rdp_h:.2f}h connected)",
        why="Do not pay for connected time. Add screenshot times or end idle sessions.",
        count=len(week_sessions),
        hours_at_risk=gap,
        evidence=_bars(["Week work", "Week RDP", "Month work", "Month RDP"], [week_h, rdp_h, month_wh, month_rh]),
        steps=[
            _step("Open Sessions and add screenshot times", HREF_SESSIONS),
            _step("Open Machines and end idle sessions", HREF_RDP),
        ],
    )


def _rule_missing_evidence(week_sessions: list, names: dict[str, str]) -> dict[str, Any]:
    missing = [s for s in week_sessions if _closed(s) and not _has_evidence(s)]
    if not missing:
        closed = [s for s in week_sessions if _closed(s)]
        return _result(
            rule_id="missing-evidence",
            domain="time",
            severity="clear",
            headline="Closed sessions this week have screenshot times" if closed else "No closed sessions this week",
            why="Work hours can be trusted if this stays true.",
            count=0,
        )
    worker_ids = [str(s.get("worker_id") or "") for s in missing]
    return _result(
        rule_id="missing-evidence",
        domain="time",
        severity="critical",
        headline=f"{len(missing)} closed sessions have no screenshot times",
        why="Those hours will not pay. Add start and end times on Sessions.",
        count=len(missing),
        entities=_worker_entities(worker_ids, names),
        evidence=_bars(["Missing evidence", "Closed this week"], [len(missing), len([s for s in week_sessions if _closed(s)])]),
        steps=[
            _step("Open Sessions and complete start/end times", HREF_SESSIONS),
            _step("Do not Calculate until evidence is in", HREF_PAYROLL),
        ],
    )


def _rule_volume_slip(week_sessions: list, prev_sessions: list) -> dict[str, Any]:
    week_h = _hours(sum(_work_minutes(s) for s in week_sessions))
    prev_h = _hours(sum(_work_minutes(s) for s in prev_sessions))
    if prev_h < VOLUME_PREV_HOURS_MIN:
        return _result(
            rule_id="volume-slip",
            domain="time",
            severity="clear",
            headline=f"{week_h:.2f}h of work in the last 7 days",
            why="Not enough last-week hours to compare.",
            hours_at_risk=week_h,
            evidence=_bars(["This week", "Prior week"], [week_h, prev_h]),
        )
    if week_h >= prev_h * VOLUME_SLIP:
        return _result(
            rule_id="volume-slip",
            domain="time",
            severity="clear",
            headline=f"Work this week is steady ({week_h:.2f}h vs {prev_h:.2f}h last week)",
            why="The last 7 days did not drop hard versus the 7 days before that.",
            evidence=_bars(["This week", "Prior week"], [week_h, prev_h]),
        )
    drop_pct = round((1 - week_h / prev_h) * 100) if prev_h else 0
    return _result(
        rule_id="volume-slip",
        domain="time",
        severity="watch",
        headline=f"Work dropped this week ({week_h:.2f}h vs {prev_h:.2f}h last week, down {drop_pct}%)",
        why="See who did not log, and check unused machines.",
        hours_at_risk=max(0.0, prev_h - week_h),
        evidence=_bars(["This week", "Prior week"], [week_h, prev_h]),
        steps=[
            _step("Open Sessions", HREF_SESSIONS),
            _step("Open Machines", HREF_RDP),
        ],
    )


def _rule_parked(
    rdps: list, week_sessions: list, names: dict[str, str],
) -> dict[str, Any]:
    used = {str(s.get("rdp_resource_id")) for s in week_sessions if s.get("rdp_resource_id")}
    in_fleet = [r for r in rdps if str(r.get("status") or "") not in OUT_OF_FLEET]
    producing = [r for r in in_fleet if str(r.get("id")) in used]
    parked = [r for r in in_fleet if str(r.get("id")) not in used]
    idle_status = [r for r in rdps if str(r.get("status") or "") == "idle"]
    if not in_fleet:
        return _result(
            rule_id="parked-machines",
            domain="fleet",
            severity="clear",
            headline="No machines to count",
            why="Offline, maintenance, and locked boxes are left out.",
        )
    if not parked:
        return _result(
            rule_id="parked-machines",
            domain="fleet",
            severity="clear",
            headline=f"Every machine did work this week ({len(in_fleet)})",
            why="No unused machines sitting while others work.",
            count=0,
        )
    if not producing:
        if len(parked) == 1:
            rid = str(parked[0].get("id") or "")
            label = names.get(rid, "This machine")
            headline = f"{label} had no work this week"
        else:
            headline = f"{len(parked)} machines had no work this week"
        return _result(
            rule_id="parked-machines",
            domain="fleet",
            severity="watch",
            headline=headline,
            why="No one logged time on it. Check if there is no client work, or if someone forgot to log in.",
            count=len(parked),
            entities=_rdp_entities([str(r.get("id")) for r in parked], names),
            evidence=_bars(["Working", "Unused", "Idle"], [0, len(parked), len(idle_status)]),
            steps=[_step("Open Machines and assign work", HREF_RDP)],
        )
    detail = {str(r.get("id")): str(r.get("status") or "unknown") for r in parked}
    return _result(
        rule_id="parked-machines",
        domain="fleet",
        severity="watch",
        headline=f"{len(parked)} unused machine{'s' if len(parked) != 1 else ''} while {len(producing)} did work this week",
        why="Give them work, or stop paying for unused boxes.",
        count=len(parked),
        entities=_rdp_entities([str(r.get("id")) for r in parked], names, detail),
        evidence=_bars(["Working", "Unused", "Idle"], [len(producing), len(parked), len(idle_status)]),
        steps=[_step("Open Machines", HREF_RDP)],
    )


def _rule_unattributed(week_sessions: list, rdp_names: dict[str, str], now: datetime) -> dict[str, Any]:
    rows = [s for s in week_sessions if s.get("rdp_resource_id") and not s.get("client_id")]
    if not rows:
        return _result(
            rule_id="unattributed-hours",
            domain="fleet",
            severity="clear",
            headline="Sessions this week are linked to a client",
            why="Hours can go to an owner. Nothing unlinked in the last 7 days.",
        )
    minutes = sum(_rdp_minutes(s, now) for s in rows)
    rdp_ids = [str(s.get("rdp_resource_id")) for s in rows]
    return _result(
        rule_id="unattributed-hours",
        domain="fleet",
        severity="watch",
        headline=f"{len(rows)} sessions this week have no client",
        why="Those hours cannot be billed. Link the machine to a client.",
        count=len(rows),
        hours_at_risk=_hours(minutes),
        entities=_rdp_entities(rdp_ids, rdp_names),
        steps=[_step("Link machines to clients", HREF_RDP)],
    )


def _rule_concentration(week_sessions: list, rdp_names: dict[str, str], now: datetime) -> dict[str, Any]:
    hours_by: dict[str, int] = {}
    for s in week_sessions:
        rid = str(s.get("rdp_resource_id") or "")
        if not rid:
            continue
        hours_by[rid] = hours_by.get(rid, 0) + _rdp_minutes(s, now)
    ranked = sorted(hours_by.items(), key=lambda kv: kv[1], reverse=True)
    total = sum(v for _, v in ranked)
    if len(ranked) < CONCENTRATION_MIN_MACHINES or total <= 0:
        return _result(
            rule_id="concentration",
            domain="fleet",
            severity="clear",
            headline="Not enough machines with time to judge load",
            why="Need at least three machines with time this week.",
            count=len(ranked),
        )
    top_n = max(1, min(2, len(ranked)))
    top = ranked[:top_n]
    share = sum(v for _, v in top) / total
    if share < CONCENTRATION_SHARE:
        return _result(
            rule_id="concentration",
            domain="fleet",
            severity="clear",
            headline="Work is spread across machines this week",
            why=f"The busiest machines hold {share:.0%} of connected time.",
            evidence=_bars(
                [rdp_names.get(rid, rid[:6]) for rid, _ in ranked[:6]],
                [_hours(m) for _, m in ranked[:6]],
            ),
        )
    return _result(
        rule_id="concentration",
        domain="fleet",
        severity="watch",
        headline=f"Most of this week's time is on {top_n} machines ({share:.0%})",
        why="If those machines go down, the week is at risk. Move people onto unused machines.",
        count=top_n,
        hours_at_risk=_hours(sum(v for _, v in top)),
        entities=_rdp_entities([rid for rid, _ in top], rdp_names, {rid: f"{_hours(m):.2f}h" for rid, m in top}),
        evidence=_bars(
            [rdp_names.get(rid, rid[:6]) for rid, _ in ranked[:6]],
            [_hours(m) for _, m in ranked[:6]],
        ),
        steps=[_step("Move people to unused machines", HREF_RDP)],
    )


def _rule_unscored(
    week_sessions: list, quality: list, names: dict[str, str], now: datetime,
) -> dict[str, Any]:
    scored = {str(q.get("worker_id")) for q in quality if q.get("worker_id")}
    worked: dict[str, int] = {}
    for s in week_sessions:
        wid = str(s.get("worker_id") or "")
        if not wid:
            continue
        worked[wid] = worked.get(wid, 0) + max(_work_minutes(s), _rdp_minutes(s, now))
    missing = [w for w, m in worked.items() if m > 0 and w not in scored]
    missing.sort(key=lambda w: worked[w], reverse=True)
    if not missing:
        return _result(
            rule_id="unscored-producers",
            domain="quality",
            severity="clear",
            headline="People who worked this week have a quality score" if worked else "Nobody worked this week to score",
            why="Everyone who sat this week already has a score." if worked else "No one to score until someone logs time.",
            count=0,
        )
    detail = {w: f"{_hours(worked[w]):.2f}h this week" for w in missing}
    return _result(
        rule_id="unscored-producers",
        domain="quality",
        severity="watch",
        headline=f"{len(missing)} people worked this week with no quality score",
        why="Add quality scores for these people.",
        count=len(missing),
        hours_at_risk=_hours(sum(worked[w] for w in missing)),
        entities=_worker_entities(missing, names, detail),
        evidence=_bars(
            [names.get(w, "Unknown") for w in missing[:6]],
            [_hours(worked[w]) for w in missing[:6]],
        ),
        steps=[_step("Score them on Quality", HREF_QUALITY)],
    )


def _rule_quality_floor(quality: list, prev_avg: float | None) -> dict[str, Any]:
    scores = [_num(q.get("composite_score")) for q in quality]
    if not scores:
        return _result(
            rule_id="quality-floor",
            domain="quality",
            severity="watch",
            headline="No quality scores this month",
            why="Score the people who worked before you judge quality.",
            steps=[_step("Open Quality and rate the period", HREF_QUALITY)],
        )
    avg = sum(scores) / len(scores)
    drop = (prev_avg - avg) if prev_avg is not None else 0.0
    if avg < QUALITY_FLOOR:
        return _result(
            rule_id="quality-floor",
            domain="quality",
            severity="critical",
            headline=f"Quality is {avg:.0f} — you need at least {QUALITY_FLOOR:.0f}",
            why=f"{len(scores)} workers were scored this month. Help the lowest scores before you hire anyone new.",
            count=len(scores),
            evidence=_bars(["Average", "Needed"], [round(avg, 1), QUALITY_FLOOR]),
            steps=[_step("Review low scores on Quality", HREF_QUALITY)],
        )
    if prev_avg is not None and drop >= QUALITY_DROP:
        return _result(
            rule_id="quality-floor",
            domain="quality",
            severity="watch",
            headline=f"Quality fell {drop:.1f} points vs last month (now {avg:.1f}, then {prev_avg:.1f})",
            why="Still above the minimum, but it is sliding. Fix it this week.",
            count=len(scores),
            evidence=_bars(["This month", "Last month"], [round(avg, 1), round(prev_avg, 1)]),
            steps=[_step("See who fell on Quality", HREF_QUALITY)],
        )
    return _result(
        rule_id="quality-floor",
        domain="quality",
        severity="clear",
        headline=f"Quality is OK this month ({avg:.1f} average, {len(scores)} scores)",
        why=f"Above the {QUALITY_FLOOR:.0f} minimum."
        + (f" Last month was {prev_avg:.1f}." if prev_avg is not None else ""),
        count=len(scores),
        evidence=_bars(["Average", "Needed"], [round(avg, 1), QUALITY_FLOOR]),
    )


def _rule_quiet_today(today_sessions: list, now: datetime) -> dict[str, Any] | None:
    if today_sessions:
        return None
    return _result(
        rule_id="quiet-today",
        domain="time",
        severity="watch",
        headline="Nobody logged time today yet",
        why=(
            f"As of {now.strftime('%H:%M')} UTC there are no sessions today. "
            "Check if people are working but not logging."
        ),
        steps=[_step("Open Machines", HREF_RDP), _step("Open Sessions", HREF_SESSIONS)],
    )


def _rule_quiet_week(week_sessions: list) -> dict[str, Any] | None:
    if week_sessions:
        return None
    return _result(
        rule_id="quiet-week",
        domain="time",
        severity="watch",
        headline="No work logged in the last 7 days",
        why="Maybe nothing happened — or people forgot to log. Check Sessions before you assume all is fine.",
        steps=[_step("Open Sessions", HREF_SESSIONS), _step("Open Machines", HREF_RDP)],
    )


# ── Scorecard + charts ─────────────────────────────────────────────────────────

def _scorecard(
    *,
    month_sessions: list,
    week_sessions: list,
    today_sessions: list,
    payslips: list,
    rdps: list,
    quality: list,
    now: datetime,
) -> dict[str, Any]:
    used = {str(s.get("rdp_resource_id")) for s in week_sessions if s.get("rdp_resource_id")}
    in_fleet = [r for r in rdps if str(r.get("status") or "") not in OUT_OF_FLEET]
    paid_ids = {str(p.get("worker_id")) for p in payslips if p.get("worker_id")}
    month_workers_hours: dict[str, int] = {}
    for s in month_sessions:
        wid = str(s.get("worker_id") or "")
        if not wid:
            continue
        month_workers_hours[wid] = month_workers_hours.get(wid, 0) + _work_minutes(s)
    no_payslip = sum(1 for w, m in month_workers_hours.items() if m > 0 and w not in paid_ids)
    scores = [_num(q.get("composite_score")) for q in quality]
    idle_status = sum(1 for r in rdps if str(r.get("status") or "") == "idle")
    parked = sum(1 for r in in_fleet if str(r.get("id")) not in used)
    return {
        "work_hours": _hours(sum(_work_minutes(s) for s in month_sessions)),
        "rdp_hours": _hours(sum(_rdp_minutes(s, now) for s in month_sessions)),
        "week_work_hours": _hours(sum(_work_minutes(s) for s in week_sessions)),
        "week_rdp_hours": _hours(sum(_rdp_minutes(s, now) for s in week_sessions)),
        "today_work_hours": _hours(sum(_work_minutes(s) for s in today_sessions)),
        "today_rdp_hours": _hours(sum(_rdp_minutes(s, now) for s in today_sessions)),
        "today_session_count": len(today_sessions),
        "worker_earnings": round(sum(_num(p.get("gross_earned")) for p in payslips), 2),
        "worker_payouts": round(sum(_num(p.get("final_net")) for p in payslips), 2),
        "idle_rdps": idle_status,
        "parked_rdps": parked,
        "producing_rdps": sum(1 for r in in_fleet if str(r.get("id")) in used),
        "rdp_count": len(rdps),
        "quality_avg": round(sum(scores) / len(scores), 1) if scores else None,
        "quality_count": len(scores),
        "workers_with_hours_no_payslip": no_payslip,
        "payslip_count": len(payslips),
        "session_count": len(month_sessions),
        "week_session_count": len(week_sessions),
    }


def _charts(
    *,
    week_from: datetime,
    now: datetime,
    week_sessions: list,
    payslips: list,
    quality: list,
    rdps: list,
) -> dict[str, Any]:
    days: list[str] = []
    cursor = week_from.date()
    end_day = now.date()
    while cursor <= end_day:
        days.append(cursor.isoformat())
        cursor = cursor + timedelta(days=1)

    work_by = {d: 0 for d in days}
    rdp_by = {d: 0 for d in days}
    for s in week_sessions:
        d = _day(s)
        if d not in work_by:
            continue
        work_by[d] += _work_minutes(s)
        rdp_by[d] += _rdp_minutes(s, now)

    ranked = sorted(payslips, key=lambda p: _num(p.get("gross_earned")), reverse=True)[:8]
    used = {str(s.get("rdp_resource_id")) for s in week_sessions if s.get("rdp_resource_id")}
    in_fleet = [r for r in rdps if str(r.get("status") or "") not in OUT_OF_FLEET]
    producing = sum(1 for r in in_fleet if str(r.get("id")) in used)
    parked = sum(1 for r in in_fleet if str(r.get("id")) not in used)
    idle_status = sum(1 for r in rdps if str(r.get("status") or "") == "idle")

    scores = [_num(q.get("composite_score")) for q in quality]
    buckets = [("0–50", 0), ("50–70", 0), ("70–85", 0), ("85–100", 0)]
    for sc in scores:
        if sc < 50:
            buckets[0] = (buckets[0][0], buckets[0][1] + 1)
        elif sc < 70:
            buckets[1] = (buckets[1][0], buckets[1][1] + 1)
        elif sc < 85:
            buckets[2] = (buckets[2][0], buckets[2][1] + 1)
        else:
            buckets[3] = (buckets[3][0], buckets[3][1] + 1)

    return {
        "daily_hours": [
            {"day": d, "work_hours": _hours(work_by[d]), "rdp_hours": _hours(rdp_by[d])}
            for d in days
        ],
        "pay_vs_hours": [
            {
                "name": p.get("worker_display_name") or "Unknown",
                "worker_id": p.get("worker_id"),
                "hours": round(_num(p.get("hours_logged")), 2),
                "earned": round(_num(p.get("gross_earned")), 2),
                "paid": round(_num(p.get("final_net")), 2),
            }
            for p in ranked
        ],
        "quality_buckets": [{"label": label, "count": count} for label, count in buckets],
        "fleet": [
            {"label": "Working", "count": producing},
            {"label": "Unused", "count": parked},
            {"label": "Idle", "count": idle_status},
        ],
    }


def _prev_quality_avg(db: Session, period: PayrollPeriod) -> float | None:
    prev = db.exec(
        select(PayrollPeriod)
        .where(PayrollPeriod.end_date < period.start_date)
        .order_by(PayrollPeriod.end_date.desc())
    ).first()
    if not prev:
        return None
    rows = db.exec(
        select(QualityCompositeScore).where(QualityCompositeScore.payroll_period_id == prev.id)
    ).all()
    if not rows:
        return None
    return sum(_num(r.composite_score) for r in rows) / len(rows)


def build_briefing(db: Session, period_id: UUID) -> dict[str, Any]:
    period = db.get(PayrollPeriod, period_id)
    if not period:
        raise ValueError("Payroll period not found")

    now = datetime.now(timezone.utc)
    week_to = now
    week_from = now - timedelta(days=WEEK_DAYS)
    prev_from = now - timedelta(days=WEEK_DAYS * 2)

    snap = build_snapshot(db, period_id)
    warnings = list(snap.get("warnings") or [])

    payslips = list(_source_data(snap, "payslips") or [])
    month_sessions = list(_source_data(snap, "sessions") or [])
    quality = list(_source_data(snap, "quality") or [])
    rdps = list(_source_data(snap, "rdps") or [])
    workers = list(_source_data(snap, "workers") or [])
    worker_names = _names(workers, "id", "display_name")
    for p in payslips:
        if p.get("worker_id"):
            worker_names[str(p["worker_id"])] = str(p.get("worker_display_name") or worker_names.get(str(p["worker_id"]), "Unknown"))
    rdp_names = _names(rdps, "id", "nickname")

    week_block = {"ok": True, "data": [], "error": None}
    prev_block = {"ok": True, "data": [], "error": None}
    try:
        week_block["data"] = fetch_sessions_in_range(db, week_from, week_to)
    except Exception as exc:
        logger.exception("briefing week sessions failed")
        try:
            db.rollback()
        except Exception:
            logger.exception("briefing rollback failed after week sessions")
        week_block = {"ok": False, "data": [], "error": f"week sessions: {exc}"}
        warnings.append(week_block["error"])
    try:
        prev_block["data"] = fetch_sessions_in_range(db, prev_from, week_from)
    except Exception as exc:
        logger.exception("briefing prior-week sessions failed")
        try:
            db.rollback()
        except Exception:
            logger.exception("briefing rollback failed after prior-week sessions")
        prev_block = {"ok": False, "data": [], "error": f"prior-week sessions: {exc}"}
        warnings.append(prev_block["error"])

    week_sessions = list(week_block["data"])
    prev_sessions = list(prev_block["data"])
    today_date = now.date().isoformat()
    today_sessions = [s for s in week_sessions if _day(s) == today_date]

    prev_avg: float | None = None
    try:
        prev_avg = _prev_quality_avg(db, period)
    except Exception as exc:
        logger.exception("briefing prior quality failed")
        try:
            db.rollback()
        except Exception:
            pass
        warnings.append(f"prior quality: {exc}")

    raw_rules: list[tuple[str, Callable[[], dict[str, Any] | None]]] = [
        ("calculate-run", lambda: _rule_no_calculate(month_sessions, payslips)),
        ("invisible-payday", lambda: _rule_invisible_payday(week_sessions, payslips, worker_names, now)),
        ("broken-payslips", lambda: _rule_broken_payslips(payslips, worker_names)),
        ("ghost-connection", lambda: _rule_ghost(week_sessions, month_sessions, now)),
        ("missing-evidence", lambda: _rule_missing_evidence(week_sessions, worker_names)),
        ("volume-slip", lambda: _rule_volume_slip(week_sessions, prev_sessions)),
        ("parked-machines", lambda: _rule_parked(rdps, week_sessions, rdp_names)),
        ("unattributed-hours", lambda: _rule_unattributed(week_sessions, rdp_names, now)),
        ("concentration", lambda: _rule_concentration(week_sessions, rdp_names, now)),
        ("unscored-producers", lambda: _rule_unscored(week_sessions, quality, worker_names, now)),
        ("quality-floor", lambda: _rule_quality_floor(quality, prev_avg)),
        ("quiet-today", lambda: _rule_quiet_today(today_sessions, now)),
        ("quiet-week", lambda: _rule_quiet_week(week_sessions)),
    ]

    alarms: list[dict[str, Any]] = []
    for label, fn in raw_rules:
        result = _isolate_rule(label, fn)
        if result is None:
            continue
        if result.get("_error"):
            warnings.append(result["_error"])
            continue
        alarms.append(result)

    def _sort_key(row: dict[str, Any]) -> tuple:
        return (
            SEVERITY_RANK.get(str(row.get("severity")), 9),
            -_num(row.get("amount_at_risk")),
            -_num(row.get("hours_at_risk")),
            -int(row.get("count") or 0),
        )

    alarms.sort(key=_sort_key)
    moves = [a for a in alarms if a.get("severity") in {"critical", "watch"}][:MAX_MOVES]
    holding = [a for a in alarms if a.get("severity") == "clear"]

    scorecard = _scorecard(
        month_sessions=month_sessions,
        week_sessions=week_sessions,
        today_sessions=today_sessions,
        payslips=payslips,
        rdps=rdps,
        quality=quality,
        now=now,
    )
    charts = _charts(
        week_from=week_from,
        now=now,
        week_sessions=week_sessions,
        payslips=payslips,
        quality=quality,
        rdps=rdps,
    )

    return {
        "as_of": now.isoformat(),
        "period": {
            "id": str(period.id),
            "label": period.label,
            "start_date": period.start_date.isoformat(),
            "end_date": period.end_date.isoformat(),
            "currency": period.currency,
            "status": getattr(period.status, "value", str(period.status)),
        },
        "today": {
            "date": today_date,
            "from": now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(),
            "to": now.isoformat(),
            "work_hours": scorecard["today_work_hours"],
            "rdp_hours": scorecard["today_rdp_hours"],
            "session_count": scorecard["today_session_count"],
        },
        "week": {
            "from": week_from.isoformat(),
            "to": week_to.isoformat(),
            "work_hours": scorecard["week_work_hours"],
            "rdp_hours": scorecard["week_rdp_hours"],
            "session_count": scorecard["week_session_count"],
        },
        "month": {
            "label": period.label,
            "from": period.start_date.isoformat(),
            "to": period.end_date.isoformat(),
            "status": getattr(period.status, "value", str(period.status)),
            "currency": period.currency,
            "work_hours": scorecard["work_hours"],
            "rdp_hours": scorecard["rdp_hours"],
            "session_count": scorecard["session_count"],
            "payslip_count": scorecard["payslip_count"],
            "worker_earnings": scorecard["worker_earnings"],
            "worker_payouts": scorecard["worker_payouts"],
            "quality_avg": scorecard["quality_avg"],
            "quality_count": scorecard["quality_count"],
            "parked_rdps": scorecard["parked_rdps"],
            "idle_rdps": scorecard["idle_rdps"],
            "producing_rdps": scorecard["producing_rdps"],
            "rdp_count": scorecard["rdp_count"],
            "workers_with_hours_no_payslip": scorecard["workers_with_hours_no_payslip"],
        },
        "scorecard": scorecard,
        "moves": moves,
        "alarms": alarms,
        "holding": holding,
        "charts": charts,
        "warnings": warnings,
    }
