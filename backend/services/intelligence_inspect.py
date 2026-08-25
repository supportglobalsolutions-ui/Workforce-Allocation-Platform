"""Gemini inspection copy for the ops briefing.

Rules stay the source of truth. This only writes short ops-chief notes from
those facts. A timeout or bad key must not blank the briefing.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT_SECONDS = 20.0
MAX_ATTEMPTS = 2
MAX_MESSAGES = 5
TONES = {"critical", "watch", "clear"}
JARGON_REPLACEMENTS = (
    (re.compile(r"Quality is the constraint[^.]*", re.I), "Quality is too low"),
    (re.compile(r"The floor is dark[^.]*", re.I), "No machines did work this week."),
    (re.compile(r"The alarm desk is quiet[^.]*", re.I), "Very little was logged recently."),
    (re.compile(r"\bheadcount\b", re.I), "new hires"),
    (re.compile(r"\bconstraint\b", re.I), "main problem"),
    (re.compile(r"\bfloor\b", re.I), "minimum"),
    (re.compile(r"\bfleet\b", re.I), "machines"),
    (re.compile(r"\bparked\b", re.I), "unused"),
    (re.compile(r"\bRDPs?\b"), "machine"),
)
# New AI Studio keys cannot call retired 2.x Flash ids. 3.6 worked for this key.
FALLBACK_MODELS = ("gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite")
SUGGESTED_MODEL_RE = re.compile(r"use models/([a-zA-Z0-9._-]+)")

SYSTEM_PROMPT = """You help a manager understand workforce data. Write like you are talking to a friend.

Use very simple English. Short sentences. No jargon.

For each problem you see in the data, write:
- title: 3–6 plain words (example: "Quality is too low")
- body: ONE sentence — what the numbers mean (example: "The team averages 16 but you need 70.")
- action: ONE sentence — the very next step (example: "Open Quality and review the lowest scores.")

Rules:
- Use today, last 7 days, and the working month when relevant.
- Use only numbers from the data. Do not invent names or amounts.
- Do not use the word profit.
- Banned words: floor, constraint, playbook, headcount, desk, fleet, RDP, payslip row, alarm, ghost, parked-machines, quality-floor.
- Worst problems first. 3 to 5 messages max.

Return JSON only:
{"messages":[{"tone":"critical"|"watch"|"clear","title":"...","body":"...","action":"..."}]}
"""


def _empty(error: str | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "model": None,
        "messages": [],
        "error": error,
        "as_of": datetime.now(timezone.utc).isoformat(),
    }


def _facts(briefing: dict[str, Any]) -> dict[str, Any]:
    def slim(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row.get("id"),
            "severity": row.get("severity"),
            "headline": row.get("headline"),
            "why": row.get("why"),
            "count": row.get("count"),
            "hours_at_risk": row.get("hours_at_risk"),
            "amount_at_risk": row.get("amount_at_risk"),
            "names": [e.get("name") for e in (row.get("entities") or [])[:6] if e.get("name")],
            "steps": [s.get("label") for s in (row.get("steps") or [])[:3] if isinstance(s, dict)],
        }

    charts = briefing.get("charts") or {}
    return {
        "as_of": briefing.get("as_of"),
        "today": briefing.get("today"),
        "last_7_days": briefing.get("week"),
        "working_month": briefing.get("month"),
        "scorecard": briefing.get("scorecard"),
        "daily_hours": charts.get("daily_hours") or [],
        "pay_this_month": [
            {
                "name": row.get("name"),
                "hours": row.get("hours"),
                "earned": row.get("earned"),
                "paid": row.get("paid"),
            }
            for row in (charts.get("pay_vs_hours") or [])[:8]
            if isinstance(row, dict)
        ],
        "quality_this_month": charts.get("quality_buckets") or [],
        "fleet": charts.get("fleet") or [],
        "moves": [slim(m) for m in (briefing.get("moves") or [])],
        "alarms": [slim(a) for a in (briefing.get("alarms") or [])],
    }


def _plain(text: str) -> str:
    out = (text or "").strip()
    for pattern, replacement in JARGON_REPLACEMENTS:
        out = pattern.sub(replacement, out)
    return re.sub(r"\s{2,}", " ", out).strip()


def _parse_messages(text: str) -> list[dict[str, Any]]:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    rows = data.get("messages") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return []
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = _plain(str(row.get("title") or ""))
        body = _plain(str(row.get("body") or ""))
        action = _plain(str(row.get("action") or ""))
        tone = str(row.get("tone") or "watch").strip().lower()
        if tone not in TONES:
            tone = "watch"
        if not title or not body:
            continue
        if not action:
            action = body
        out.append({
            "tone": tone,
            "title": title[:160],
            "body": body[:500],
            "action": action[:300],
        })
        if len(out) >= MAX_MESSAGES:
            break
    return out


def _normalize_model(name: str) -> str:
    name = (name or "").strip()
    if name.startswith("models/"):
        name = name[7:]
    return name


def _suggested_model(error_text: str) -> str | None:
    match = SUGGESTED_MODEL_RE.search(error_text or "")
    return _normalize_model(match.group(1)) if match else None


def inspect_briefing(briefing: dict[str, Any]) -> dict[str, Any]:
    key = (settings.GOOGLE_API_KEY or "").strip()
    preferred = _normalize_model(settings.GEMINI_MODEL or FALLBACK_MODELS[0])
    queue = [preferred] + [m for m in FALLBACK_MODELS if m != preferred]
    if not key:
        return _empty("Gemini is not configured.")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{
            "role": "user",
            "parts": [{"text": json.dumps(_facts(briefing), default=str)}],
        }],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            # Skip chain-of-thought so Analytics is not blocked for minutes.
            "thinkingConfig": {"thinkingBudget": 0},
        },
    }
    last_error = "Gemini inspection failed."
    seen: set[str] = set()
    retryable = {404, 429, 500, 503}
    try:
        with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
            attempts = 0
            while queue and attempts < MAX_ATTEMPTS:
                model = queue.pop(0)
                if not model or model in seen:
                    continue
                seen.add(model)
                attempts += 1
                url = GEMINI_URL.format(model=model)
                try:
                    response = client.post(
                        url,
                        headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                        json=payload,
                    )
                except httpx.TimeoutException:
                    last_error = "Gemini timed out."
                    logger.warning("Gemini model %s timed out", model)
                    continue
                if response.status_code == 400 and payload["generationConfig"].pop("thinkingConfig", None):
                    last_error = "Gemini HTTP 400"
                    logger.warning("Gemini model %s rejected thinkingConfig; retrying without it", model)
                    seen.discard(model)
                    queue.insert(0, model)
                    attempts -= 1
                    continue
                if response.status_code in retryable:
                    last_error = f"Gemini HTTP {response.status_code}"
                    suggested = _suggested_model(response.text or "")
                    logger.warning("Gemini model %s returned HTTP %s", model, response.status_code)
                    if suggested and suggested not in seen and suggested not in queue:
                        queue.insert(0, suggested)
                    continue
                if response.status_code >= 400:
                    logger.warning("Gemini inspection failed: HTTP %s", response.status_code)
                    return _empty(f"Gemini HTTP {response.status_code}")
                body = response.json()
                parts = (
                    ((body.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                )
                text = "".join(str(p.get("text") or "") for p in parts)
                messages = _parse_messages(text)
                if not messages:
                    return _empty("Gemini returned no inspection notes.")
                return {
                    "ok": True,
                    "model": model,
                    "messages": messages,
                    "error": None,
                    "as_of": datetime.now(timezone.utc).isoformat(),
                }
        return _empty(last_error)
    except Exception:
        logger.exception("Gemini inspection failed")
        return _empty("Gemini inspection failed.")
