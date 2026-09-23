"""Country-local currency defaults and automatic FX refresh behaviour."""
from decimal import Decimal

from services import fx


class EmptyCatalogDb:
    """Enough of the DB interface to exercise catalog-miss fallback behaviour."""

    def exec(self, _statement):
        class Result:
            @staticmethod
            def first():
                return None
        return Result()


def test_country_currency_fallbacks_cover_east_africa():
    db = EmptyCatalogDb()
    assert fx.currency_for_country(db, "Kenya") == "KES"
    assert fx.currency_for_country(db, "uganda") == "UGX"
    assert fx.currency_for_country(db, "Tanzania") == "TZS"


def test_unknown_country_keeps_usd_as_safe_final_fallback():
    assert fx.currency_for_country(EmptyCatalogDb(), "Atlantis") == "USD"


def test_ensure_rate_returns_existing_rate_without_refresh(monkeypatch):
    monkeypatch.setattr(fx, "resolve_rate", lambda *_: (Decimal("129.50"), "manual"))
    refreshed = []
    monkeypatch.setattr(fx, "store_api_rates_for_codes", lambda *_args, **_kwargs: refreshed.append(True))
    assert fx.ensure_rate(EmptyCatalogDb(), "USD", "KES") == Decimal("129.50")
    assert refreshed == []
