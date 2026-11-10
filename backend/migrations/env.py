import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from sqlalchemy import create_engine, engine_from_config, pool
from sqlmodel import SQLModel

from core.db_url import normalize_db_url, to_session_pooler
import models  # noqa: F401 — registers all SQLModel table classes

config = context.config

# alembic.ini deliberately ships no credential, so the URL must come from the
# environment. Load backend/.env first so `alembic upgrade head` works from a
# plain shell without exporting DATABASE_URL by hand.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise RuntimeError(
        "DATABASE_URL is not set. Put it in backend/.env (or export it) before "
        "running Alembic. For Supabase use the direct connection or the session "
        "pooler — not the transaction pooler on :6543."
    )

# Strip Prisma-only params (psycopg2 rejects ?pgbouncer=true outright) and
# default sslmode=require for Supabase.
db_url, is_pooled = normalize_db_url(db_url)

# DDL and transactional migrations misbehave through pgbouncer's transaction
# mode, so never migrate over :6543. The session pooler is the same host and
# credentials on :5432 — switch automatically and say so.
if is_pooled:
    switched = to_session_pooler(db_url)
    if switched != db_url:
        print(
            "alembic: DATABASE_URL points at the :6543 transaction pooler; "
            "using the :5432 session pooler for migrations instead."
        )
        db_url = switched

config.set_main_option("sqlalchemy.url", db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from core.database import _native_postgres_driver_available, _pg8000_ssl_context

    if _native_postgres_driver_available():
        connectable = engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )
    else:
        # Same fallback as the app (core/database.py): Windows Application
        # Control can block psycopg2's compiled driver; pg8000 is pure Python.
        parsed = urlparse(db_url)
        query = parse_qsl(parsed.query, keep_blank_values=True)
        options = {key.lower(): value for key, value in query}
        params = [(k, v) for k, v in query if k.lower() not in {"sslmode", "sslrootcert", "connect_timeout"}]
        url = urlunparse(parsed._replace(scheme="postgresql+pg8000", query=urlencode(params)))
        print("alembic: psycopg2 is blocked on this machine; using the pure-Python pg8000 driver.")
        connectable = create_engine(
            url,
            poolclass=pool.NullPool,
            connect_args={
                "timeout": 30,
                "ssl_context": _pg8000_ssl_context(options.get("sslmode", ""), options.get("sslrootcert")),
            },
        )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
