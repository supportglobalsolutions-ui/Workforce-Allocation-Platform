"""
Client billing for one working month, in USD.

    billed hours  = hours on sessions linked to the client (switch on)
                    or the hours an admin typed (switch off)
    rate          = the client's tier hourly rate, else billing_rate_usd
    expected      = billed hours × rate
    revenue       = actual received when entered, else expected

    net distributable = revenue − worker cost − transfer cost − other costs
    recipient amount  = net distributable × recipient %   (or a typed amount)

Sessions do not inherit a client from the RDP — an admin links each session.
The Hours Log still drives worker payslips (by desktop); client income uses
session.client_id only.

Recipients are payees. The payee flagged as Global Solutions keeps its amount;
every other payee is paid out. A month with no recipients of its own carries
the latest earlier month's; with none at all the client's revenue agreement is
used (owner, third party, GS), else GS takes 100%.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional
from uuid import UUID

from sqlmodel import Session, select

from models.client import Client, ClientPeriodEarning, ClientRevenueAgreement, ClientSplitRecipient, Payee
from models.client_payout import ClientPayout
from models.enums import ClientContractStatusEnum, PayrollPeriodStatusEnum, PayrollSessionEnum
from models.payment_tier import PaymentTier, hourly_equivalent
from models.payroll import PayrollPeriod, PayrollWorkerSummary
from models.rdp_machine import RDPResource
from models.session import Session as WorkSession
from models.worker import Worker

BILLING_CURRENCY = "USD"
ZERO = Decimal("0")
TWO_DP = Decimal("0.01")
# Received differs from expected by more than this share → warn.
VARIANCE_WARN = Decimal("0.05")
CLIENT_TIER_SCOPES = ("clients", "both")
GS_PAYEE_NAME = "Global Solutions"
GS_ALIASES = frozenset({"gs", "global solutions", "globalsolutions", "global solution"})


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
    shared_costs: Decimal
    one_off_costs: Decimal
    client_costs: Decimal                    # other costs: shared + one-off
    worker_cost: Decimal
    payout_currency: str
    payout_status: Optional[str]
    notes: Optional[str]
    locked: bool
    warnings: list[str] = field(default_factory=list)
    # Sessions worked for the client so far this month and what those workers earned (USD).
    session_hours: Decimal = ZERO
    session_workers: int = 0
    session_earnings: Decimal = ZERO
    # Revenue: income received, else expected.
    billing: Decimal = ZERO
    billing_source: Optional[str] = None     # actual | expected | None
    income_entries: int = 0                  # Income tab entries behind `actual`
    transfer_cost: Decimal = ZERO            # workers' payslip transfer costs, by hours on this client
    split_total_costs: Decimal = ZERO        # worker cost + transfer cost + other costs
    net_distributable: Decimal = ZERO        # revenue − split_total_costs
    # [{slot, payee_id, name, is_gs, pct, amount_calc, amount_override, amount, payout_ready}]
    recipients: list[dict] = field(default_factory=list)
    recipients_from: Optional[str] = None    # earlier month they were carried from, or "agreement" / "default"
    split_check: str = "Check split"         # "OK" when the % add up to 100 and the amounts to the net
    gs_amount: Decimal = ZERO                # kept by Global Solutions
    payout_amount: Decimal = ZERO            # owed to the other payees

    def to_dict(self) -> dict:
        out = asdict(self)
        for key, value in out.items():
            if isinstance(value, Decimal):
                out[key] = str(value)
            elif isinstance(value, UUID):
                out[key] = str(value)
            elif isinstance(value, date):
                out[key] = value.isoformat()
        out["recipients"] = [
            {k: str(v) if isinstance(v, (Decimal, UUID)) else v for k, v in r.items()} for r in self.recipients
        ]
        return out


# ── Lookups ───────────────────────────────────────────────────────────────────

def _agreement(db: Session, client: Client, period: PayrollPeriod) -> Optional[ClientRevenueAgreement]:
    """The agreement live at the end of the month, if any."""
    agreement = db.exec(
        select(ClientRevenueAgreement)
        .where(
            ClientRevenueAgreement.client_id == client.id,
            ClientRevenueAgreement.effective_from <= period.end_date,
        )
        .order_by(ClientRevenueAgreement.effective_from.desc())
    ).first()
    if agreement and (agreement.effective_to is None or agreement.effective_to >= period.start_date):
        return agreement
    return None


def revenue_split(db: Session, client: Client, period: PayrollPeriod) -> tuple[Decimal, Decimal]:
    """(GS %, client %) from the agreement live at the end of the month; 100/0 without one."""
    agreement = _agreement(db, client, period)
    if agreement:
        return Decimal(agreement.gs_pct), Decimal(agreement.owner_pct)
    return Decimal("100.00"), Decimal("0.00")


def is_gs_name(name: Optional[str]) -> bool:
    return (name or "").strip().casefold() in GS_ALIASES


def payout_ready(payee: Optional[Payee]) -> bool:
    return bool(payee and payee.payout_currency and (payee.payout_email or payee.payout_details))


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


def _session_hours_by_client(
    db: Session, period: PayrollPeriod,
) -> dict[UUID, dict[UUID, Decimal]]:
    """{client: {worker: paid hours}} from sessions linked to a client this month.

    Only ``session.client_id`` counts — never the desktop's client. Shared RDPs
    require an admin to link each session before it becomes client income.
    """
    from services.session_evidence import work_minutes

    start = datetime.combine(period.start_date, datetime.min.time(), tzinfo=timezone.utc)
    end = datetime.combine(period.end_date, datetime.max.time(), tzinfo=timezone.utc)
    rows = db.exec(
        select(WorkSession).where(
            WorkSession.client_id.is_not(None),
            WorkSession.start_time >= start,
            WorkSession.start_time <= end,
            WorkSession.payroll_approval_state != PayrollSessionEnum.excluded,
            WorkSession.payroll_approval_state != PayrollSessionEnum.flagged,
        )
    ).all()
    out: dict[UUID, dict[UUID, Decimal]] = {}
    for s in rows:
        if s.payroll_period_id is not None and s.payroll_period_id != period.id:
            continue
        cid = s.client_id
        minutes = work_minutes(s)
        if cid is None or minutes <= 0:
            continue
        per = out.setdefault(cid, {})
        per[s.worker_id] = per.get(s.worker_id, ZERO) + Decimal(minutes) / Decimal(60)
    return out


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

    session_hours = _session_hours_by_client(db, period)
    worker_total_hours: dict[UUID, Decimal] = {}
    for per in session_hours.values():
        for wid, hours in per.items():
            worker_total_hours[wid] = worker_total_hours.get(wid, ZERO) + hours
    base_rates = _worker_base_rates(
        db, period, {w for per in session_hours.values() for w in per},
    )
    base_to_usd = _to_usd(db, Decimal("1"), period.currency) or Decimal("1")
    transfer_usd = _transfer_costs_usd(db, period, base_to_usd)
    agreements = _agreements(db, period)
    recipients = split_recipients(db, period)
    payees = {p.id: p for p in db.exec(select(Payee)).all()}
    from services.income import client_income

    received = client_income(db, period.id)
    locks = paid_client_ids(db, period.id)
    payee_statuses = payee_payout_statuses(db, period.id)

    period_paid = period.status == PayrollPeriodStatusEnum.paid
    out: list[ClientMonth] = []
    for cid, client in clients.items():
        if wanted is not None and cid not in wanted:
            continue
        row = earnings.get(cid)
        active = client.contract_status == ClientContractStatusEnum.active
        on_client = session_hours.get(cid, {})
        linked_hours = sum(on_client.values(), ZERO)
        if wanted is None and not (
            active or row or linked_hours or shared.get(cid) or received.get(cid)
        ):
            continue

        worker_cost = ZERO
        for wid, hours in on_client.items():
            worker_cost += hours * base_rates.get(wid, ZERO) * base_to_usd
        session_earnings = worker_cost
        transfer = ZERO
        for wid, hours in on_client.items():
            total = worker_total_hours.get(wid) or ZERO
            if total > 0:
                transfer += transfer_usd.get(wid, ZERO) * hours / total
        month = compute_month(
            client=client,
            row=row,
            payout=payouts.get(cid),
            desktop_count=len(desks.get(cid, [])),
            desktop_hours=linked_hours,
            rate=client_rate(db, client, tiers),
            shared_cost=shared.get(cid, ZERO),
            worker_cost=worker_cost,
            period_paid=period_paid,
            income=received.get(cid),
        )
        if cid in payee_statuses:
            month.payout_status = payee_statuses[cid]
        if cid in locks:
            month.locked = True
        month.session_hours = _q(linked_hours)
        month.session_workers = len(on_client)
        month.session_earnings = _q(session_earnings)
        if cid in recipients:
            lines, carried_from = recipients[cid]
        else:
            lines, carried_from = default_recipients(client, agreements.get(cid), payees)
        apply_split(month, transfer, resolve_recipients(lines, payees), carried_from)
        out.append(month)
    out.sort(key=lambda m: m.client_name.lower())
    return out


def _gs_payee(payees: dict[UUID, Payee]) -> Optional[Payee]:
    return next((p for p in payees.values() if p.is_gs), None)


def _payee_named(payees: dict[UUID, Payee], name: str) -> Optional[Payee]:
    key = name.strip().casefold()
    return next((p for p in payees.values() if p.name.casefold() == key), None)


def default_recipients(
    client: Client, agreement: Optional[ClientRevenueAgreement], payees: dict[UUID, Payee],
) -> tuple[list[dict], str]:
    """Recipients for a client that has never had any: its agreement, else GS 100%."""
    gs = _gs_payee(payees)
    gs_line = {"payee_id": gs.id if gs else None, "name": gs.name if gs else GS_PAYEE_NAME}
    if agreement is None:
        return [{"slot": 1, **gs_line, "pct": Decimal("100")}], "default"
    lines: list[dict] = []
    owner = (getattr(client, "account_holder", None) or client.name).strip()
    for name, pct in (
        (owner, agreement.owner_pct),
        (agreement.third_party_name, agreement.third_party_pct),
    ):
        if name and pct and Decimal(pct) > 0:
            payee = _payee_named(payees, name)
            lines.append({"payee_id": payee.id if payee else None, "name": payee.name if payee else name,
                          "pct": Decimal(pct)})
    if agreement.gs_pct and Decimal(agreement.gs_pct) > 0:
        lines.append({**gs_line, "pct": Decimal(agreement.gs_pct)})
    return [{"slot": i, **line} for i, line in enumerate(lines, start=1)], "agreement"


def resolve_recipients(lines: list[dict], payees: dict[UUID, Payee]) -> list[dict]:
    """Attach each line's payee (name, GS flag, payout details)."""
    out = []
    for line in lines:
        payee = payees.get(line.get("payee_id")) if line.get("payee_id") else None
        name = payee.name if payee else line.get("name")
        is_gs = bool(payee.is_gs) if payee else is_gs_name(name)
        out.append({
            "slot": line["slot"],
            "payee_id": payee.id if payee else None,
            "name": name,
            "is_gs": is_gs,
            "pct": Decimal(line.get("pct") or 0),
            "amount_override": line.get("amount_override"),
            "payout_ready": is_gs or payout_ready(payee),
        })
    return out


def apply_split(
    month: ClientMonth, transfer_cost: Decimal, recipients: list[dict], carried_from: Optional[str] = None,
) -> None:
    """Revenue less all costs, shared between the recipients by % (or a typed amount)."""
    month.transfer_cost = _q(transfer_cost)
    month.split_total_costs = _q(month.worker_cost + month.transfer_cost + month.client_costs)
    month.net_distributable = _q(month.billing - month.split_total_costs)
    month.recipients = []
    for r in sorted(recipients, key=lambda r: r["slot"]):
        pct = _q(Decimal(r.get("pct") or 0))
        calc = _q(month.net_distributable * pct / 100)
        override = r.get("amount_override")
        override = _q(Decimal(override)) if override is not None else None
        month.recipients.append({
            "slot": r["slot"],
            "payee_id": r.get("payee_id"),
            "name": r.get("name"),
            "is_gs": bool(r.get("is_gs")),
            "pct": pct,
            "amount_calc": calc,
            "amount_override": override,
            "amount": override if override is not None else calc,
            "payout_ready": bool(r.get("payout_ready", True)),
        })
    month.recipients_from = carried_from
    total_pct = sum((r["pct"] for r in month.recipients), ZERO)
    total_amount = _q(sum((r["amount"] for r in month.recipients), ZERO))
    month.gs_amount = _q(sum((r["amount"] for r in month.recipients if r["is_gs"]), ZERO))
    month.payout_amount = _q(sum((r["amount"] for r in month.recipients if not r["is_gs"]), ZERO))

    pct_ok = total_pct == Decimal("100")
    amount_ok = total_amount == month.net_distributable
    month.split_check = "OK" if month.recipients and pct_ok and amount_ok else "Check split"
    if not month.recipients:
        month.warnings.append("No recipients: add who the net distributable is split between.")
    elif not pct_ok:
        month.warnings.append(f"Recipients' % add up to {total_pct}%, not 100%.")
    elif not amount_ok:
        month.warnings.append(
            f"Recipient amounts add up to {total_amount} USD, not the net distributable of "
            f"{month.net_distributable} USD.",
        )
    for r in month.recipients:
        if r["is_gs"] or r["amount"] <= 0:
            continue
        if r["payee_id"] is None:
            month.warnings.append(f"{r['name']} is not on the Recipients list: pick or add the recipient.")
        elif not r["payout_ready"]:
            month.warnings.append(f"{r['name']} has no payout currency or details: add them on the Recipients page.")
    if month.net_distributable < 0:
        month.warnings.append("Costs are more than revenue: the net distributable is negative.")


def _agreements(db: Session, period: PayrollPeriod) -> dict[UUID, ClientRevenueAgreement]:
    """Each client's agreement live at the end of the month, in one query."""
    out: dict[UUID, ClientRevenueAgreement] = {}
    for a in db.exec(
        select(ClientRevenueAgreement)
        .where(ClientRevenueAgreement.effective_from <= period.end_date)
        .order_by(ClientRevenueAgreement.effective_from.desc())
    ).all():
        if a.client_id in out:
            continue
        if a.effective_to is None or a.effective_to >= period.start_date:
            out[a.client_id] = a
        else:
            out[a.client_id] = None  # the latest one has ended: no agreement this month
    return {cid: a for cid, a in out.items() if a is not None}


def _transfer_costs_usd(db: Session, period: PayrollPeriod, base_to_usd: Decimal) -> dict[UUID, Decimal]:
    """Each worker's payslip transfer cost this month, in USD."""
    out: dict[UUID, Decimal] = {}
    for s in db.exec(
        select(PayrollWorkerSummary).where(
            PayrollWorkerSummary.payroll_period_id == period.id,
            PayrollWorkerSummary.transfer_cost > 0,
        )
    ).all():
        fx = Decimal(s.fx_rate) if s.fx_rate and s.fx_rate > 0 else None
        local = (s.local_currency or period.currency).upper()
        if fx is None and local == (period.currency or "").upper():
            fx = Decimal("1")
        if fx is None:
            continue
        out[s.worker_id] = Decimal(s.transfer_cost) / fx * base_to_usd
    return out


def split_recipients(
    db: Session, period: PayrollPeriod,
) -> dict[UUID, tuple[list[dict], Optional[str]]]:
    """{client: (recipient lines, carried-from label)}: this month's, else the latest earlier month's.

    Typed amounts belong to their own month and are not carried forward.
    """
    rows = db.exec(
        select(ClientSplitRecipient, PayrollPeriod)
        .join(PayrollPeriod, PayrollPeriod.id == ClientSplitRecipient.payroll_period_id)
        .where(PayrollPeriod.start_date <= period.start_date)
        .order_by(PayrollPeriod.start_date.desc())
    ).all()
    chosen: dict[UUID, UUID] = {}
    out: dict[UUID, tuple[list, Optional[str]]] = {}
    for r, p in rows:
        pid = chosen.setdefault(r.client_id, p.id)
        if pid != p.id:
            continue
        found, _ = out.get(r.client_id, ([], None))
        this_month = p.id == period.id
        if r.name is not None or r.payee_id is not None:
            found.append({
                "slot": r.slot, "payee_id": r.payee_id, "name": r.name, "pct": Decimal(r.pct),
                "amount_override": r.amount_override if this_month else None,
            })
        out[r.client_id] = (found, None if this_month else p.label)
    return out


def compute_month(
    *,
    client: Client,
    row: Optional[ClientPeriodEarning],
    payout: Optional[ClientPayout],
    desktop_count: int,
    desktop_hours: Decimal,
    rate: tuple[Optional[Decimal], Optional[str], Optional[str]],
    shared_cost: Decimal,
    worker_cost: Decimal,
    period_paid: bool,
    income: Optional[tuple[Decimal, int, Optional[date]]] = None,
) -> ClientMonth:
    """One client's month from its inputs. No database access."""
    warnings: list[str] = []
    hours_on_desks = _q(desktop_hours)
    manual_hours = Decimal(row.billed_hours_manual) if row and row.billed_hours_manual is not None else None
    if client.hours_from_desktops:
        billed: Optional[Decimal] = hours_on_desks
        hours_source: Optional[str] = "desktops"
        if hours_on_desks == 0:
            warnings.append(
                "Session hours is on but no sessions are linked to this client this month."
            )
    elif manual_hours is not None:
        billed, hours_source = _q(manual_hours), "typed"
    else:
        billed, hours_source = None, None

    rate_usd, rate_source, tier_name = rate
    if rate_usd is None and billed:
        warnings.append("No billing rate: set a rate or a client tier.")
    expected = _q(billed * rate_usd) if billed is not None and rate_usd is not None else None

    # Revenue received = the client's Income tab entries; none yet means expected is used.
    income_count = income[1] if income else 0
    actual: Optional[Decimal] = Decimal(income[0]) if income_count else None
    received_on = income[2] if income_count else None
    variance = _q(actual - expected) if actual is not None and expected is not None else None
    if variance is not None and expected and abs(variance) > expected * VARIANCE_WARN:
        warnings.append(f"Received differs from expected by {variance} USD.")

    if actual is not None:
        billing, billing_source = _q(actual), "actual"
    elif expected is not None:
        billing, billing_source = expected, "expected"
    else:
        billing, billing_source = ZERO, None

    shared_cost = _q(shared_cost)
    one_off = _q(Decimal(row.client_costs)) if row and row.client_costs else ZERO
    costs = _q(shared_cost + one_off)

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
        received_on=received_on,
        variance=variance,
        shared_costs=shared_cost,
        one_off_costs=one_off,
        client_costs=costs,
        worker_cost=worker_cost,
        payout_currency=(client.payout_currency or BILLING_CURRENCY).upper(),
        payout_status=getattr(payout, "status", None) if payout else None,
        notes=row.notes if row else None,
        locked=period_paid or (payout is not None and payout.status == "paid"),
        warnings=warnings,
        billing=billing,
        billing_source=billing_source,
        income_entries=income_count,
    )


def totals(months: Iterable[ClientMonth]) -> dict:
    keys = (
        "expected", "actual", "billing", "client_costs", "worker_cost", "session_hours", "session_earnings",
        "transfer_cost", "split_total_costs", "net_distributable", "gs_amount", "payout_amount",
    )
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
            if m.billing == 0 and m.client_costs == 0 and m.net_distributable == 0:
                continue
            row = ClientPeriodEarning(client_id=m.client_id, payroll_period_id=period.id)
        row.billed_hours = m.billed_hours
        row.rate_used = m.rate
        row.expected_amount = m.expected
        row.client_share = m.payout_amount
        row.gs_share = m.gs_amount
        row.updated_at = now
        db.add(row)


# ── Edits ─────────────────────────────────────────────────────────────────────

_UNSET = object()


def payee_payout_statuses(db: Session, period_id: UUID) -> dict[UUID, str]:
    """{client: draft | sent | part paid | paid} across the payee payouts that include it."""
    from models.client_payout import PayeePayout, PayeePayoutLine

    seen: dict[UUID, set[str]] = {}
    for client_id, status in db.exec(
        select(PayeePayoutLine.client_id, PayeePayout.status)
        .join(PayeePayout, PayeePayout.id == PayeePayoutLine.payout_id)
        .where(PayeePayout.payroll_period_id == period_id)
    ).all():
        seen.setdefault(client_id, set()).add(status)
    out: dict[UUID, str] = {}
    for client_id, statuses in seen.items():
        if statuses == {"paid"}:
            out[client_id] = "paid"
        elif "paid" in statuses:
            out[client_id] = "part paid"
        elif "sent" in statuses:
            out[client_id] = "sent"
        else:
            out[client_id] = "draft"
    return out


def paid_client_ids(db: Session, period_id: UUID) -> set[UUID]:
    """Clients whose month is locked: on a paid payee payout (or a paid payout in the earlier format)."""
    from models.client_payout import PayeePayout, PayeePayoutLine

    locked = set(db.exec(
        select(PayeePayoutLine.client_id)
        .join(PayeePayout, PayeePayout.id == PayeePayoutLine.payout_id)
        .where(PayeePayout.payroll_period_id == period_id, PayeePayout.status == "paid")
    ).all())
    locked |= set(db.exec(
        select(ClientPayout.client_id).where(
            ClientPayout.payroll_period_id == period_id, ClientPayout.status == "paid",
        )
    ).all())
    return locked


def _require_open(db: Session, period: PayrollPeriod, client_id: UUID) -> None:
    if period.status == PayrollPeriodStatusEnum.paid:
        raise BillingError("This month is already paid.")
    if client_id in paid_client_ids(db, period.id):
        raise BillingError("This client has already been paid for this month.")


def set_client_pct(db: Session, client: Client, period: PayrollPeriod, client_pct: Decimal) -> None:
    """Imports: the account holder gets `client_pct` of this month's split, Global Solutions the rest."""
    pct = _q(Decimal(client_pct))
    if pct < 0 or pct > 100:
        raise BillingError("Client % must be between 0 and 100.")
    owner = (client.account_holder or client.name).strip()
    lines = []
    if pct > 0:
        lines.append({"name": owner, "pct": pct})
    if pct < 100:
        lines.append({"name": GS_PAYEE_NAME, "pct": _q(Decimal("100") - pct)})
    set_recipients(db, period, client, lines)


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
    rate=_UNSET,
    recipients=_UNSET,
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
    if actual is not _UNSET or received_on is not _UNSET:
        from services import income

        try:
            income.set_client_received(
                db, period, client.id,
                amount=... if actual is _UNSET else actual,
                received_on=... if received_on is _UNSET else received_on,
            )
        except income.IncomeError as exc:
            raise BillingError(str(exc)) from exc
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
    if recipients is not _UNSET and recipients is not None:
        set_recipients(db, period, client, recipients)
    db.flush()


def set_recipients(db: Session, period: PayrollPeriod, client: Client, recipients: list) -> None:
    """Replace this month's split recipients (any number, in order). Caller commits.

    Each item is {"payee_id" | "name", "pct", "amount_override"}. A typed name
    that is not a payee yet is added to the Payees list. Blank slots are
    dropped; the month keeps its own rows from now on instead of the
    carried-forward ones. % that do not add up to 100 are saved and flagged.
    """
    cleaned: list[tuple[int, Payee, Decimal, Optional[Decimal]]] = []
    seen: set = set()
    for slot, item in enumerate(recipients, start=1):
        get = item.get if isinstance(item, dict) else (lambda k, _i=item: getattr(_i, k, None))
        payee_id = get("payee_id")
        name = (get("name") or "").strip() or None
        pct = _q(Decimal(get("pct") or 0))
        override = get("amount_override")
        override = _q(Decimal(override)) if override is not None else None
        if pct < 0 or pct > 100:
            raise BillingError("Each recipient's % must be between 0 and 100.")
        if payee_id is None and name is None:
            if pct == 0 and override is None:
                continue
            raise BillingError(f"Recipient {slot} has no recipient.")
        payee = resolve_payee(db, payee_id, name)
        if payee.id in seen:
            raise BillingError(f"{payee.name} is listed twice on this client's split.")
        seen.add(payee.id)
        cleaned.append((slot, payee, pct, override))

    for row in db.exec(
        select(ClientSplitRecipient).where(
            ClientSplitRecipient.client_id == client.id,
            ClientSplitRecipient.payroll_period_id == period.id,
        )
    ).all():
        db.delete(row)
    db.flush()
    now = datetime.now(timezone.utc)
    # An empty list still records this month as "no recipients" so the
    # previous month's are not carried in again.
    if not cleaned:
        db.add(ClientSplitRecipient(
            client_id=client.id, payroll_period_id=period.id, slot=1, name=None, pct=ZERO, updated_at=now,
        ))
        return
    for slot, payee, pct, override in cleaned:
        db.add(ClientSplitRecipient(
            client_id=client.id, payroll_period_id=period.id, slot=slot, payee_id=payee.id, name=payee.name,
            pct=pct, amount_override=override, updated_at=now,
        ))


def resolve_payee(db: Session, payee_id, name: Optional[str]) -> Payee:
    """The payee picked by id, else the one with this name (added when new). Caller commits."""
    if payee_id is not None:
        payee = db.get(Payee, UUID(str(payee_id)))
        if payee is None:
            raise BillingError("That recipient no longer exists.")
        return payee
    name = (name or "").strip()
    if not name:
        raise BillingError("Name the recipient.")
    if is_gs_name(name):
        payee = db.exec(select(Payee).where(Payee.is_gs.is_(True))).first()
        if payee is not None:
            return payee
    from sqlalchemy import func

    payee = db.exec(select(Payee).where(func.lower(Payee.name) == name.casefold())).first()
    if payee is None:
        payee = Payee(name=name[:120], is_gs=is_gs_name(name))
        db.add(payee)
        db.flush()
    return payee
