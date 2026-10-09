"""A tier's rate is paid exactly as entered, in the tier's currency."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from services import payroll_engine


def _period(currency="USD"):
    return SimpleNamespace(currency=currency, start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))


def _patch(monkeypatch, entry, rates):
    monkeypatch.setattr(payroll_engine, "_rate_entry_for", lambda db, w, p: entry)
    monkeypatch.setattr(payroll_engine, "ensure_rate", lambda db, base, quote: rates.get((base, quote)))
    monkeypatch.setattr(payroll_engine, "currency_for_country", lambda db, country: "KES")


def test_ugx_tier_rate_is_not_converted_again(monkeypatch):
    entry = SimpleNamespace(amount=Decimal("5000"), currency="UGX")
    _patch(monkeypatch, entry, {("USD", "UGX"): Decimal("3700")})

    terms = payroll_engine.pay_terms(None, SimpleNamespace(country="Kenya"), _period())

    assert terms.currency == "UGX"
    assert terms.rate_local == Decimal("5000")
    assert terms.fx == Decimal("3700")
    assert round(terms.rate_base, 4) == round(Decimal("5000") / Decimal("3700"), 4)


def test_usd_tier_stays_usd_for_a_ugandan_worker(monkeypatch):
    entry = SimpleNamespace(amount=Decimal("4"), currency="USD")
    _patch(monkeypatch, entry, {("USD", "UGX"): Decimal("3700")})

    terms = payroll_engine.pay_terms(None, SimpleNamespace(country="Uganda"), _period())

    assert terms.currency == "USD"
    assert terms.rate_local == Decimal("4")
    assert terms.fx == Decimal("1")


def test_no_rate_falls_back_to_country_currency(monkeypatch):
    _patch(monkeypatch, None, {("USD", "KES"): Decimal("129")})

    terms = payroll_engine.pay_terms(None, SimpleNamespace(country="Kenya"), _period())

    assert terms.currency == "KES"
    assert terms.rate_local is None
    assert terms.rate_base is None


def test_missing_fx_keeps_local_rate(monkeypatch):
    entry = SimpleNamespace(amount=Decimal("5000"), currency="UGX")
    _patch(monkeypatch, entry, {})

    terms = payroll_engine.pay_terms(None, SimpleNamespace(country="Uganda"), _period())

    assert terms.currency == "UGX"
    assert terms.rate_local == Decimal("5000")
    assert terms.fx is None
    assert terms.rate_base is None
