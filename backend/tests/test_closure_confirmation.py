"""
Closure must be proven, never assumed (Phase 3 Action 3).

`close_and_confirm` is what stands between "the worker pressed Disconnect" and
"the next worker gets this machine". If it ever reports success while a tunnel
is still live, two people end up on one Windows session. The four outcomes are
the whole contract:

    closed          we killed it and watched it go
    already_closed  nothing was there to kill
    pending         we asked, it has not gone yet  -> caller must NOT release
    failed          we could not even ask          -> caller must NOT release

No network: the gateway REST calls are stubbed at the seams.
"""
from __future__ import annotations

import pytest

from core.guacamole import GuacamoleClient


class FakeResponse:
    def raise_for_status(self):
        return None


class FakeHttpClient:
    """Stands in for httpx.Client as a context manager."""

    def __init__(self, *args, **kwargs):
        self.patched = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def patch(self, url, **kwargs):
        self.patched.append(url)
        return FakeResponse()


class StubGuac(GuacamoleClient):
    """A client whose gateway answers are scripted."""

    def __init__(self, active_sequence):
        # Skip GuacamoleClient.__init__ — no Redis, no settings needed.
        self._base = "http://gw.test/guacamole"
        self._redis = None
        self.gateway_id = "gw1"
        self._cache_key = "guac:auth:test"
        self._token_memo = ("tok", "postgresql")
        self._sequence = list(active_sequence)
        self.calls = 0

    def list_active_connections(self):
        self.calls += 1
        if not self._sequence:
            return {}
        # Last entry repeats, so "still there" can be expressed once.
        return self._sequence.pop(0) if len(self._sequence) > 1 else self._sequence[0]


LIVE = {"active-1": {"connectionIdentifier": "7"}}
EMPTY: dict = {}


@pytest.fixture(autouse=True)
def stub_httpx(monkeypatch):
    import core.guacamole as guac_module

    monkeypatch.setattr(guac_module.httpx, "Client", FakeHttpClient)


def test_already_closed_when_nothing_is_running():
    guac = StubGuac([EMPTY])
    assert guac.close_and_confirm("7") == {"outcome": "already_closed", "closed": 0}


def test_closed_when_the_session_goes_away():
    # Live on the first look, gone on the confirm.
    guac = StubGuac([LIVE, EMPTY])
    outcome = guac.close_and_confirm("7")
    assert outcome["outcome"] == "closed"
    assert outcome["closed"] == 1


def test_pending_when_it_refuses_to_die():
    """The caller must not release on this — the tunnel may still be live."""
    guac = StubGuac([LIVE])  # always live
    outcome = guac.close_and_confirm("7", timeout_seconds=0.1)
    assert outcome["outcome"] == "pending"
    assert outcome["closed"] == 0


def test_failed_when_the_gateway_cannot_be_reached():
    class Unreachable(StubGuac):
        def list_active_connections(self):
            raise ConnectionError("gateway down")

    outcome = Unreachable([EMPTY]).close_and_confirm("7")
    assert outcome["outcome"] == "failed"
    assert outcome["closed"] == 0
    assert outcome["error"] == "ConnectionError"


def test_unrelated_sessions_are_not_touched():
    """Only the requested connection may be killed."""
    other = {"active-9": {"connectionIdentifier": "99"}}
    guac = StubGuac([other])
    assert guac.close_and_confirm("7")["outcome"] == "already_closed"


def test_encoded_connection_id_matches_the_raw_one():
    """
    The browser's base64 `id\\0c\\0datasource` form must resolve to the same
    connection — otherwise a kill silently targets nothing.
    """
    import base64

    encoded = base64.b64encode(b"7\x00c\x00postgresql").decode()
    guac = StubGuac([LIVE, EMPTY])
    assert guac.close_and_confirm(encoded)["outcome"] == "closed"


def test_engine_refuses_to_release_on_an_unconfirmed_closure():
    """
    The contract that makes all of the above matter: `pending` and `failed` must
    stop `disconnect()` before it marks anything released. If this guard is ever
    removed, a machine goes back in the pool with a live tunnel on it.
    """
    import inspect

    from services import rdp_engine

    source = inspect.getsource(rdp_engine.disconnect)
    guard = source.index('{"pending", "failed"}')
    release = source.index("_mark_allocation_ended")
    assert guard < release, (
        "the unconfirmed-closure guard must come before anything is released"
    )
    assert "close_pending" in source, "the caller needs a distinct code to surface"


def test_admin_path_refuses_on_an_unconfirmed_closure():
    """
    Admin force-stop must surface `close_pending` as a retryable 503, not as
    success. An admin acting on a machine needs to know the tunnel is still
    there.
    """
    import inspect

    from services import rdp_engine

    source = inspect.getsource(rdp_engine.disconnect)
    at = source.index('code="close_pending"')
    before = source[max(0, at - 200) : at]
    after = source[at : at + 600]

    assert "ok=False" in before, "close_pending must be returned as ok=False"
    assert "SERVICE_UNAVAILABLE" in after or "503" in after, (
        "an unconfirmed closure is retryable — it should surface as 503"
    )


def test_worker_end_frees_the_worker_but_holds_the_machine():
    """
    The resolution of the two competing requirements (Phase 3 Action 3).

    A worker whose closure cannot be confirmed must still be able to leave —
    blocking End trapped them with a Live claim. But the machine must not go
    back in the pool on an unproven close, or the next worker lands on a live
    session (Principle 5). So: end the allocation, hold the machine.
    """
    import inspect

    from services import rdp_engine

    source = inspect.getsource(rdp_engine.disconnect)
    assert 'if initiated_by == "worker"' in source
    assert "hold_machine = True" in source, "a worker End must flag the machine as held"
    assert "hold_machine_unconfirmed" in source, (
        "the held branch must take the machine out of service"
    )

    # The hold must be the first branch of the final status decision, so it
    # pre-empts both "restore standing assignment" and "return to the pool".
    held_branch = source.index("if hold_machine:")
    restore_branch = source.index("elif restore and logout_worker_id:")
    assert held_branch < restore_branch, (
        "the hold must pre-empt restoring or re-pooling the machine"
    )


def test_holding_a_machine_is_not_releasing_it():
    import inspect

    from services import rdp_quarantine

    source = inspect.getsource(rdp_quarantine.hold_machine_unconfirmed)
    assert "RdpStatusEnum.maintenance" in source, "held machines leave the claimable pool"
    assert "online_free" not in source, "a hold must never free the machine"
    assert "quarantine_reason" in source, "an admin needs to see why"


def test_repair_will_not_free_a_held_machine_without_confirming():
    """
    The hazard repair must not recreate: clearing the hold without re-proving
    the tunnel is gone just puts the live session back in the pool.
    """
    import inspect

    from services import rdp_quarantine

    source = inspect.getsource(rdp_quarantine.repair_quarantined)
    confirm = source.index("close_and_confirm")
    clear = source.index("RdpStatusEnum.online_free")
    assert confirm < clear, "repair must confirm closure before returning it to service"
    assert "still_unconfirmed" in source, "a failed confirmation needs its own outcome"
