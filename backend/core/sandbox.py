"""Test mode: a private, empty copy of every table for one Super Admin.

While a Super Admin has test mode on, the browser sends ``X-Test-Mode: 1``.
The middleware in main.py verifies the caller and stores two things here:

* that this request is in test mode — used to block anything that reaches
  real people or machines (email, login accounts, desktop connections);
* the caller's sandbox schema — ``current_engine()`` rewrites every table
  reference to it, so reads and writes never touch the real rows.

Other users' requests carry neither, so they keep using the real data.
"""
from __future__ import annotations

import logging
import threading
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, select

from .database import engine

logger = logging.getLogger(__name__)

TEST_MODE_HEADER = "x-test-mode"
TEST_MODE_BLOCKED = "This is turned off in test mode so nothing reaches real people or machines."
TEST_SUBJECT_PREFIX = "[TEST] "

_test_mode: ContextVar[bool] = ContextVar("test_mode", default=False)
_sandbox_schema: ContextVar[Optional[str]] = ContextVar("sandbox_schema", default=None)
_test_user_email: ContextVar[str] = ContextVar("test_user_email", default="")
# Extra inboxes admins listed in Settings that may also receive test-mode email.
_test_extra_emails: ContextVar[frozenset[str]] = ContextVar("test_extra_emails", default=frozenset())
# Test mode only: the test worker an admin is viewing the worker portal as.
ACT_AS_HEADER = "x-act-as-worker"
_act_as_worker: ContextVar[Optional[str]] = ContextVar("act_as_worker", default=None)

# Admins and super admins may switch test mode on for themselves.
TEST_MODE_ROLES = frozenset({"admin", "super_admin"})

_engines: dict[str, Engine] = {}
_ready: set[str] = set()
_lock = threading.Lock()
# schema -> "building" | "failed: <reason>"
_build_state: dict[str, str] = {}


# One shared test workspace: every admin who turns test mode on sees the same
# test data, and it stays until someone clears it from Settings.
SHARED_SANDBOX_SCHEMA = "sandbox_shared"


def schema_for(auth_uid: str) -> str:  # noqa: ARG001 — kept so callers need not change
    return SHARED_SANDBOX_SCHEMA


def set_request_test_mode(
    active: bool, schema: Optional[str], email: str = "", extra_emails=(), act_as: Optional[str] = None,
):
    extra = frozenset(e.strip().lower() for e in extra_emails if e and e.strip())
    return (
        _test_mode.set(active),
        _sandbox_schema.set(schema),
        _test_user_email.set(email.strip().lower()),
        _test_extra_emails.set(extra),
        _act_as_worker.set((act_as or "").strip() or None),
    )


def reset_request_test_mode(tokens) -> None:
    mode_token, schema_token, email_token, extra_token, act_token = tokens
    _act_as_worker.reset(act_token)
    _test_extra_emails.reset(extra_token)
    _test_user_email.reset(email_token)
    _sandbox_schema.reset(schema_token)
    _test_mode.reset(mode_token)


def in_test_mode() -> bool:
    return _test_mode.get()


def acting_test_worker_id() -> Optional[str]:
    """Worker id an admin is acting as — only inside the sandbox, never on real tables."""
    if not _test_mode.get() or _sandbox_schema.get() is None:
        return None
    return _act_as_worker.get()


def test_mode_email() -> str:
    """The tester's own address."""
    return _test_user_email.get()


def test_mode_recipients() -> frozenset[str]:
    """Every inbox test mode may email: the tester plus the addresses listed in Settings."""
    own = _test_user_email.get()
    return _test_extra_emails.get() | ({own} if own else frozenset())


def load_test_mode_emails() -> list[str]:
    """Extra test inboxes from the real platform_settings row (call before entering the sandbox)."""
    from models.platform_settings import PLATFORM_SETTINGS_ID, PlatformSettings

    try:
        with Session(engine) as db:
            row = db.get(PlatformSettings, PLATFORM_SETTINGS_ID)
            return list(row.test_mode_emails or []) if row else []
    except Exception:
        logger.exception("Could not load test-mode email list")
        return []


def test_subject(subject: str) -> str:
    """Mark an email sent from test mode; applied once."""
    return subject if subject.startswith(TEST_SUBJECT_PREFIX) else TEST_SUBJECT_PREFIX + subject


def current_schema() -> Optional[str]:
    return _sandbox_schema.get()


def block_in_test_mode(what: str = "") -> None:
    if in_test_mode():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{what} is turned off in test mode." if what else TEST_MODE_BLOCKED,
        )


def sandbox_engine(schema: str) -> Engine:
    with _lock:
        eng = _engines.get(schema)
        if eng is None:
            eng = engine.execution_options(schema_translate_map={None: schema})
            _engines[schema] = eng
        return eng


def current_engine() -> Engine:
    """The engine for this request: the caller's sandbox in test mode, else the real one."""
    schema = current_schema()
    return sandbox_engine(schema) if schema else engine


# ── lifecycle ────────────────────────────────────────────────────────────────

def is_ready(schema: str) -> bool:
    if schema in _ready:
        return True
    with engine.connect() as conn:
        found = conn.execute(text("select to_regclass(:name)"), {"name": f"{schema}.sandbox_meta"}).scalar()
    if found:
        _add_missing_tables(schema)
        _ready.add(schema)
    return bool(found)


def _add_missing_tables(schema: str) -> None:
    """Create tables and columns added to the app after this sandbox was built."""
    import models  # noqa: F401 — registers every table on SQLModel.metadata

    try:
        with engine.connect() as conn:
            existing = set(conn.execute(
                text("select table_name from information_schema.tables where table_schema = :s"), {"s": schema},
            ).scalars())
            columns: dict[str, dict[str, bool]] = {}
            for table_name, column_name, is_nullable in conn.execute(
                text(
                    "select table_name, column_name, is_nullable from information_schema.columns "
                    "where table_schema = :s"
                ),
                {"s": schema},
            ):
                columns.setdefault(table_name, {})[column_name] = is_nullable == "YES"
        missing = [t for t in SQLModel.metadata.sorted_tables if t.name not in existing]
        if missing:
            with sandbox_engine(schema).begin() as conn:
                SQLModel.metadata.create_all(conn, tables=missing)
            logger.info("Added %d new table(s) to sandbox %s", len(missing), schema)
        _add_missing_columns(schema, columns)
    except Exception:
        logger.exception("Could not add new tables to sandbox %s", schema)


def _add_missing_columns(schema: str, columns: dict[str, dict[str, bool]]) -> None:
    statements: list[str] = []
    dialect = engine.dialect
    for table in SQLModel.metadata.sorted_tables:
        have = columns.get(table.name)
        if not have:
            continue
        for column in table.columns:
            target = f'"{schema}"."{table.name}"'
            if column.name not in have:
                ddl = f'ALTER TABLE {target} ADD COLUMN "{column.name}" {column.type.compile(dialect=dialect)}'
                default = column.server_default
                if default is not None and hasattr(default, "arg"):
                    arg = default.arg
                    value = arg.text if hasattr(arg, "text") else f"'{arg}'"
                    ddl += f" DEFAULT {value}"
                    if not column.nullable:
                        ddl += " NOT NULL"
                statements.append(ddl)
            elif column.nullable and not have[column.name] and not column.primary_key:
                statements.append(f'ALTER TABLE {target} ALTER COLUMN "{column.name}" DROP NOT NULL')
    if not statements:
        return
    with engine.begin() as conn:
        for ddl in statements:
            conn.execute(text(ddl))
    logger.info("Updated %d column(s) in sandbox %s", len(statements), schema)


def build_state(schema: str) -> Optional[str]:
    return _build_state.get(schema)


def _seed_reference_data(schema: str, auth_uid: str) -> None:
    """Copy settings the app needs to work. No workforce data is copied."""
    from models.admin_users import AdminUser
    from models.currency import Country, Currency, FxRate
    from models.platform_settings import PlatformSettings

    with Session(engine) as real, Session(sandbox_engine(schema)) as box:
        rows: list = []
        rows += real.exec(select(AdminUser).where(AdminUser.auth_user_id == auth_uid)).all()
        rows += real.exec(select(Currency)).all()
        rows += real.exec(select(Country)).all()
        rows += real.exec(select(FxRate)).all()
        rows += real.exec(select(PlatformSettings)).all()
        for row in rows:
            data = {c.key: getattr(row, c.key) for c in sa_inspect(row).mapper.column_attrs}
            box.add(type(row)(**data))
        box.commit()


def _build(schema: str, auth_uid: str) -> None:
    import models  # noqa: F401 — registers every table on SQLModel.metadata

    try:
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        box = sandbox_engine(schema)
        with box.begin() as conn:
            # Types the app normally expects migrations to create.
            for table in SQLModel.metadata.sorted_tables:
                for column in table.columns:
                    enum_type = column.type
                    if getattr(enum_type, "name", None) and hasattr(enum_type, "create") and hasattr(enum_type, "enums"):
                        enum_type.create(conn, checkfirst=True)
            SQLModel.metadata.create_all(conn)
        _seed_reference_data(schema, auth_uid)
        with box.begin() as conn:
            conn.execute(text(f'CREATE TABLE "{schema}".sandbox_meta (ready_at timestamptz NOT NULL)'))
            conn.execute(
                text(f'INSERT INTO "{schema}".sandbox_meta (ready_at) VALUES (:now)'),
                {"now": datetime.now(timezone.utc)},
            )
        _ready.add(schema)
        _build_state.pop(schema, None)
        logger.info("Test-mode sandbox %s is ready", schema)
    except Exception as exc:
        logger.exception("Building test-mode sandbox %s failed", schema)
        _build_state[schema] = f"failed: {type(exc).__name__}: {str(exc)[:300]}"
        drop_sandbox(schema, keep_state=True)


def start_build(auth_uid: str) -> str:
    """Create the caller's sandbox in the background. Returns the schema name."""
    schema = schema_for(auth_uid)
    with _lock:
        if schema in _ready or _build_state.get(schema) == "building":
            return schema
        _build_state[schema] = "building"
    threading.Thread(target=_build, args=(schema, auth_uid), daemon=True, name=f"sandbox-{schema}").start()
    return schema


def drop_sandbox(schema: str, *, keep_state: bool = False) -> None:
    with engine.begin() as conn:
        conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    _ready.discard(schema)
    if not keep_state:
        _build_state.pop(schema, None)
