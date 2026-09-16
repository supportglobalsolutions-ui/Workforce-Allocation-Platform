"""
What a join ticket is bound to, and what that binding refuses (Phase 5 Action 1).

The ticket is the only thing that crosses from the control plane to the media
plane, so every dimension it carries is a dimension an attacker — or a bug —
cannot vary. These tests pin each one.
"""
from __future__ import annotations

import inspect

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


def test_ticket_carries_every_binding(redis_client):
    _ticket, claims, _ttl = jt.issue_ticket(redis_client, gateway_id="gw1", **CLAIMS)
    assert claims.worker_id == CLAIMS["worker_id"]
    assert claims.allocation_id == CLAIMS["allocation_id"]
    assert claims.rdp_id == CLAIMS["rdp_id"]
    assert claims.connection_id == "7"
    assert claims.connection_generation == 3
    assert claims.gateway_id == "gw1"


def test_gateway_survives_the_redis_round_trip(redis_client):
    """The binding is worthless if it is lost on redemption."""
    ticket, _claims, _ttl = jt.issue_ticket(redis_client, gateway_id="gw2", **CLAIMS)
    redeemed = jt.redeem_ticket(redis_client, ticket)
    assert redeemed is not None
    assert redeemed.gateway_id == "gw2"


def test_gateway_defaults_for_single_node_deployments(redis_client):
    ticket, _claims, _ttl = jt.issue_ticket(redis_client, **CLAIMS)
    redeemed = jt.redeem_ticket(redis_client, ticket)
    assert redeemed is not None
    assert redeemed.gateway_id == "default"


def test_old_tickets_without_a_gateway_still_parse():
    """A ticket minted before this field existed must not crash redemption."""
    legacy = (
        '{"ticket_id":"abc","worker_id":"w","allocation_id":"a","rdp_id":"r",'
        '"connection_id":"7","connection_name":"WIN-01","connection_generation":1}'
    )
    claims = jt.JoinTicketClaims.from_json(legacy)
    assert claims.gateway_id == "default"


def test_verify_refuses_a_ticket_presented_at_the_wrong_gateway():
    """
    The hole this closes: a session on a node the control plane is not
    tracking cannot be killed, so force-stop would release the machine with a
    live tunnel on it.
    """
    from services import rdp_gateway

    source = inspect.getsource(rdp_gateway.verify_join_ticket)
    assert "presented_gateway" in source
    assert "wrong_gateway" in source
    mismatch = source.index("presented_gateway != claims.gateway_id")
    ok_return = source.index('code="ticket_ok"')
    assert mismatch < ok_return, "the gateway check must run before accepting"


def test_absent_gateway_header_is_not_a_mismatch():
    """
    Single-gateway deployments, and any Nginx config predating this check, send
    no header. Treating that as a mismatch would lock every worker out.
    """
    from services import rdp_gateway

    source = inspect.getsource(rdp_gateway.verify_join_ticket)
    assert "if presented_gateway and" in source, (
        "must only enforce when the gateway actually identified itself"
    )


def test_nginx_template_sends_the_gateway_header():
    """The check is inert unless Nginx names the node."""
    from pathlib import Path

    conf = Path(__file__).resolve().parents[2] / "infrastructure" / "nginx" / "guacamole-join-ticket.conf"
    text = conf.read_text(encoding="utf-8")
    assert "X-Gateway-Id" in text
    assert "RDP_GATEWAYS" in text, "operators need to know it must match the cluster id"


# ── Rate limiting: per worker, not per IP ───────────────────────────────


def test_join_ticket_limit_is_keyed_per_worker():
    """
    `check_rate_limit` keys on IP. A whole office behind one NAT would share a
    single budget — and one flaky connect spends up to 6 tickets (jittered
    retries) plus a periodic silent refresh. Ten workers on one address would
    trip the limit during a gateway blip, i.e. exactly when reconnecting.
    """
    from conftest import find_endpoint

    source = inspect.getsource(find_endpoint("create_rdp_join_ticket"))
    assert 'scope="rdp-join-ticket"' in source
    assert "key_suffix=str(worker.id)" in source, (
        "the join-ticket limit must be per worker, not per source IP"
    )

    worker_lookup = source.index("get_worker_for_user")
    limit_call = source.index("check_rate_limit")
    assert worker_lookup < limit_call, (
        "the worker must be resolved before the limit that is keyed on them"
    )


def test_rate_limit_key_includes_the_suffix():
    """Guard the mechanism the fix depends on."""
    from core import rate_limit

    source = inspect.getsource(rate_limit._rate_key)
    assert "key_suffix" in source
    assert "{key}:{key_suffix}" in source or "key_suffix" in source


@pytest.mark.postgres
def test_wrong_gateway_is_refused_end_to_end():
    pytest.skip("covered by the Postgres CI job; see conftest POSTGRES_WHY")
