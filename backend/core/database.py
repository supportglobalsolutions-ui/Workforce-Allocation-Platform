import logging
import time

from sqlalchemy import event
from sqlalchemy.pool import NullPool
from sqlmodel import create_engine, Session, SQLModel  # noqa: F401

from .config import settings
from .db_url import normalize_db_url

logger = logging.getLogger(__name__)

engine_options = {
    # Echoing every statement is expensive and drowns the logs. Opt in with
    # LOG_LEVEL=DEBUG when you actually want to see the SQL.
    "echo": settings.LOG_LEVEL.upper() == "DEBUG",
    "pool_pre_ping": True,
    # Mirror connect_timeout on the DSN. psycopg2 accepts either; setting both
    # keeps local and pooled URLs from hanging the request thread.
    "connect_args": {"connect_timeout": 10},
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
    # Keep a small pool in development too.
    #
    # NullPool opens a fresh connection per request, which costs ~5s against a
    # remote Supabase instance — every click paid that before touching a row.
    # A bounded pool also caps concurrency better than NullPool did: Fast
    # Refresh bursts now queue on pool_timeout instead of opening unlimited
    # backends.
    engine_options.update(
        pool_size=5,
        max_overflow=5,
        pool_timeout=15,
        pool_recycle=1800,
    )


engine = create_engine(DATABASE_URL, **engine_options)


# Retry the act of opening a connection.
#
# The database is remote, and a brief DNS or network blip on the client side
# ("could not translate host name ... to address") otherwise surfaces as a 500
# to the worker mid-session. pool_pre_ping only recycles connections that died
# while idle — it does nothing when establishing a new one fails.
#
# Query errors are NOT retried here; only connection establishment.
_CONNECT_ATTEMPTS = 3
_CONNECT_BACKOFF_SECONDS = 0.5


@event.listens_for(engine, "do_connect")
def _connect_with_retry(dialect, conn_rec, cargs, cparams):
    last_error: Exception | None = None
    for attempt in range(1, _CONNECT_ATTEMPTS + 1):
        try:
            return dialect.dbapi.connect(*cargs, **cparams)
        except Exception as exc:  # DNS failure, refused, transient timeout
            last_error = exc
            if attempt == _CONNECT_ATTEMPTS:
                break
            logger.warning(
                "Database connect attempt %s/%s failed (%s); retrying in %.1fs",
                attempt, _CONNECT_ATTEMPTS, type(exc).__name__,
                _CONNECT_BACKOFF_SECONDS * attempt,
            )
            time.sleep(_CONNECT_BACKOFF_SECONDS * attempt)
    logger.error("Database unreachable after %s attempts: %s", _CONNECT_ATTEMPTS, last_error)
    raise last_error  # type: ignore[misc]


def get_db():
    """FastAPI dependency — yields a SQLModel Session and guarantees close."""
    with Session(engine) as session:
        yield session
