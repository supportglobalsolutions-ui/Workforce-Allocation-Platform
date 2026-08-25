from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class IntelligenceSource(BaseModel):
    model_config = ConfigDict(extra="allow")

    ok: bool
    data: Any
    error: Optional[str] = None


class IntelligenceSnapshot(BaseModel):
    period_id: UUID | str
    payslips: IntelligenceSource
    revenue_share: IntelligenceSource
    rdp_earnings: IntelligenceSource
    line_items: IntelligenceSource
    sessions: IntelligenceSource
    quality: IntelligenceSource
    clients: IntelligenceSource
    rdps: IntelligenceSource
    workers: IntelligenceSource
    warnings: list[str] = []


class IntelligenceBriefing(BaseModel):
    model_config = ConfigDict(extra="allow")

    period: dict[str, Any]
    today: dict[str, Any] | None = None
    week: dict[str, Any]
    month: dict[str, Any] | None = None
    as_of: str | None = None
    scorecard: dict[str, Any]
    moves: list[dict[str, Any]] = []
    alarms: list[dict[str, Any]] = []
    holding: list[dict[str, Any]] = []
    charts: dict[str, Any]
    warnings: list[str] = []


class IntelligenceInspection(BaseModel):
    ok: bool
    model: str | None = None
    messages: list[dict[str, Any]] = []
    error: str | None = None
    as_of: str | None = None
