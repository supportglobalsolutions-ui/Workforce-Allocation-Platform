"""
FX rate resolution: manual admin-entered rates always win over API-fetched ones.
Base currencies are USD and GBP; every other currency is quoted against them.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import Optional

import httpx
from sqlmodel import Session, select

from core.config import settings
from models.currency import Country, Currency, FxRate
from services.currency_names import currency_name

logger = logging.getLogger(__name__)

BASE_CURRENCIES = ("USD", "GBP")


def fetch_latest_rates(base: str) -> dict[str, Decimal]:
    """Live quotes from the FX API: 1 `base` = rate units of each quote code."""
    resp = httpx.get(f"{settings.FX_API_URL}/{base}", timeout=20.0)
    resp.raise_for_status()
    raw = resp.json().get("rates") or {}
    out: dict[str, Decimal] = {}
    for code, value in raw.items():
        if not isinstance(code, str) or len(code) != 3:
            continue
        try:
            rate = Decimal(str(value))
        except Exception:
            continue
        if rate > 0:
            out[code.upper()] = rate
    return out


def list_api_quotes() -> list[dict]:
    """Currencies the FX API currently quotes against USD, with display names."""
    rates = fetch_latest_rates("USD")
    return [
        {"code": code, "name": currency_name(code), "usd_rate": rate}
        for code, rate in sorted(rates.items())
    ]


def _upsert_api_rate(db: Session, base: str, quote: str, rate: Decimal, as_of: date) -> None:
    existing = db.exec(
        select(FxRate).where(
            FxRate.base_currency == base,
            FxRate.quote_currency == quote,
            FxRate.as_of_date == as_of,
            FxRate.source == "api",
        )
    ).first()
    if existing:
        existing.rate = rate
        db.add(existing)
    else:
        db.add(FxRate(
            base_currency=base,
            quote_currency=quote,
            rate=rate,
            source="api",
            as_of_date=as_of,
        ))


def store_api_rates_for_codes(db: Session, quote_codes: set[str], *, commit: bool = True) -> dict[str, int]:
    """Persist today's API rates for the given quotes. Manual rows are never overwritten."""
    today = date.today()
    stored = {"USD": 0, "GBP": 0}
    codes = {c.upper() for c in quote_codes}

    for base in BASE_CURRENCIES:
        try:
            rates = fetch_latest_rates(base)
        except Exception as exc:
            logger.warning("FX fetch for %s failed: %s", base, exc)
            continue

        for code in codes:
            if code == base or code not in rates:
                continue
            _upsert_api_rate(db, base, code, rates[code], today)
            stored[base] += 1

    if commit:
        db.commit()
    return stored


def currency_for_country(db: Session, country_name: str) -> str:
    country = db.exec(select(Country).where(Country.name == country_name)).first()
    return country.currency_code if country else "USD"


def _stored_rate(db: Session, base_currency: str, quote_currency: str) -> tuple[Optional[Decimal], Optional[str]]:
    """Latest stored rate for the pair, manual before API."""
    for source in ("manual", "api"):
        row = db.exec(
            select(FxRate)
            .where(
                FxRate.base_currency == base_currency,
                FxRate.quote_currency == quote_currency,
                FxRate.source == source,
            )
            .order_by(FxRate.as_of_date.desc())
        ).first()
        if row:
            return row.rate, source
    return None, None


def resolve_rate(db: Session, base_currency: str, quote_currency: str) -> tuple[Optional[Decimal], Optional[str]]:
    """
    1 base = X quote, with the source that produced it.

    Only USD rates have to be maintained: a GBP conversion with no stored row is
    derived as (1 USD = quote) / (1 USD = GBP), so editing the single USD→GBP
    number keeps every GBP payout in step.
    """
    base_currency = base_currency.upper()
    quote_currency = quote_currency.upper()
    if base_currency == quote_currency:
        return Decimal("1"), "identity"

    rate, source = _stored_rate(db, base_currency, quote_currency)
    if rate is not None:
        return rate, source

    if base_currency == "GBP":
        usd_to_quote, _ = _stored_rate(db, "USD", quote_currency)
        usd_to_gbp, _ = _stored_rate(db, "USD", "GBP")
        if usd_to_quote is not None and usd_to_gbp and usd_to_gbp > 0:
            return usd_to_quote / usd_to_gbp, "derived"

    return None, None


def get_rate(db: Session, base_currency: str, quote_currency: str) -> Optional[Decimal]:
    """Latest rate: 1 base = X quote. Manual entries take precedence over API."""
    return resolve_rate(db, base_currency, quote_currency)[0]


def fetch_api_rates(db: Session) -> dict[str, int]:
    """
    Pull today's rates from the FX API for both base currencies, covering every
    currency in the catalog or referenced by the countries table. Manual entries
    are untouched.
    """
    quote_codes = {c.currency_code for c in db.exec(select(Country)).all()}
    quote_codes.update(c.code for c in db.exec(select(Currency).where(Currency.is_active)).all())
    quote_codes.update(BASE_CURRENCIES)
    return store_api_rates_for_codes(db, quote_codes)
