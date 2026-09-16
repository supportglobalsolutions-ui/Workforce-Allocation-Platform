"""
Short-lived, single-use join tickets for the direct Guacamole gateway (Phase 5).

The control plane (FastAPI) decides who may sit where; the media plane
(Guacamole/guacd) draws the pixels. A join ticket is the only thing that
crosses between them. It is bound to worker + allocation + machine +
connection + generation, lives ~30 seconds, and is redeemable exactly once.

Two independent gates, so neither alone has to be perfect:

  * **Redis** holds the nonce and makes redemption atomic and single-use.
  * **Postgres** is re-read at redemption: the allocation must still be open
    and still carry the same ``connection_generation``. That is what makes a
    late actor harmless (Principle 8) — ending a session invalidates every
    ticket for it even if Redis never heard about the release.

Redis layout::

    rdp:join:<sha256(ticket)>       JSON claims, TTL = RDP_JOIN_TICKET_TTL_SECONDS
    rdp:join:alloc:<allocation_id>  set of live ticket hashes, for revocation

The ticket value itself is never stored — only its SHA-256 — so a Redis dump
cannot be replayed against Guacamole.
"""
from __future__ import annotations

import hashlib
import json
import logging
import secrets
from dataclasses import asdict, dataclass
from uuid import UUID

import redis as redis_lib

from core.config import settings

logger = logging.getLogger(__name__)

_TICKET_PREFIX = "rdp:join:"
_ALLOC_PREFIX = "rdp:join:alloc:"

# The allocation index outlives its tickets slightly so revocation still finds
# a hash whose own key is mid-expiry.
_INDEX_SLACK_SECONDS = 30


class JoinTicketError(RuntimeError):
    """A ticket could not be issued."""


@dataclass(frozen=True)
class JoinTicketClaims:
    ticket_id: str
    worker_id: str
    allocation_id: str
    rdp_id: str
    connection_id: str
    connection_name: str
    connection_generation: int
    # Which media node this ticket was minted for. Redeeming it anywhere else
    # would put the session on a gateway the control plane is not tracking, so
    # a later kill would target the wrong node and silently miss.
    gateway_id: str = "default"

    @classmethod
    def from_json(cls, raw: bytes | str) -> "JoinTicketClaims":
        data = json.loads(raw)
        return cls(
            ticket_id=str(data["ticket_id"]),
            worker_id=str(data["worker_id"]),
            allocation_id=str(data["allocation_id"]),
            rdp_id=str(data["rdp_id"]),
            connection_id=str(data["connection_id"]),
            connection_name=str(data["connection_name"]),
            connection_generation=int(data.get("connection_generation", 1)),
            gateway_id=str(data.get("gateway_id") or "default"),
        )


def _hash(ticket: str) -> str:
    return hashlib.sha256(ticket.encode("utf-8")).hexdigest()


def _ticket_key(ticket: str) -> str:
    return f"{_TICKET_PREFIX}{_hash(ticket)}"


def _alloc_key(allocation_id: UUID | str) -> str:
    return f"{_ALLOC_PREFIX}{allocation_id}"


def ticket_ttl_seconds() -> int:
    return max(int(settings.RDP_JOIN_TICKET_TTL_SECONDS), 10)


def issue_ticket(
    redis_client: redis_lib.Redis,
    *,
    worker_id: UUID | str,
    allocation_id: UUID | str,
    rdp_id: UUID | str,
    connection_id: str,
    connection_name: str,
    connection_generation: int,
    gateway_id: str = "default",
) -> tuple[str, JoinTicketClaims, int]:
    """
    Mint one ticket. Returns (ticket, claims, ttl_seconds).

    Issuing revokes any ticket still outstanding for this allocation: a worker
    who reloads the desktop tab must not leave a usable second key behind.
    """
    revoke_for_allocation(redis_client, allocation_id)

    ticket = secrets.token_urlsafe(32)
    ttl = ticket_ttl_seconds()
    claims = JoinTicketClaims(
        # Log-safe handle for one ticket; never the ticket itself.
        ticket_id=_hash(ticket)[:16],
        worker_id=str(worker_id),
        allocation_id=str(allocation_id),
        rdp_id=str(rdp_id),
        connection_id=str(connection_id),
        connection_name=str(connection_name),
        connection_generation=int(connection_generation),
        gateway_id=str(gateway_id or "default"),
    )

    try:
        pipe = redis_client.pipeline()
        pipe.setex(_ticket_key(ticket), ttl, json.dumps(asdict(claims)))
        pipe.sadd(_alloc_key(allocation_id), _hash(ticket))
        pipe.expire(_alloc_key(allocation_id), ttl + _INDEX_SLACK_SECONDS)
        pipe.execute()
    except Exception as exc:
        raise JoinTicketError(
            f"Could not store the join ticket: {type(exc).__name__}"
        ) from exc

    return ticket, claims, ttl


def redeem_ticket(redis_client: redis_lib.Redis, ticket: str) -> JoinTicketClaims | None:
    """
    Consume a ticket and return its claims, or None when it is unknown,
    already used, or expired.

    GETDEL makes redemption atomic, so two tabs racing the same ticket cannot
    both be let through. The caller still has to confirm the claims against
    the database — this function only proves the ticket was fresh.
    """
    if not ticket:
        return None
    try:
        raw = redis_client.getdel(_ticket_key(ticket))
    except Exception as exc:
        logger.warning("Join-ticket redemption failed: %s", exc)
        return None
    if not raw:
        return None

    try:
        claims = JoinTicketClaims.from_json(raw)
    except Exception as exc:
        logger.warning("Join ticket held unreadable claims: %s", exc)
        return None

    try:
        redis_client.srem(_alloc_key(claims.allocation_id), _hash(ticket))
    except Exception:
        pass  # The index entry expires on its own; the ticket key is already gone.
    return claims


def revoke_for_allocation(
    redis_client: redis_lib.Redis, allocation_id: UUID | str
) -> int:
    """Drop every outstanding ticket for one allocation. Returns how many."""
    index = _alloc_key(allocation_id)
    try:
        hashes = redis_client.smembers(index)
        if not hashes:
            return 0
        pipe = redis_client.pipeline()
        for digest in hashes:
            key = digest.decode() if isinstance(digest, bytes) else str(digest)
            pipe.delete(f"{_TICKET_PREFIX}{key}")
        pipe.delete(index)
        pipe.execute()
        return len(hashes)
    except Exception as exc:
        logger.warning(
            "Could not revoke join tickets for allocation %s: %s", allocation_id, exc
        )
        return 0


def revoke_for_allocations(
    redis_client: redis_lib.Redis, allocation_ids: list[UUID | str]
) -> int:
    """
    End / force-stop path: burn the keys for every allocation being released.

    Best-effort by design. A ticket this misses is still refused at redemption
    because its allocation is no longer open — this only closes the window
    faster.
    """
    return sum(revoke_for_allocation(redis_client, aid) for aid in allocation_ids)
