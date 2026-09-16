"""
The app must import and serve its routes.

This exists because it did not. A router refactor left `routers/rdp.py` using
names it no longer imported, so `import main` raised `NameError` and the whole
API was unstartable — while the unit suite stayed green, because nothing
actually loaded the app. A dev server already running kept answering from code
held in memory, so the breakage was invisible until the next restart.

These are cheap and catch an entire class of refactor damage: missing imports,
self-shadowed names, routers that stop being included, handlers that vanish.
"""
from __future__ import annotations

import pytest

# Every route the RDP feature must expose, with the status an *unauthenticated*
# caller should get. 404 here means the route stopped being registered.
RDP_ROUTES = [
    ("GET", "/rdp", {401, 403}),
    ("GET", "/rdp/my-active", {401, 403}),
    ("GET", "/rdp/capacity", {401, 403}),
    ("GET", "/rdp/coordinator", {401, 403}),
    ("GET", "/rdp/quarantined", {401, 403}),
    ("GET", "/rdp/gateways", {401, 403}),
    ("GET", "/rdp/health/degraded", {401, 403}),
    # Deliberately unauthenticated — the ticket is the credential — so a
    # missing/bogus one must be refused rather than let through.
    ("GET", "/rdp/gateway/verify-ticket", {403}),
    ("POST", "/rdp/00000000-0000-0000-0000-000000000000/join-ticket", {401, 403}),
    ("POST", "/rdp/00000000-0000-0000-0000-000000000000/repair", {401, 403}),
    ("POST", "/rdp/00000000-0000-0000-0000-000000000000/claim", {401, 403}),
    ("POST", "/rdp/00000000-0000-0000-0000-000000000000/end-connection", {401, 403}),
]


@pytest.fixture(scope="module")
def client():
    """The real app, served in-process."""
    from fastapi.testclient import TestClient

    from main import app

    # Report a handler crash as a 500 rather than raising into the test, so a
    # failure names the route instead of the traceback.
    return TestClient(app, raise_server_exceptions=False)


def test_app_imports():
    """`NameError` at import time means uvicorn cannot start at all."""
    import main

    assert main.app is not None


def test_health_serves(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("method,path,expected", RDP_ROUTES)
def test_rdp_route_is_registered_and_reachable(client, method, path, expected):
    response = client.request(method, path)
    assert response.status_code != 404, f"{path} is not registered"
    assert response.status_code < 500, (
        f"{path} raised server-side: {response.status_code}"
    )
    assert response.status_code in expected, (
        f"{path} returned {response.status_code}, expected one of {sorted(expected)}"
    )


def test_protected_routes_do_not_leak_without_auth(client):
    """A refactor must not accidentally drop an auth dependency."""
    for method, path, expected in RDP_ROUTES:
        if 401 not in expected and 403 not in expected:
            continue
        response = client.request(method, path)
        assert response.status_code in (401, 403), (
            f"{path} answered {response.status_code} to an unauthenticated caller"
        )


def test_router_modules_all_import():
    """Each RDP router module must load on its own, not just via main."""
    import importlib

    from conftest import RDP_ROUTER_MODULES

    for name in RDP_ROUTER_MODULES:
        try:
            importlib.import_module(name)
        except ModuleNotFoundError:
            continue  # module legitimately does not exist in this layout
        except Exception as exc:  # NameError, ImportError, SyntaxError…
            pytest.fail(f"{name} does not import: {type(exc).__name__}: {exc}")
