"""
Income received in a working month (the total income pool).

Each entry is converted to USD when it is entered and stays frozen. Entries
linked to a client are that client's revenue on the ledger; the ledger's
Received pencil edits the client's single entry.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional
from uuid import UUID

from sqlmodel import Session, select

from models.enums import PayrollPeriodStatusEnum
from models.income import INCOME_CATEGORIES, IncomeEntry
from models.payroll import PayrollPeriod

USD = "USD"
ZERO = Decimal("0")
CATEGORY_LABELS = {
    "client_payout": "Client account payout",
    "gs_account": "GS account",
    "other": "Other income",
}


class IncomeError(ValueError):
    pass


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _require_open(period: PayrollPeriod) -> None:
    if period.status == PayrollPeriodStatusEnum.paid:
        raise IncomeError("This month is already paid: its income can't change.")


def usd_rate(db: Session, currency: str) -> Optional[Decimal]:
    """Units of `currency` per 1 USD, from today's rates."""
    from services.fx import ensure_rate

    currency = (currency or USD).upper()
    if currency == USD:
        return Decimal("1")
    return ensure_rate(db, USD, currency)


def validate(
    *, category: str, amount: Decimal, currency: str, description: Optional[str], fx_rate: Optional[Decimal],
) -> None:
    if category not in INCOME_CATEGORIES:
        raise IncomeError("Pick a category: client account payout, GS account or other income.")
    if amount is None or Decimal(amount) < 0:
        raise IncomeError("Amount can't be negative.")
    if category == "other" and not (description or "").strip():
        raise IncomeError("Describe where other income came from.")
    if len((currency or "").strip()) != 3:
        raise IncomeError("Currency must be a 3-letter code.")
    if fx_rate is not None and Decimal(fx_rate) <= 0:
        raise IncomeError("Exchange rate must be more than 0.")


def _freeze(db: Session, entry: IncomeEntry, fx_rate: Optional[Decimal]) -> None:
    rate = Decimal(fx_rate) if fx_rate is not None else usd_rate(db, entry.currency)
    if rate is None or rate <= 0:
        raise IncomeError(f"No exchange rate for {entry.currency}: type the rate (units per 1 USD).")
    entry.fx_rate = rate
    entry.amount_usd = _q(Decimal(entry.amount) / rate)


def create(
    db: Session, period: PayrollPeriod, *, category: str, amount: Decimal, currency: str = USD,
    description: Optional[str] = None, client_id: Optional[UUID] = None, received_on: Optional[date] = None,
    fx_rate: Optional[Decimal] = None, actor_id: Optional[UUID] = None,
) -> IncomeEntry:
    """Add an entry, frozen in USD. Caller commits."""
    _require_open(period)
    currency = (currency or USD).strip().upper()
    validate(category=category, amount=amount, currency=currency, description=description, fx_rate=fx_rate)
    entry = IncomeEntry(
        payroll_period_id=period.id, category=category, amount=_q(Decimal(amount)), currency=currency,
        description=(description or "").strip() or None, client_id=client_id, received_on=received_on,
        created_by=actor_id, amount_usd=ZERO,
    )
    _freeze(db, entry, fx_rate)
    db.add(entry)
    db.flush()
    return entry


def update(db: Session, period: PayrollPeriod, entry: IncomeEntry, fields: dict) -> IncomeEntry:
    """Change an entry. A new amount, currency or rate re-freezes the USD figure. Caller commits."""
    _require_open(period)
    for key in ("category", "description", "client_id", "received_on"):
        if key in fields:
            value = fields[key]
            setattr(entry, key, ((value or "").strip() or None) if key == "description" else value)
    if "amount" in fields:
        entry.amount = _q(Decimal(fields["amount"]))
    new_currency = (fields.get("currency") or "").strip().upper()
    currency_changed = bool(new_currency) and new_currency != entry.currency
    if currency_changed:
        entry.currency = new_currency
    validate(category=entry.category, amount=entry.amount, currency=entry.currency,
             description=entry.description, fx_rate=fields.get("fx_rate"))
    if fields.get("fx_rate") is not None:
        _freeze(db, entry, Decimal(fields["fx_rate"]))
    elif currency_changed:
        _freeze(db, entry, None)
    elif "amount" in fields:
        _freeze(db, entry, Decimal(entry.fx_rate))
    entry.updated_at = datetime.now(timezone.utc)
    db.add(entry)
    db.flush()
    return entry


def delete(db: Session, period: PayrollPeriod, entry: IncomeEntry) -> None:
    _require_open(period)
    db.delete(entry)
    db.flush()


def entries_for(db: Session, period_id: UUID) -> list[IncomeEntry]:
    return list(db.exec(
        select(IncomeEntry)
        .where(IncomeEntry.payroll_period_id == period_id)
        .order_by(IncomeEntry.received_on.desc().nulls_last(), IncomeEntry.created_at.desc())
    ).all())


def client_income(db: Session, period_id: UUID) -> dict[UUID, tuple[Decimal, int, Optional[date]]]:
    """{client: (USD total, number of entries, latest received date)} for client-linked entries."""
    out: dict[UUID, tuple[Decimal, int, Optional[date]]] = {}
    for e in entries_for(db, period_id):
        if e.client_id is None:
            continue
        total, count, latest = out.get(e.client_id, (ZERO, 0, None))
        if e.received_on and (latest is None or e.received_on > latest):
            latest = e.received_on
        out[e.client_id] = (total + Decimal(e.amount_usd), count + 1, latest)
    return out


def totals(entries: Iterable[IncomeEntry]) -> dict:
    by_category = {c: ZERO for c in INCOME_CATEGORIES}
    for e in entries:
        by_category[e.category] = by_category.get(e.category, ZERO) + Decimal(e.amount_usd)
    return {
        "total_usd": str(_q(sum(by_category.values(), ZERO))),
        "by_category": {c: str(_q(v)) for c, v in by_category.items()},
    }


def set_client_received(
    db: Session, period: PayrollPeriod, client_id: UUID, *, amount=..., received_on=...,
    actor_id: Optional[UUID] = None,
) -> None:
    """The ledger's Received cell: edit the client's one entry (USD), add it, or clear it. Caller commits."""
    _require_open(period)
    existing = [e for e in entries_for(db, period.id) if e.client_id == client_id]
    if len(existing) > 1:
        raise IncomeError("This client has several income entries this month: edit them on the Income tab.")
    entry = existing[0] if existing else None
    if amount is not ...:
        if amount is None:
            if entry is not None:
                db.delete(entry)
                db.flush()
            return
        if entry is None:
            create(db, period, category="client_payout", amount=Decimal(amount), currency=USD,
                   client_id=client_id, received_on=None if received_on is ... else received_on,
                   actor_id=actor_id)
            return
        fields: dict = {"amount": Decimal(amount)}
        if entry.currency != USD:
            fields.update(currency=USD, fx_rate=Decimal("1"))
        if received_on is not ...:
            fields["received_on"] = received_on
        update(db, period, entry, fields)
        return
    if received_on is not ... and entry is not None:
        update(db, period, entry, {"received_on": received_on})


def to_dict(e: IncomeEntry, client_names: Optional[dict[UUID, str]] = None) -> dict:
    return {
        "id": str(e.id),
        "category": e.category,
        "category_label": CATEGORY_LABELS.get(e.category, e.category),
        "amount": str(e.amount),
        "currency": e.currency,
        "fx_rate": str(e.fx_rate),
        "amount_usd": str(e.amount_usd),
        "description": e.description,
        "client_id": str(e.client_id) if e.client_id else None,
        "client_name": (client_names or {}).get(e.client_id) if e.client_id else None,
        "received_on": e.received_on.isoformat() if e.received_on else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }
