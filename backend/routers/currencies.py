from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.currency import Country, Currency, FxRate
from schemas.currency import (
    CountryCreate,
    CountryResponse,
    CountryUpdate,
    CurrencyCreate,
    CurrencyResponse,
    CurrencyUpdate,
    FxRateCreate,
    FxRateResponse,
)
from services.fx import BASE_CURRENCIES, fetch_api_rates, resolve_rate
from .deps import apply_update

router = APIRouter()


# ── Currency catalog ───────────────────────────────────────────────────────────

def _upsert_manual_usd_rate(db: Session, code: str, rate: Decimal) -> None:
    """Store today's `1 USD = rate CODE` as a manual row, replacing any earlier one."""
    if rate is None or rate <= 0:
        raise HTTPException(status_code=400, detail="Exchange rate must be positive.")
    today = date.today()
    existing = db.exec(
        select(FxRate).where(
            FxRate.base_currency == "USD",
            FxRate.quote_currency == code,
            FxRate.as_of_date == today,
            FxRate.source == "manual",
        )
    ).first()
    if existing:
        existing.rate = rate
        db.add(existing)
    else:
        db.add(FxRate(
            base_currency="USD",
            quote_currency=code,
            rate=rate,
            source="manual",
            as_of_date=today,
        ))


def _currency_response(db: Session, currency: Currency) -> CurrencyResponse:
    usd_rate, usd_source = resolve_rate(db, "USD", currency.code)
    gbp_rate, _ = resolve_rate(db, "GBP", currency.code)
    resp = CurrencyResponse.model_validate(currency)
    resp.usd_rate = usd_rate
    resp.usd_rate_source = usd_source
    resp.gbp_rate = gbp_rate
    return resp


@router.get("/list", response_model=list[CurrencyResponse])
def list_currencies(
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    """Payout currency catalog with the effective USD and GBP rates for each."""
    stmt = select(Currency)
    if active_only:
        stmt = stmt.where(Currency.is_active)
    rows = db.exec(stmt.order_by(Currency.code)).all()
    return [_currency_response(db, c) for c in rows]


@router.post("/list", response_model=CurrencyResponse, status_code=status.HTTP_201_CREATED)
def create_currency(
    body: CurrencyCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    code = body.code.strip().upper()[:3]
    if len(code) != 3:
        raise HTTPException(status_code=400, detail="Currency code must be 3 letters.")
    if db.exec(select(Currency).where(Currency.code == code)).first():
        raise HTTPException(status_code=400, detail=f"{code} is already in the catalog.")

    currency = Currency(
        code=code,
        name=body.name.strip(),
        symbol=(body.symbol or None),
        is_active=body.is_active,
    )
    db.add(currency)
    if body.usd_rate is not None and code != "USD":
        _upsert_manual_usd_rate(db, code, body.usd_rate)
    db.commit()
    db.refresh(currency)
    return _currency_response(db, currency)


@router.patch("/list/{currency_id}", response_model=CurrencyResponse)
def update_currency(
    currency_id: UUID,
    body: CurrencyUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Rename, deactivate, or repoint the `1 USD =` rate for one currency."""
    currency = db.get(Currency, currency_id)
    if not currency:
        raise HTTPException(status_code=404, detail="Currency not found")

    usd_rate = body.usd_rate
    for field, value in body.model_dump(exclude_unset=True, exclude={"usd_rate"}).items():
        setattr(currency, field, value)
    db.add(currency)
    if usd_rate is not None:
        if currency.code == "USD":
            raise HTTPException(status_code=400, detail="USD is the base currency; its rate is always 1.")
        _upsert_manual_usd_rate(db, currency.code, usd_rate)
    db.commit()
    db.refresh(currency)
    return _currency_response(db, currency)


# ── Countries ──────────────────────────────────────────────────────────────────

@router.get("/countries", response_model=list[CountryResponse])
def list_countries(
    db: Session = Depends(get_db),
    _: dict = Depends(require_user),
):
    return db.exec(select(Country).order_by(Country.name)).all()


@router.post("/countries", response_model=CountryResponse, status_code=status.HTTP_201_CREATED)
def create_country(
    body: CountryCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    existing = db.exec(select(Country).where(Country.name == body.name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Country already exists.")
    country = Country(**body.model_dump())
    country.currency_code = country.currency_code.upper()[:3]
    db.add(country)
    db.commit()
    db.refresh(country)
    return country


@router.patch("/countries/{country_id}", response_model=CountryResponse)
def update_country(
    country_id: UUID,
    body: CountryUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    country = db.get(Country, country_id)
    if not country:
        raise HTTPException(status_code=404, detail="Country not found")
    apply_update(country, body)
    country.currency_code = country.currency_code.upper()[:3]
    db.add(country)
    db.commit()
    db.refresh(country)
    return country


# ── FX rates ───────────────────────────────────────────────────────────────────

@router.get("/rates", response_model=list[FxRateResponse])
def list_rates(
    base: str | None = None,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    stmt = select(FxRate)
    if base:
        stmt = stmt.where(FxRate.base_currency == base.upper())
    return db.exec(stmt.order_by(FxRate.as_of_date.desc(), FxRate.quote_currency).limit(300)).all()


@router.post("/rates", response_model=FxRateResponse, status_code=status.HTTP_201_CREATED)
def create_manual_rate(
    body: FxRateCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    base = body.base_currency.upper()
    if base not in BASE_CURRENCIES:
        raise HTTPException(status_code=400, detail="Base currency must be USD or GBP.")
    if body.rate <= 0:
        raise HTTPException(status_code=400, detail="Rate must be positive.")

    existing = db.exec(
        select(FxRate).where(
            FxRate.base_currency == base,
            FxRate.quote_currency == body.quote_currency.upper(),
            FxRate.as_of_date == body.as_of_date,
            FxRate.source == "manual",
        )
    ).first()
    if existing:
        existing.rate = body.rate
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    rate = FxRate(
        base_currency=base,
        quote_currency=body.quote_currency.upper(),
        rate=body.rate,
        source="manual",
        as_of_date=body.as_of_date,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return rate


@router.post("/rates/refresh")
def refresh_rates_from_api(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Fetch today's rates from the FX API for USD and GBP bases."""
    stored = fetch_api_rates(db)
    return {"stored": stored}
