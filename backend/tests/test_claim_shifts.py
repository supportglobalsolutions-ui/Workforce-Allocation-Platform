"""RDP claim shifts: visible machine required, no overlaps, held only during their hours."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from services import claim_shifts


def _t(hour):
    return datetime(2026, 10, 12, hour, tzinfo=timezone.utc)


def _db(resource=None, clash=None, holder=None):
    db = MagicMock()
    db.get.side_effect = lambda model, _id: resource if model.__name__ == "RDPResource" else holder
    db.exec.return_value.first.return_value = clash
    return db


RDP = SimpleNamespace(id=uuid.uuid4(), nickname="Desk-1")


def test_rdp_is_required():
    with pytest.raises(HTTPException) as exc:
        claim_shifts.validate_claim_shift(_db(), rdp_id=None, start=_t(9), end=_t(11))
    assert exc.value.status_code == 400


def test_machine_not_offered_to_worker_is_refused():
    with pytest.raises(HTTPException) as exc:
        claim_shifts.validate_claim_shift(
            _db(RDP), rdp_id=RDP.id, start=_t(9), end=_t(11), worker_visible=lambda r: False,
        )
    assert exc.value.status_code == 403


def test_overlapping_booking_on_same_rdp_is_refused():
    clash = SimpleNamespace(worker_id=uuid.uuid4(), scheduled_start=_t(10), scheduled_end=_t(12))
    with pytest.raises(HTTPException) as exc:
        claim_shifts.validate_claim_shift(
            _db(RDP, clash, SimpleNamespace(display_name="Alice")),
            rdp_id=RDP.id, start=_t(9), end=_t(11), worker_visible=lambda r: True,
        )
    assert exc.value.status_code == 409
    assert "Alice" in exc.value.detail


def test_free_visible_rdp_is_accepted():
    assert claim_shifts.validate_claim_shift(
        _db(RDP), rdp_id=RDP.id, start=_t(9), end=_t(11), worker_visible=lambda r: True,
    ) is RDP


def test_other_worker_blocked_while_claim_shift_holds_machine():
    owner = uuid.uuid4()
    holding = SimpleNamespace(worker_id=owner, scheduled_end=_t(17))
    db = _db(RDP, holding, SimpleNamespace(display_name="Bob"))
    with pytest.raises(HTTPException) as exc:
        claim_shifts.assert_claim_shift_allows_claim(db, RDP, uuid.uuid4(), is_staff=False)
    assert exc.value.status_code == 409 and "Bob" in exc.value.detail
    # The booked worker and staff may still claim.
    claim_shifts.assert_claim_shift_allows_claim(db, RDP, owner, is_staff=False)
    claim_shifts.assert_claim_shift_allows_claim(db, RDP, uuid.uuid4(), is_staff=True)
