from sqlalchemy.pool import NullPool
from sqlmodel import create_engine, Session, SQLModel  # noqa: F401

from .config import settings
from .db_url import normalize_db_url

engine_options = {
    "echo": not settings.is_production,
    "pool_pre_ping": True,
}

DATABASE_URL, _url_is_pooled = normalize_db_url(settings.DATABASE_URL)

# Trust the DSN over the flag: a :6543 URL is pgbouncer whether or not anyone
# remembered to set DATABASE_USE_PGBOUNCER.
USE_PGBOUNCER = settings.DATABASE_USE_PGBOUNCER or _url_is_pooled

if USE_PGBOUNCER:
    # Supabase's :6543 endpoint is pgbouncer in transaction mode; it already
    # multiplexes connections. A second pool on top of it just holds server
    # backends open and burns through the project's connection budget.
    engine_options["poolclass"] = NullPool
elif settings.is_production:
    engine_options.update(
        pool_size=10,
        max_overflow=20,
        pool_timeout=15,
        pool_recycle=1800,
    )
else:
    # Fast Refresh can fire many concurrent requests during local development.
    # Do not retain a shared pool: close each request's connection immediately
    # so abandoned reload requests cannot exhaust the backend.
    engine_options["poolclass"] = NullPool


engine = create_engine(DATABASE_URL, **engine_options)


def get_db():
    """FastAPI dependency — yields a SQLModel Session and guarantees close."""
    with Session(engine) as session:
        yield session
