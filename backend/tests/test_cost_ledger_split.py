"""Shared-cost ledger split maths: exact totals, equal heads, custom %, pools."""
from decimal import Decimal
from uuid import uuid4

import pytest

from services.cost_ledger import CostLedgerError, compute_shares, split_by_weights


def _amounts(shares, kind):
    return [s.amount_base for s in shares if s.kind == kind]


def test_equal_split_across_all_workers():
    workers = [uuid4() for _ in range(10)]
    shares = compute_shares(
        total=Decimal("3000"), worker_pool_pct=Decimal(100), worker_ids=workers, client_ids=[],
    )
    assert _amounts(shares, "worker") == [Decimal("300.00")] * 10


def test_uneven_cents_still_sum_to_the_total():
    amounts = split_by_weights(Decimal("100.00"), [Decimal(1)] * 3)
    assert sum(amounts) == Decimal("100.00")
    assert sorted(amounts) == [Decimal("33.33"), Decimal("33.33"), Decimal("33.34")]


def test_fifty_fifty_between_workers_and_clients():
    workers = [uuid4() for _ in range(4)]
    clients = [uuid4() for _ in range(2)]
    shares = compute_shares(
        total=Decimal("3000"), worker_pool_pct=Decimal(50),
        worker_ids=workers, client_ids=clients,
    )
    assert _amounts(shares, "worker") == [Decimal("375.00")] * 4
    assert _amounts(shares, "client") == [Decimal("750.00")] * 2
    assert sum(s.amount_base for s in shares) == Decimal("3000.00")


def test_custom_percent_per_client():
    a, b = uuid4(), uuid4()
    shares = compute_shares(
        total=Decimal("50000"), worker_pool_pct=Decimal(0), worker_ids=[],
        client_ids=[a, b], client_mode="percent",
        client_pcts={a: Decimal(70), b: Decimal(30)},
    )
    by_id = {s.recipient_id: s.amount_base for s in shares}
    assert by_id == {a: Decimal("35000.00"), b: Decimal("15000.00")}


def test_percentages_must_add_to_100():
    a, b = uuid4(), uuid4()
    with pytest.raises(CostLedgerError, match="not 100%"):
        compute_shares(
            total=Decimal("100"), worker_pool_pct=Decimal(100),
            worker_ids=[a, b], worker_mode="percent",
            worker_pcts={a: Decimal(60), b: Decimal(30)},
            client_ids=[],
        )


def test_a_pool_with_money_needs_recipients():
    with pytest.raises(CostLedgerError, match="at least one client"):
        compute_shares(
            total=Decimal("100"), worker_pool_pct=Decimal(50),
            worker_ids=[uuid4()], client_ids=[],
        )


def test_empty_pool_with_zero_share_is_fine():
    shares = compute_shares(
        total=Decimal("100"), worker_pool_pct=Decimal(100),
        worker_ids=[uuid4()], client_ids=[],
    )
    assert [s.kind for s in shares] == ["worker"]
