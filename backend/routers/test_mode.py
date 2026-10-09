"""Test mode — the admins' shared test workspace, switched on from Settings.

These endpoints always run against the real database (main.py never routes
/test-mode into a sandbox), so the audit trail of turning test mode on and
clearing it stays with the real records.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from core import sandbox
from core.database import get_db
from core.permissions import require_role
from routers.deps import get_admin_user
from services.audit_service import record_audit

router = APIRouter()
require_tester = require_role("admin", "super_admin")


class TestModeState(BaseModel):
    ready: bool
    building: bool
    error: Optional[str] = None


def _state(current_user: dict) -> TestModeState:
    schema = sandbox.schema_for(current_user["uid"])
    state = sandbox.build_state(schema) or ""
    return TestModeState(
        ready=sandbox.is_ready(schema),
        building=state == "building",
        error=state.removeprefix("failed: ") if state.startswith("failed") else None,
    )


def _audit(db: Session, current_user: dict, action: str) -> None:
    admin = get_admin_user(db, current_user)
    record_audit(db, actor_id=admin.id, action=action, target_type="admin_user", target_id=admin.id)
    db.commit()


@router.get("", response_model=TestModeState)
def test_mode_state(current_user: dict = Depends(require_tester)):
    return _state(current_user)


@router.post("/prepare", response_model=TestModeState)
def prepare_test_mode(db: Session = Depends(get_db), current_user: dict = Depends(require_tester)):
    """Create the empty test workspace if it does not exist yet. Building takes about a minute."""
    state = _state(current_user)
    if not state.ready and not state.building:
        sandbox.start_build(current_user["uid"])
        _audit(db, current_user, "test_mode.prepared")
    return _state(current_user)


@router.delete("/data", response_model=TestModeState)
def clear_test_data(db: Session = Depends(get_db), current_user: dict = Depends(require_tester)):
    """Delete everything added in test mode. Real data is never touched."""
    if _state(current_user).building:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="The test workspace is still being set up.")
    sandbox.drop_sandbox(sandbox.schema_for(current_user["uid"]))
    _audit(db, current_user, "test_mode.cleared")
    return _state(current_user)
