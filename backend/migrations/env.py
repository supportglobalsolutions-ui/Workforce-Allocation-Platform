import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel
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

# Supabase terminates non-SSL connections; make that failure mode obvious here
# rather than as an opaque timeout mid-migration.
if "supabase" in db_url and "sslmode=" not in db_url:
    db_url = f"{db_url}{'&' if '?' in db_url else '?'}sslmode=require"

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
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
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
