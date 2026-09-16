"""Join tickets must be spendable exactly once (Phase 5 Action 1)."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from services import rdp_join_ticket as jt

CLAIMS = dict(
    worker_id="11111111-1111-1111-1111-111111111111",
    allocation_id="22222222-2222-2222-2222-222222222222",
    rdp_id="33333333-3333-3333-3333-333333333333",
    connection_id="7",
    connection_name="WIN-01",
    connection_generation=3,
)


def test_issue_then_redeem_carries_the_binding(redis_client):
    ticket, claims, ttl = jt.issue_ticket(redis_client, **CLAIMS)
    assert ttl > 0
    redeemed = jt.redeem_ticket(redis_client, ticket)
    assert redeemed is not None
    assert redeemed.connection_name == "WIN-01"
    assert redeemed.connection_generation == 3
    assert redeemed.allocation_id == CLAIMS["allocation_id"]


def test_raw_ticket_is_never_stored(redis_client):
    """A Redis dump must not be replayable against Guacamole."""
    ticket, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    needle = ticket.encode()
    for key in redis_client.keys("*"):
        assert needle not in key, "the ticket must not appear in a key name"
        # The store holds a string (the claims) and a set (the revocation
        # index), so check whichever this key actually is.
        kind = redis_client.type(key)
        if kind == b"string":
            assert needle not in (redis_client.get(key) or b"")
        elif kind == b"set":
            assert all(needle not in member for member in redis_client.smembers(key))
        else:  # pragma: no cover - guards against a future storage change
            pytest.fail(f"unexpected Redis type {kind!r} for {key!r}")


def test_replay_is_refused(redis_client):
    ticket, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    assert jt.redeem_ticket(redis_client, ticket) is not None
    assert jt.redeem_ticket(redis_client, ticket) is None


@pytest.mark.parametrize("bogus", ["", "not-a-ticket", "x" * 64])
def test_unknown_tickets_are_refused(redis_client, bogus):
    assert jt.redeem_ticket(redis_client, bogus) is None


def test_reissue_revokes_the_previous_ticket(redis_client):
    """Reloading the desktop tab must not leave a second usable key behind."""
    old, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    new, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    assert jt.redeem_ticket(redis_client, old) is None
    assert jt.redeem_ticket(redis_client, new) is not None


def test_release_revokes_outstanding_tickets(redis_client):
    live, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    assert jt.revoke_for_allocations(redis_client, [CLAIMS["allocation_id"]]) == 1
    assert jt.redeem_ticket(redis_client, live) is None


def test_concurrent_redemption_has_exactly_one_winner(redis_client):
    """
    Two tabs racing the same ticket in the same millisecond.

    This is the property the whole single-use guarantee rests on, and GETDEL is
    what provides it — a get-then-delete pair would let both through.
    """
    ticket, _, _ = jt.issue_ticket(redis_client, **CLAIMS)
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: jt.redeem_ticket(redis_client, ticket), range(8)))
    winners = [r for r in results if r is not None]
    assert len(winners) == 1, f"expected exactly one winner, got {len(winners)}"
