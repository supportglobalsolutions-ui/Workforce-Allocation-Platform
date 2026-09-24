from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import ConfigDict, field_validator, model_validator
from sqlmodel import SQLModel

from models.enums import AbsenceReasonEnum, AbsenceStatusEnum

#: Enough detail for an admin to act on without chasing the worker.
MIN_REASON_CHARS = 20


class AbsenceReportCreate(SQLModel):
    shift_id:        Optional[UUID] = None
    absence_start:   datetime
    absence_end:     datetime
    reason_category: AbsenceReasonEnum
    reason_text:     str

    @field_validator("reason_text")
    @classmethod
    def _reason_long_enough(cls, v: str) -> str:
        text = (v or "").strip()
        if len(text) < MIN_REASON_CHARS:
            raise ValueError(
                f"Please describe what happened in at least {MIN_REASON_CHARS} characters"
            )
        return text

    @model_validator(mode="after")
    def _end_after_start(self) -> "AbsenceReportCreate":
        if self.absence_end <= self.absence_start:
            raise ValueError("Absence end must be after the start")
        return self


class AbsenceReportAmend(SQLModel):
    """A worker correcting their own report while it is still pending.

    Every field is optional so the form can send only what changed. The shift
    link is deliberately absent: re-pointing a report at a different shift is
    a new statement, not a correction, and would strand the first shift's
    marker.
    """

    absence_start:   Optional[datetime] = None
    absence_end:     Optional[datetime] = None
    reason_category: Optional[AbsenceReasonEnum] = None
    reason_text:     Optional[str] = None

    @field_validator("reason_text")
    @classmethod
    def _reason_long_enough(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        text = v.strip()
        if len(text) < MIN_REASON_CHARS:
            raise ValueError(
                f"Please describe what happened in at least {MIN_REASON_CHARS} characters"
            )
        return text

    @model_validator(mode="after")
    def _window_sent_whole(self) -> "AbsenceReportAmend":
        """Both ends or neither — a half-sent window can invert the stored one."""
        if (self.absence_start is None) != (self.absence_end is None):
            raise ValueError("Send both the start and the end of the absence")
        if (
            self.absence_start is not None
            and self.absence_end is not None
            and self.absence_end <= self.absence_start
        ):
            raise ValueError("Absence end must be after the start")
        return self


class AbsenceAttachmentAdd(SQLModel):
    path: str


class AbsenceReportReview(SQLModel):
    """Admin decision, or a worker withdrawing their own report."""

    status:     AbsenceStatusEnum
    admin_note: Optional[str] = None
    #: Accepting cancels the linked shift; set false to leave the roster alone.
    cancel_shift: bool = True


class AbsenceReportResponse(SQLModel):
    model_config = ConfigDict(from_attributes=True)

    id:               UUID
    worker_id:        UUID
    shift_id:         Optional[UUID]
    absence_start:    datetime
    absence_end:      datetime
    reason_category:  AbsenceReasonEnum
    reason_text:      str
    attachment_paths: list[str]
    status:           AbsenceStatusEnum
    reviewed_by:      Optional[UUID]
    reviewed_at:      Optional[datetime]
    admin_note:       Optional[str]
    created_at:       datetime
    updated_at:       datetime

    # Joined for display so the admin list does not need a second round trip.
    worker_name:      Optional[str] = None
    reviewer_name:    Optional[str] = None
    #: The linked shift's own window. Without these the only thing an admin
    #: could be shown for "which shift?" was the raw UUID.
    shift_start:      Optional[datetime] = None
    shift_end:        Optional[datetime] = None
    shift_status:     Optional[str] = None


class AbsenceAttachmentsResponse(SQLModel):
    attachment_paths: list[str]
    max_attachments:  int


class AbsenceSummaryResponse(SQLModel):
    """Counts behind the ! markers — one cheap call per dashboard."""

    #: Reports awaiting an admin decision (staff callers: all; workers: own).
    pending: int
    #: Shift ids with a pending or accepted report, for marking schedule rows.
    flagged_shift_ids: list[UUID]
