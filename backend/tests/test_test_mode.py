"""Test mode: only an admin's or super_admin's own requests move into their sandbox."""
import pytest
from fastapi.testclient import TestClient

import main
from core import sandbox
from services.email_resend import blocked_recipient_reason

SUPER = {"uid": "super-1", "email": "Boss@Example.com", "role": "super_admin", "status": "approved"}
ADMIN = {"uid": "admin-1", "email": "admin@example.com", "role": "admin", "status": "approved"}
EXEC = {"uid": "exec-1", "email": "exec@example.com", "role": "executive", "status": "approved"}
WORKER = {"uid": "worker-1", "email": "w@example.com", "role": "user", "status": "approved"}
TOKENS = {"super": SUPER, "admin": ADMIN, "exec": EXEC, "worker": WORKER}

PROBE = "/__probe_test_mode"


def _probe():
    return {"test_mode": sandbox.in_test_mode(), "schema": sandbox.current_schema(), "email": sandbox.test_mode_email()}


@pytest.fixture
def client(monkeypatch):
    def verify(token):
        if token not in TOKENS:
            raise ValueError("bad token")
        return TOKENS[token]

    monkeypatch.setattr(main, "verify_supabase_token", verify)
    ready: set[str] = set()
    monkeypatch.setattr(main, "sandbox_is_ready", lambda schema: schema in ready)
    monkeypatch.setattr(main, "load_test_mode_emails", lambda: [])
    main.app.add_api_route(PROBE, _probe, methods=["GET"])
    main.app.add_api_route("/auth/__probe", _probe, methods=["GET"])
    try:
        c = TestClient(main.app)
        c.ready = ready
        yield c
    finally:
        main.app.router.routes[:] = [
            r for r in main.app.router.routes if getattr(r, "path", "") not in {PROBE, "/auth/__probe"}
        ]


def _get(client, path, token=None, test_mode=True, method="GET"):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if test_mode:
        headers["X-Test-Mode"] = "1"
    return client.request(method, path, headers=headers)


def test_without_header_uses_real_data(client):
    body = _get(client, PROBE, "super", test_mode=False).json()
    assert body == {"test_mode": False, "schema": None, "email": ""}


def test_header_is_ignored_for_non_testers(client):
    for token in ("exec", "worker", None, "forged"):
        res = _get(client, PROBE, token)
        assert res.json()["test_mode"] is False
        assert "x-test-mode" not in res.headers


def test_not_ready_sandbox_is_refused(client):
    res = _get(client, PROBE, "super")
    assert res.status_code == 409
    assert res.json()["code"] == "test_mode_not_ready"


def test_super_admin_is_routed_to_own_sandbox(client):
    schema = sandbox.schema_for(SUPER["uid"])
    client.ready.add(schema)
    res = _get(client, PROBE, "super")
    assert res.status_code == 200
    assert res.json() == {"test_mode": True, "schema": schema, "email": "boss@example.com"}
    assert res.headers["x-test-mode"] == "on"
    # The context never leaks into the next, normal request.
    assert _get(client, PROBE, "super", test_mode=False).json()["schema"] is None


def test_account_and_settings_paths_stay_on_real_tables(client):
    res = _get(client, "/auth/__probe", "super")
    assert res.json() == {"test_mode": True, "schema": None, "email": "boss@example.com"}


@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/rdp/abc/claim"),
        ("POST", "/rdp/abc/join-ticket"),
        ("POST", "/rdp/abc/force-release"),
        ("POST", "/rdp/gateways/g1/drain"),
        ("POST", "/auth/users"),
        ("PATCH", "/auth/users/u1/role"),
    ],
)
def test_real_world_actions_are_blocked(client, method, path):
    res = _get(client, path, "super", method=method)
    assert res.status_code == 403
    assert "test mode" in res.json()["detail"]


def test_admins_share_one_test_workspace():
    assert sandbox.schema_for(SUPER["uid"]) == sandbox.schema_for(ADMIN["uid"]) == sandbox.SHARED_SANDBOX_SCHEMA


def test_admin_is_routed_to_own_sandbox(client):
    schema = sandbox.schema_for(ADMIN["uid"])
    client.ready.add(schema)
    res = _get(client, PROBE, "admin")
    assert res.status_code == 200
    assert res.json()["schema"] == schema


def test_email_reaches_listed_test_addresses_only():
    tokens = sandbox.set_request_test_mode(True, None, "boss@globalsolutions.co.ke", ["QA@GlobalSolutions.co.ke"])
    try:
        assert blocked_recipient_reason("qa@globalsolutions.co.ke") is None
        assert blocked_recipient_reason("boss@globalsolutions.co.ke") is None
        assert "test mode" in blocked_recipient_reason("worker@globalsolutions.co.ke")
    finally:
        sandbox.reset_request_test_mode(tokens)


def test_email_only_reaches_the_super_admin():
    tokens = sandbox.set_request_test_mode(True, None, "Boss@GlobalSolutions.co.ke")
    try:
        assert "test mode" in blocked_recipient_reason("worker@globalsolutions.co.ke")
        assert blocked_recipient_reason("boss@globalsolutions.co.ke") is None
    finally:
        sandbox.reset_request_test_mode(tokens)
    assert blocked_recipient_reason("worker@globalsolutions.co.ke") is None


def test_real_login_account_changes_are_blocked(monkeypatch):
    from fastapi import HTTPException

    from core import supabase_auth

    tokens = sandbox.set_request_test_mode(True, None, "boss@example.com")
    try:
        with pytest.raises(HTTPException) as exc:
            supabase_auth._admin_request("PUT", "/users/x", json={})
        assert exc.value.status_code == 403
    finally:
        sandbox.reset_request_test_mode(tokens)


def test_current_engine_follows_the_request():
    assert sandbox.current_engine() is sandbox.engine
    tokens = sandbox.set_request_test_mode(True, "sandbox_abc", "")
    try:
        eng = sandbox.current_engine()
        assert eng.get_execution_options()["schema_translate_map"] == {None: "sandbox_abc"}
    finally:
        sandbox.reset_request_test_mode(tokens)
