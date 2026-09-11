from sqlalchemy.pool import NullPool
from sqlmodel import create_engine, Session, SQLModel  # noqa: F401

from .config import settings

engine_options = {
    "echo": not settings.is_production,
    "pool_pre_ping": True,
}

if settings.DATABASE_USE_PGBOUNCER:
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


def _with_sslmode(url: str) -> str:
    """Supabase refuses plaintext connections; default sslmode=require."""
    if "supabase" in url and "sslmode=" not in url:
        return f"{url}{'&' if '?' in url else '?'}sslmode=require"
    return url


engine = create_engine(_with_sslmode(settings.DATABASE_URL), **engine_options)


def get_db():
    """FastAPI dependency — yields a SQLModel Session and guarantees close."""
    with Session(engine) as session:
        yield session
