"""Absence report gates that need no database.

The attachment validator is the security-relevant half of this feature: the
browser uploads straight to Supabase, so the path this accepts is the only
thing standing between a worker and pointing "evidence" at someone else's
object — or off-site entirely.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from core.security_validation import validate_absence_attachment_path
from schemas.absence_report import (
    MIN_REASON_CHARS,
    AbsenceReportAmend,
    AbsenceReportCreate,
)


# ── attachment paths ───────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "path",
    [
        "3f1e/evidence-1727000000-ab12cd.pdf",
        "3f1e/evidence-1727000000-ab12cd.jpg",
        "3f1e/evidence-1727000000-ab12cd.jpeg",
        "3f1e/evidence-1727000000-ab12cd.png",
        "3f1e/EVIDENCE.PDF",
    ],
)
def test_accepts_the_four_allowed_file_types(path):
    assert validate_absence_attachment_path(path) == path.strip()


@pytest.mark.parametrize(
    "path",
    [
        "report/evidence.exe",
        "report/evidence.svg",
        "report/evidence.pdf.exe",
        "report/evidence",
    ],
)
def test_rejects_other_file_types(path):
    with pytest.raises(ValueError, match="PDF, JPG, JPEG or PNG"):
        validate_absence_attachment_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "../other-report/evidence.pdf",
        "/absolute/evidence.pdf",
        "report\\evidence.pdf",
    ],
)
def test_rejects_traversal_and_absolute_paths(path):
    with pytest.raises(ValueError, match="invalid"):
        validate_absence_attachment_path(path)


@pytest.mark.parametrize(
    "path",
    [
        "https://evil.test/evidence.pdf",
        "http://localhost/evidence.pdf",
        # Even our own storage host: this bucket stores paths, never URLs.
        "https://project.supabase.co/storage/v1/object/absence-evidence/x.pdf",
    ],
)
def test_rejects_urls_outright(path):
    with pytest.raises(ValueError, match="storage path, not a URL"):
        validate_absence_attachment_path(path)


def test_rejects_empty_path():
    with pytest.raises(ValueError, match="required"):
        validate_absence_attachment_path("   ")


# ── report creation ────────────────────────────────────────────────────────────

def _payload(**overrides):
    start = datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc)
    body = {
        "absence_start": start,
        "absence_end": start + timedelta(hours=8),
        "reason_category": "illness",
        "reason_text": "Food poisoning since last night, cannot sit at a desk.",
    }
    body.update(overrides)
    return body


def test_accepts_a_well_formed_report():
    report = AbsenceReportCreate(**_payload())
    assert report.shift_id is None
    assert report.reason_category.value == "illness"


def test_reason_must_be_long_enough_to_act_on():
    with pytest.raises(ValueError, match=str(MIN_REASON_CHARS)):
        AbsenceReportCreate(**_payload(reason_text="sick"))


def test_reason_is_trimmed_before_the_length_check():
    """Whitespace padding must not buy a worker past the minimum."""
    with pytest.raises(ValueError, match=str(MIN_REASON_CHARS)):
        AbsenceReportCreate(**_payload(reason_text="  sick  " + " " * 40))


def test_end_must_be_after_start():
    start = datetime(2026, 9, 23, 9, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="after the start"):
        AbsenceReportCreate(**_payload(absence_start=start, absence_end=start))


def test_evidence_is_never_required_to_file():
    """The agreed product rule: an emergency rarely arrives with a sick note."""
    report = AbsenceReportCreate(**_payload())
    assert not hasattr(report, "attachment_paths")


# ── amending an existing report ────────────────────────────────────────────────
#
# Amending is what a worker gets instead of a second submission, so its gates
# have to be at least as strict as filing's — a correction must not be a way
# round the length or ordering rules.

def test_amend_can_change_one_field_alone():
    amend = AbsenceReportAmend(
        reason_text="The clinic moved my appointment to the afternoon."
    )
    assert amend.model_dump(exclude_unset=True) == {
        "reason_text": "The clinic moved my appointment to the afternoon."
    }


def test_amend_of_nothing_is_allowed_and_sends_nothing():
    """Saving an untouched form must not blank stored columns."""
    assert AbsenceReportAmend().model_dump(exclude_unset=True) == {}


def test_amend_reason_must_still_be_long_enough():
    with pytest.raises(ValueError, match=str(MIN_REASON_CHARS)):
        AbsenceReportAmend(reason_text="sick")


def test_amend_rejects_half_a_window():
    """A start-only amend could land on top of an earlier stored end."""
    start = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="both the start and the end"):
        AbsenceReportAmend(absence_start=start)


def test_amend_rejects_an_inverted_window():
    start = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="after the start"):
        AbsenceReportAmend(absence_start=start, absence_end=start - timedelta(hours=1))


def test_amend_accepts_a_whole_new_window():
    start = datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)
    amend = AbsenceReportAmend(absence_start=start, absence_end=start + timedelta(hours=4))
    assert amend.absence_end > amend.absence_start


def test_amend_cannot_move_the_report_to_another_shift():
    """Re-pointing a report is a new statement, not a correction."""
    assert "shift_id" not in AbsenceReportAmend.model_fields
