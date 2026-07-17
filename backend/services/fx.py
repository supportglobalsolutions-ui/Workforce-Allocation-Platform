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
from models.currency import Country, FxRate

logger = logging.getLogger(__name__)

BASE_CURRENCIES = ("USD", "GBP")


def currency_for_country(db: Session, country_name: str) -> str:
    country = db.exec(select(Country).where(Country.name == country_name)).first()
    return country.currency_code if country else "USD"


def get_rate(db: Session, base_currency: str, quote_currency: str) -> Optional[Decimal]:
    """Latest rate: 1 base = X quote. Manual entries take precedence over API."""
    if base_currency == quote_currency:
        return Decimal("1")
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
            return row.rate
    return None


def fetch_api_rates(db: Session) -> dict[str, int]:
    """
    Pull today's rates from the FX API for both base currencies, covering every
    currency referenced by the countries table. Manual entries are untouched.
    """
    quote_codes = {c.currency_code for c in db.exec(select(Country)).all()}
    quote_codes.update(BASE_CURRENCIES)
    today = date.today()
    stored = {"USD": 0, "GBP": 0}

    for base in BASE_CURRENCIES:
        try:
            resp = httpx.get(f"{settings.FX_API_URL}/{base}", timeout=20.0)
            resp.raise_for_status()
            rates = resp.json().get("rates", {})
        except Exception as exc:
            logger.warning("FX fetch for %s failed: %s", base, exc)
            continue

        for code in quote_codes:
            if code == base or code not in rates:
                continue
            existing = db.exec(
                select(FxRate).where(
                    FxRate.base_currency == base,
                    FxRate.quote_currency == code,
                    FxRate.as_of_date == today,
                    FxRate.source == "api",
                )
            ).first()
            rate_value = Decimal(str(rates[code]))
            if existing:
                existing.rate = rate_value
                db.add(existing)
            else:
                db.add(FxRate(
                    base_currency=base,
                    quote_currency=code,
                    rate=rate_value,
                    source="api",
                    as_of_date=today,
                ))
            stored[base] += 1

    db.commit()
    return stored
