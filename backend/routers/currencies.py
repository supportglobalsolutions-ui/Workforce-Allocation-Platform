from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from core.database import get_db
from core.permissions import require_admin, require_user
from models.currency import Country, FxRate
from schemas.currency import (
    CountryCreate,
    CountryResponse,
    CountryUpdate,
    FxRateCreate,
    FxRateResponse,
)
from services.fx import BASE_CURRENCIES, fetch_api_rates
from .deps import apply_update

router = APIRouter()


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
