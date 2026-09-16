"""Normalize a Postgres DSN so psycopg2 accepts what Supabase hands you.

Supabase's dashboard presents pooled connection strings in Prisma's dialect,
e.g. ``...:6543/postgres?pgbouncer=true``. ``pgbouncer`` is not a libpq
parameter, and psycopg2 rejects the whole DSN with
``invalid connection option "pgbouncer"`` rather than ignoring it. Strip it.

Also:
  * Supabase terminates plaintext connections, so default ``sslmode=require``.
  * Port 6543 is pgbouncer in transaction mode. Report that so the caller can
    avoid stacking a SQLAlchemy pool on top of it.
"""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

# Accepted by other drivers/ORMs but not by libpq — silently drop these.
_NON_LIBPQ_PARAMS = {"pgbouncer", "schema", "connection_limit", "pool_timeout"}

TRANSACTION_POOLER_PORT = 6543
SESSION_POOLER_PORT = 5432


def normalize_db_url(url: str) -> tuple[str, bool]:
    """Return ``(clean_url, is_transaction_pooled)``.

    ``is_transaction_pooled`` is True when the DSN targets pgbouncer's
    transaction mode, inferred from port 6543 or an explicit
    ``pgbouncer=true`` that we are about to remove.
    """
    if not url:
        return url, False

    parts = urlparse(url)
    params = parse_qsl(parts.query, keep_blank_values=True)

    pgbouncer_flag = any(
        k.lower() == "pgbouncer" and v.lower() in {"true", "1", "yes"}
        for k, v in params
    )
    params = [(k, v) for k, v in params if k.lower() not in _NON_LIBPQ_PARAMS]

    is_supabase = "supabase." in (parts.hostname or "")
    if is_supabase and not any(k.lower() == "sslmode" for k, _ in params):
        params.append(("sslmode", "require"))
    # Fail fast when the DB host is unreachable (common on flaky networks /
    # wrong direct :5432 routes). Without this, libpq can hang past the Next
    # proxy timeout and the login UI only sees a blank 500.
    if not any(k.lower() == "connect_timeout" for k, _ in params):
        params.append(("connect_timeout", "10"))

    pooled = pgbouncer_flag or parts.port == TRANSACTION_POOLER_PORT

    clean = urlunparse(parts._replace(query=urlencode(params)))
    return clean, pooled


def to_session_pooler(url: str) -> str:
    """Move a Supabase transaction-pooler DSN (:6543) to the session pooler.

    DDL and transactional migrations misbehave through pgbouncer's transaction
    mode, so Alembic must not use :6543. The session pooler is the same host
    and credentials on port 5432.
    """
    parts = urlparse(url)
    if parts.port != TRANSACTION_POOLER_PORT or not parts.hostname:
        return url
    netloc = parts.netloc.replace(
        f":{TRANSACTION_POOLER_PORT}", f":{SESSION_POOLER_PORT}"
    )
    return urlunparse(parts._replace(netloc=netloc))
