"""Admin final gross: calculated = rate x hours + bonus; override wins; deductions come off what's used."""
from decimal import Decimal
from types import SimpleNamespace

from services.payroll_engine import settle_gross


def _row(**kw):
    base = dict(base_pay=Decimal("3000"), bonus=Decimal("0"), transfer_cost=Decimal("0"),
                external_cost=Decimal("0"), gross_override=None)
    base.update(kw)
    return SimpleNamespace(**base)


def test_without_override_gross_is_rate_times_hours_plus_bonus():
    r = _row(bonus=Decimal("200"))
    settle_gross(r)
    assert r.calculated_gross == Decimal("3200.00")
    assert r.gross_earned == Decimal("3200.00")
    assert r.final_net == Decimal("3200.00")


def test_admin_final_gross_replaces_calculated_and_deductions_come_off_it():
    r = _row(gross_override=Decimal("3500"), transfer_cost=Decimal("100"))
    settle_gross(r)
    assert r.calculated_gross == Decimal("3000.00")   # what the system worked out
    assert r.gross_earned == Decimal("3500.00")       # what's used
    assert r.total_deductions == Decimal("100.00")
    assert r.final_net == Decimal("3400.00")


def test_admin_can_reduce_the_gross():
    r = _row(gross_override=Decimal("2500"))
    settle_gross(r)
    assert r.gross_earned - r.calculated_gross == Decimal("-500.00")
