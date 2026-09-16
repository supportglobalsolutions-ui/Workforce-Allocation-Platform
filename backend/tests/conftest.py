"""
Shared fixtures for the RDP link tests (Phase 8 Action 5).

Design constraint: most of this suite must run with **no server of any kind**.
The ownership model leans on Redis for locks, join tickets, the coordinator
lease, admission control and the sweep's miss counters, so `fakeredis` covers
the majority of the races that matter.

The parts that genuinely need PostgreSQL — the allocation table uses PG enums
and UUID columns that SQLite cannot express — are marked `@pytest.mark.postgres`
and skipped unless one is reachable. CI supplies it as a service; developer
machines (including ones where psycopg2 is blocked by policy) still get every
other gate.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Tests import the app the same way the app imports itself ("core.config", not
# "backend.core.config"), so the backend directory has to be on the path.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Deterministic settings for anything that reads config at import time. Set
# before the first `core.config` import or Settings() will cache the real .env.
os.environ.setdefault("GUACAMOLE_JSON_SECRET_KEY", "4c0b569e4c96df157eee1b65dd0e4d41")
os.environ.setdefault("GUACAMOLE_PUBLIC_URL", "https://guac.test.invalid")
os.environ.setdefault("GUACAMOLE_URL", "http://127.0.0.1:8080/guacamole")
os.environ.setdefault("RDP_DIRECT_GATEWAY_MODE", "on")
os.environ.setdefault("ENVIRONMENT", "test")


def _postgres_available() -> tuple[bool, str]:
    """Can we reach a throwaway PostgreSQL for the DB-backed gates?"""
    url = os.environ.get("DATABASE_URL_TEST")
    if not url:
        return False, "DATABASE_URL_TEST is not set"
    try:
        import psycopg2  # noqa: F401
    except Exception as exc:
        return False, f"psycopg2 unavailable ({type(exc).__name__})"
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, ""
    except Exception as exc:
        return False, f"cannot connect ({type(exc).__name__})"


POSTGRES_OK, POSTGRES_WHY = _postgres_available()


@pytest.fixture
def postgres_session():
    """A clean SQLModel session against the disposable PostgreSQL test DB.

    The CI workflow runs Alembic before pytest. Truncating the small set of
    ownership tables makes every database gate independent without requiring a
    second migration per test or touching a developer's configured database.
    """
    if not POSTGRES_OK:  # collection normally skips first; keep direct use safe.
        pytest.skip(f"needs PostgreSQL: {POSTGRES_WHY}")

    from sqlalchemy import create_engine, text
    from sqlmodel import Session

    engine = create_engine(os.environ["DATABASE_URL_TEST"])
    with engine.begin() as connection:
        connection.execute(
            text("TRUNCATE TABLE sessions, allocations, rdp_resources, workers CASCADE")
        )
    with Session(engine, expire_on_commit=False) as session:
        yield session
    engine.dispose()


def pytest_collection_modifyitems(config, items):
    """Skip the Postgres-only gates with a reason, never a silent pass."""
    if POSTGRES_OK:
        return
    skip = pytest.mark.skip(reason=f"needs PostgreSQL: {POSTGRES_WHY}")
    for item in items:
        if "postgres" in item.keywords:
            item.add_marker(skip)


#: The RDP HTTP surface is split across several router modules and has been
#: reshuffled more than once. Tests assert on *behaviour of an endpoint*, not on
#: which file it currently sits in, so they look it up by name across all of
#: them — a refactor that moves a handler should not turn its test red.
RDP_ROUTER_MODULES = (
    "routers.rdp",
    "routers.rdp_ops",
    "routers.rdp_admin",
    "routers.rdp_tunnel",
)


def find_endpoint(name: str):
    """Return the handler function called `name`, from whichever router holds it."""
    import importlib

    tried = []
    for module_name in RDP_ROUTER_MODULES:
        try:
            module = importlib.import_module(module_name)
        except ModuleNotFoundError:
            continue
        tried.append(module_name)
        fn = getattr(module, name, None)
        if fn is not None:
            return fn
    raise AssertionError(
        f"endpoint {name!r} not found in any of {tried}. "
        "If it was renamed or removed, update the test deliberately."
    )


@pytest.fixture
def endpoint():
    """Fixture form of `find_endpoint`."""
    return find_endpoint


@pytest.fixture
def redis_client():
    """A clean in-process Redis per test."""
    import fakeredis

    client = fakeredis.FakeStrictRedis()
    yield client
    client.flushall()


@pytest.fixture
def gateways(monkeypatch):
    """Two media nodes, so placement and the sweep have something to choose."""
    import json

    from core.config import settings

    monkeypatch.setattr(
        settings,
        "RDP_GATEWAYS",
        json.dumps(
            [
                {
                    "id": "gw1",
                    "public_url": "https://guac1.test.invalid",
                    "private_url": "http://10.0.0.2:8080/guacamole",
                    "capacity": 2,
                },
                {
                    "id": "gw2",
                    "public_url": "https://guac2.test.invalid",
                    "private_url": "http://10.0.0.3:8080/guacamole",
                    "capacity": 2,
                },
            ]
        ),
        raising=False,
    )
    from services import rdp_gateway_cluster

    return rdp_gateway_cluster.parse_gateways()
