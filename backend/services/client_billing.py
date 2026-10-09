"""
Client billing for one working month, in USD.

    billed hours  = Hours Log rows on the client's desktops (switch on)
                    or the hours an admin typed (switch off)
    rate          = the client's tier hourly rate, else billing_rate_usd
    expected      = billed hours × rate
    basis         = actual received when entered, else expected
    client share  = basis × client % − costs charged to the client
    GS share      = basis − client share

Worker cost on the client's desktops and the GS margin (GS share − worker
cost − the costs GS pays out) are shown for information only; they do not
change the split.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client, ClientPeriodEarning, ClientRevenueAgreement
from models.client_payout import ClientPayout
from models.enums import ClientContractStatusEnum, PayrollPeriodStatusEnum
from models.hours_log import HoursLogEntry
from models.payment_tier import PaymentTier, hourly_equivalent
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.rdp_machine import RDPResource
from models.worker import Worker

BILLING_CURRENCY = "USD"
ZERO = Decimal("0")
TWO_DP = Decimal("0.01")
# Received differs from expected by more than this share → warn.
VARIANCE_WARN = Decimal("0.05")
CLIENT_TIER_SCOPES = ("clients", "both")


def _q(value: Decimal) -> Decimal:
    return Decimal(value).quantize(TWO_DP, rounding=ROUND_HALF_UP)


class BillingError(ValueError):
    pass


@dataclass
class ClientMonth:
    client_id: UUID
    client_name: str
    platform: str
    contract_status: str
    hours_from_desktops: bool
    desktop_count: int
    desktop_hours: Decimal
    billed_hours: Optional[Decimal]
    billed_hours_manual: Optional[Decimal]
    hours_source: Optional[str]          # desktops | typed | None
    rate: Optional[Decimal]
    rate_source: Optional[str]           # tier | client | None
    tier_name: Optional[str]
    expected: Optional[Decimal]
    actual: Optional[Decimal]
    received_on: Optional[date]
    variance: Optional[Decimal]
    basis: Decimal
    basis_source: Optional[str]          # actual | expected | None
    client_pct: Decimal
    gs_pct: Decimal
    shared_costs: Decimal
    one_off_costs: Decimal
    client_costs: Decimal
    client_share: Decimal
    gs_share: Decimal
    worker_cost: Decimal
    gs_margin: Decimal
    payout_currency: str
    payout_status: Optional[str]
    notes: Optional[str]
    locked: bool
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        out = asdict(self)
        for key, value in out.items():
            if isinstance(value, Decimal):
                out[key] = str(value)
            elif isinstance(value, UUID):
                out[key] = str(value)
            elif isinstance(value, date):
                out[key] = value.isoformat()
        return out


# ── Lookups ───────────────────────────────────────────────────────────────────

def revenue_split(db: Session, client: Client, period: PayrollPeriod) -> tuple[Decimal, Decimal]:
    """(GS %, client %) from the agreement live at the end of the month; 100/0 without one."""
    agreement = db.exec(
        select(ClientRevenueAgreement)
        .where(
            ClientRevenueAgreement.client_id == client.id,
            ClientRevenueAgreement.effective_from <= period.end_date,
        )
        .order_by(ClientRevenueAgreement.effective_from.desc())
    ).first()
    if agreement and (agreement.effective_to is None or agreement.effective_to >= period.start_date):
        return Decimal(agreement.gs_pct), Decimal(agreement.owner_pct)
    return Decimal("100.00"), Decimal("0.00")


def _to_usd(db: Session, amount: Decimal, currency: str) -> Optional[Decimal]:
    from services.fx import ensure_rate

    currency = (currency or BILLING_CURRENCY).upper()
    if currency == BILLING_CURRENCY:
        return amount
    rate = ensure_rate(db, currency, BILLING_CURRENCY)
    return amount * rate if rate else None


def client_rate(
    db: Session, client: Client, tiers: Optional[dict[UUID, PaymentTier]] = None,
) -> tuple[Optional[Decimal], Optional[str], Optional[str]]:
    """(USD hourly rate, source, tier name). A client tier wins over the typed rate."""
    tier = None
    if client.payment_tier_id:
        tier = (tiers or {}).get(client.payment_tier_id) or db.get(PaymentTier, client.payment_tier_id)
    if tier is not None and tier.is_active and tier.applies_to in CLIENT_TIER_SCOPES:
        hourly = hourly_equivalent(Decimal(tier.rate), tier.unit)
        usd = _to_usd(db, hourly, tier.currency)
        if usd is not None:
            return _q(usd), "tier", tier.name
    if client.billing_rate_usd is not None:
        return _q(Decimal(client.billing_rate_usd)), "client", tier.name if tier else None
    return None, None, tier.name if tier else None


def _desktops_by_client(db: Session) -> dict[UUID, list[RDPResource]]:
    out: dict[UUID, list[RDPResource]] = {}
    for desk in db.exec(select(RDPResource).where(RDPResource.client_id.is_not(None))).all():
        out.setdefault(desk.client_id, []).append(desk)
    return out


def _worker_base_rates(db: Session, period: PayrollPeriod, worker_ids: Iterable[UUID]) -> dict[UUID, Decimal]:
    """Each worker's hourly pay in the period's base currency (payslip rate first)."""
    from services.payroll_engine import pay_terms

    ids = list(set(worker_ids))
    if not ids:
        return {}
    rates: dict[UUID, Decimal] = {}
    for s in db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id == period.id,
            PayrollWorkerSummary.worker_id.in_(ids),
        )
    ).all():
        if s.rate_per_hour is not None and s.fx_rate and s.fx_rate > 0:
            rates[s.worker_id] = Decimal(s.rate_per_hour) / Decimal(s.fx_rate)
    missing = [wid for wid in ids if wid not in rates]
    if missing:
        for worker in db.exec(select(Worker).where(Worker.id.in_(missing))).all():
            terms = pay_terms(db, worker, period)
            if terms.rate_base is not None:
                rates[worker.id] = terms.rate_base
    return rates


def _shared_costs_usd(db: Session, period: PayrollPeriod) -> dict[UUID, Decimal]:
    from services.cost_ledger import client_shared_costs

    out: dict[UUID, Decimal] = {}
    for client_id, amount in client_shared_costs(db, period.id).items():
        usd = _to_usd(db, Decimal(amount), period.currency)
        out[client_id] = _q(usd if usd is not None else Decimal(amount))
    return out


# ── The month ─────────────────────────────────────────────────────────────────

def build(db: Session, period: PayrollPeriod, client_ids: Optional[Iterable[UUID]] = None) -> list[ClientMonth]:
    wanted = set(client_ids) if client_ids is not None else None
    clients = {c.id: c for c in db.exec(select(Client)).all()}
    earnings = {
        e.client_id: e
        for e in db.exec(
            select(ClientPeriodEarning).where(ClientPeriodEarning.payroll_period_id == period.id)
        ).all()
    }
    payouts = {
        p.client_id: p
        for p in db.exec(select(ClientPayout).where(ClientPayout.payroll_period_id == period.id)).all()
    }
    tiers = {t.id: t for t in db.exec(select(PaymentTier)).all()}
    desks = _desktops_by_client(db)
    shared = _shared_costs_usd(db, period)

    desk_owner = {d.id: cid for cid, ds in desks.items() for d in ds}
    log_rows = db.exec(
        select(HoursLogEntry).where(
            HoursLogEntry.payroll_period_id == period.id,
            HoursLogEntry.rdp_resource_id.is_not(None),
        )
    ).all()
    desk_hours: dict[UUID, Decimal] = {}
    worker_hours: dict[UUID, dict[UUID, Decimal]] = {}
    for row in log_rows:
        cid = desk_owner.get(row.rdp_resource_id)
        if cid is None:
            continue
        desk_hours[cid] = desk_hours.get(cid, ZERO) + Decimal(row.hours)
        per = worker_hours.setdefault(cid, {})
        per[row.worker_id] = per.get(row.worker_id, ZERO) + Decimal(row.hours)
    base_rates = _worker_base_rates(db, period, {w for per in worker_hours.values() for w in per})
    base_to_usd = _to_usd(db, Decimal("1"), period.currency) or Decimal("1")

    period_paid = period.status == PayrollPeriodStatusEnum.paid
    out: list[ClientMonth] = []
    for cid, client in clients.items():
        if wanted is not None and cid not in wanted:
            continue
        row = earnings.get(cid)
        active = client.contract_status == ClientContractStatusEnum.active
        if wanted is None and not (active or row or desk_hours.get(cid) or shared.get(cid)):
            continue

        worker_cost = ZERO
        for wid, hours in worker_hours.get(cid, {}).items():
            worker_cost += hours * base_rates.get(wid, ZERO) * base_to_usd
        gs_pct, client_pct = revenue_split(db, client, period)
        out.append(compute_month(
            client=client,
            row=row,
            payout=payouts.get(cid),
            desktop_count=len(desks.get(cid, [])),
            desktop_hours=desk_hours.get(cid, ZERO),
            rate=client_rate(db, client, tiers),
            client_pct=client_pct,
            gs_pct=gs_pct,
            shared_cost=shared.get(cid, ZERO),
            worker_cost=worker_cost,
            period_paid=period_paid,
        ))
    out.sort(key=lambda m: m.client_name.lower())
    return out


def compute_month(
    *,
    client: Client,
    row: Optional[ClientPeriodEarning],
    payout: Optional[ClientPayout],
    desktop_count: int,
    desktop_hours: Decimal,
    rate: tuple[Optional[Decimal], Optional[str], Optional[str]],
    client_pct: Decimal,
    gs_pct: Decimal,
    shared_cost: Decimal,
    worker_cost: Decimal,
    period_paid: bool,
) -> ClientMonth:
    """One client's month from its inputs. No database access."""
    warnings: list[str] = []
    hours_on_desks = _q(desktop_hours)
    manual_hours = Decimal(row.billed_hours_manual) if row and row.billed_hours_manual is not None else None
    if client.hours_from_desktops:
        billed: Optional[Decimal] = hours_on_desks
        hours_source: Optional[str] = "desktops"
        if not desktop_count:
            warnings.append("Desktop hours is on but no desktop is linked to this client.")
        elif hours_on_desks == 0:
            warnings.append("Desktop hours is on but the linked desktops have no hours this month.")
    elif manual_hours is not None:
        billed, hours_source = _q(manual_hours), "typed"
    else:
        billed, hours_source = None, None

    rate_usd, rate_source, tier_name = rate
    if rate_usd is None and billed:
        warnings.append("No billing rate: set a rate or a client tier.")
    expected = _q(billed * rate_usd) if billed is not None and rate_usd is not None else None

    actual = Decimal(row.amount) if row and row.amount is not None else None
    variance = _q(actual - expected) if actual is not None and expected is not None else None
    if variance is not None and expected and abs(variance) > expected * VARIANCE_WARN:
        warnings.append(f"Received differs from expected by {variance} USD.")

    if actual is not None:
        basis, basis_source = _q(actual), "actual"
    elif expected is not None:
        basis, basis_source = expected, "expected"
    else:
        basis, basis_source = ZERO, None

    shared_cost = _q(shared_cost)
    one_off = _q(Decimal(row.client_costs)) if row and row.client_costs else ZERO
    costs = _q(shared_cost + one_off)
    client_share = _q(basis * client_pct / 100 - costs)
    gs_share = _q(basis - client_share)
    if client_share < 0:
        warnings.append("Costs are more than the client's share: the client owes GS this month.")
    elif client_share > 0 and not (client.payout_currency and (client.payout_email or client.payout_details)):
        warnings.append("No payout currency or payout details: add them on the client to send a statement.")

    worker_cost = _q(worker_cost)
    status = client.contract_status
    return ClientMonth(
        client_id=client.id,
        client_name=client.name,
        platform=client.platform,
        contract_status=status.value if hasattr(status, "value") else str(status),
        hours_from_desktops=bool(client.hours_from_desktops),
        desktop_count=desktop_count,
        desktop_hours=hours_on_desks,
        billed_hours=billed,
        billed_hours_manual=_q(manual_hours) if manual_hours is not None else None,
        hours_source=hours_source,
        rate=rate_usd,
        rate_source=rate_source,
        tier_name=tier_name,
        expected=expected,
        actual=_q(actual) if actual is not None else None,
        received_on=row.received_on if row else None,
        variance=variance,
        basis=basis,
        basis_source=basis_source,
        client_pct=client_pct,
        gs_pct=gs_pct,
        shared_costs=shared_cost,
        one_off_costs=one_off,
        client_costs=costs,
        client_share=client_share,
        gs_share=gs_share,
        worker_cost=worker_cost,
        gs_margin=_q(gs_share - worker_cost - costs),
        payout_currency=(client.payout_currency or BILLING_CURRENCY).upper(),
        payout_status=payout.status if payout else None,
        notes=row.notes if row else None,
        locked=period_paid or (payout is not None and payout.status == "paid"),
        warnings=warnings,
    )


def totals(months: Iterable[ClientMonth]) -> dict:
    keys = ("expected", "actual", "basis", "client_costs", "client_share", "gs_share", "worker_cost", "gs_margin")
    sums = {k: ZERO for k in keys}
    hours = ZERO
    for m in months:
        hours += m.billed_hours or ZERO
        for k in keys:
            sums[k] += getattr(m, k) or ZERO
    return {"billed_hours": str(_q(hours)), **{k: str(_q(v)) for k, v in sums.items()}}


def snapshot(db: Session, period: PayrollPeriod, months: Iterable[ClientMonth]) -> None:
    """Write the worked-out figures onto each client's month row. Caller commits."""
    rows = {
        e.client_id: e
        for e in db.exec(
            select(ClientPeriodEarning).where(ClientPeriodEarning.payroll_period_id == period.id)
        ).all()
    }
    now = datetime.now(timezone.utc)
    for m in months:
        row = rows.get(m.client_id)
        if row is None:
            if m.basis == 0 and m.client_costs == 0:
                continue
            row = ClientPeriodEarning(client_id=m.client_id, payroll_period_id=period.id)
        row.billed_hours = m.billed_hours
        row.rate_used = m.rate
        row.expected_amount = m.expected
        row.client_pct_used = m.client_pct
        row.client_share = m.client_share
        row.gs_share = m.gs_share
        row.updated_at = now
        db.add(row)


# ── Edits ─────────────────────────────────────────────────────────────────────

_UNSET = object()


def _require_open(db: Session, period: PayrollPeriod, client_id: UUID) -> None:
    if period.status == PayrollPeriodStatusEnum.paid:
        raise BillingError("This month is already paid.")
    payout = db.exec(
        select(ClientPayout).where(
            ClientPayout.client_id == client_id, ClientPayout.payroll_period_id == period.id,
        )
    ).first()
    if payout and payout.status == "paid":
        raise BillingError("This client has already been paid for this month.")


def set_client_pct(db: Session, client: Client, period: PayrollPeriod, client_pct: Decimal) -> None:
    """Client % from this month on: edit the agreement starting this month, or add one."""
    if client_pct < 0 or client_pct > 100:
        raise BillingError("Client % must be between 0 and 100.")
    client_pct = _q(client_pct)
    _, current = revenue_split(db, client, period)
    if current == client_pct:
        return
    agreement = db.exec(
        select(ClientRevenueAgreement).where(
            ClientRevenueAgreement.client_id == client.id,
            ClientRevenueAgreement.effective_from == period.start_date,
        )
    ).first()
    if agreement is None:
        agreement = ClientRevenueAgreement(client_id=client.id, effective_from=period.start_date)
    agreement.owner_pct = client_pct
    agreement.gs_pct = _q(Decimal("100") - client_pct)
    db.add(agreement)
    db.flush()


def update_month(
    db: Session,
    period: PayrollPeriod,
    client: Client,
    *,
    actual=_UNSET,
    received_on=_UNSET,
    billed_hours_manual=_UNSET,
    client_costs=_UNSET,
    notes=_UNSET,
    hours_from_desktops=_UNSET,
    client_pct=_UNSET,
    rate=_UNSET,
) -> None:
    """Apply ledger edits for one client. Unpassed fields are left alone. Caller commits."""
    _require_open(db, period, client.id)
    for name, value in (("actual", actual), ("billed_hours_manual", billed_hours_manual),
                        ("client_costs", client_costs), ("rate", rate)):
        if value is not _UNSET and value is not None and Decimal(value) < 0:
            raise BillingError(f"{name.replace('_', ' ').capitalize()} cannot be negative.")

    row = db.exec(
        select(ClientPeriodEarning).where(
            ClientPeriodEarning.client_id == client.id,
            ClientPeriodEarning.payroll_period_id == period.id,
        )
    ).first()
    if row is None:
        row = ClientPeriodEarning(client_id=client.id, payroll_period_id=period.id)
    if actual is not _UNSET:
        row.amount = _q(Decimal(actual)) if actual is not None else None
    if received_on is not _UNSET:
        row.received_on = received_on
    if billed_hours_manual is not _UNSET:
        row.billed_hours_manual = _q(Decimal(billed_hours_manual)) if billed_hours_manual is not None else None
    if client_costs is not _UNSET:
        row.client_costs = _q(Decimal(client_costs or 0))
    if notes is not _UNSET:
        row.notes = (notes or "").strip() or None
    row.updated_at = datetime.now(timezone.utc)
    db.add(row)

    if hours_from_desktops is not _UNSET and hours_from_desktops is not None:
        client.hours_from_desktops = bool(hours_from_desktops)
    if rate is not _UNSET:
        client.billing_rate_usd = _q(Decimal(rate)) if rate is not None else None
    db.add(client)
    if client_pct is not _UNSET and client_pct is not None:
        set_client_pct(db, client, period, Decimal(client_pct))
    db.flush()
