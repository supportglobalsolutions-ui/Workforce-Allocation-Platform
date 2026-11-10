"""Client billing (revenue, desktop-hours switch, client tiers), the recipient split, and payee payouts."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.client_payout import PayeePayout
from models.enums import ClientContractStatusEnum, PayrollPeriodStatusEnum, PayrollSessionEnum
from services import client_billing, client_payouts


def _client(**kw):
    base = dict(
        id=uuid4(), name="Marcel 1", platform="Outlier", contract_status=ClientContractStatusEnum.active,
        hours_from_desktops=False, payout_currency="EUR", payout_email="marcel@example.org",
        payout_details=None, payment_tier_id=None, billing_rate_usd=Decimal("18.70"), account_holder=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _row(**kw):
    base = dict(amount=None, billed_hours_manual=None, client_costs=Decimal("0"), received_on=None, notes=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _month(client=None, row=None, *, desktop_hours="0", desktops=0, shared="0", worker_cost="0",
           payout=None, period_paid=False, rate=None, received=None, received_on=None):
    client = client or _client()
    income = (Decimal(received), 1, received_on) if received is not None else None
    return client_billing.compute_month(
        client=client, row=row, payout=payout,
        desktop_count=desktops, desktop_hours=Decimal(desktop_hours),
        rate=rate or client_billing.client_rate(None, client, {}),
        shared_cost=Decimal(shared), worker_cost=Decimal(worker_cost), period_paid=period_paid,
        income=income,
    )


def _payee(name="Louis", **kw):
    base = dict(id=uuid4(), name=name, is_gs=False, payout_currency="EUR", payout_email=f"{name}@example.org",
                payout_details=None, payout_method=None, active=True)
    base.update(kw)
    return SimpleNamespace(**base)


GS = _payee("Global Solutions", is_gs=True, payout_currency=None, payout_email=None)


def _lines(*pairs, overrides=None):
    """[(payee, pct)] → resolved recipient dicts."""
    payees = {p.id: p for p, _ in pairs}
    raw = [
        {"slot": i, "payee_id": p.id, "name": p.name, "pct": Decimal(pct),
         "amount_override": (overrides or {}).get(i)}
        for i, (p, pct) in enumerate(pairs, start=1)
    ]
    return client_billing.resolve_recipients(raw, payees)


# ── Billed hours: the desktop-hours switch ─────────────────────────────────────

def test_switch_off_bills_the_typed_hours_and_ignores_desktops():
    m = _month(row=_row(billed_hours_manual=Decimal("100")), desktop_hours="80", desktops=2)
    assert (m.billed_hours, m.hours_source) == (Decimal("100.00"), "typed")
    assert m.expected == Decimal("1870.00")


def test_switch_on_bills_the_hours_on_linked_sessions():
    client = _client(hours_from_desktops=True)
    m = _month(client, _row(billed_hours_manual=Decimal("100")), desktop_hours="80", desktops=2)
    assert (m.billed_hours, m.hours_source) == (Decimal("80.00"), "desktops")
    assert m.expected == Decimal("1496.00")


def test_switch_on_without_linked_session_hours_warns():
    m = _month(_client(hours_from_desktops=True), desktops=0)
    assert any("no sessions are linked" in w for w in m.warnings)


def test_session_hours_count_only_the_linked_client():
    cid, worker = uuid4(), uuid4()
    start = datetime(2026, 10, 5, 9, tzinfo=timezone.utc)
    linked = SimpleNamespace(
        client_id=cid, worker_id=worker, payroll_period_id=None,
        payroll_approval_state=PayrollSessionEnum.approved,
        image_start_at=start, image_end_at=start + timedelta(hours=2), work_blocks=[],
    )
    unlinked = SimpleNamespace(
        client_id=None, worker_id=worker, payroll_period_id=None,
        payroll_approval_state=PayrollSessionEnum.approved,
        image_start_at=start, image_end_at=start + timedelta(hours=3), work_blocks=[],
    )
    period = SimpleNamespace(id=uuid4(), start_date=date(2026, 10, 1), end_date=date(2026, 10, 31))
    db = SimpleNamespace(exec=lambda stmt: SimpleNamespace(all=lambda: [linked, unlinked]))
    hours = client_billing._session_hours_by_client(db, period)
    assert list(hours) == [cid]
    assert hours[cid][worker] == Decimal("2")


def test_switch_off_with_no_typed_hours_has_no_expected_income():
    m = _month(row=_row())
    assert (m.billed_hours, m.expected, m.billing, m.billing_source) == (None, None, Decimal("0"), None)


# ── Revenue: income entries, else expected ─────────────────────────────────────

def test_revenue_falls_back_to_expected_until_income_is_entered():
    m = _month(row=_row(billed_hours_manual=Decimal("10")))
    assert (m.billing, m.billing_source) == (Decimal("187.00"), "expected")


def test_income_entries_are_the_revenue():
    m = _month(row=_row(billed_hours_manual=Decimal("100")), received="1800", received_on=date(2026, 10, 30))
    assert (m.billing, m.billing_source, m.actual) == (Decimal("1800.00"), "actual", Decimal("1800.00"))
    assert m.variance == Decimal("-70.00")
    assert m.received_on == date(2026, 10, 30)
    assert m.income_entries == 1


def test_a_typed_amount_on_the_month_row_is_ignored_without_income():
    m = _month(row=_row(billed_hours_manual=Decimal("10"), amount=Decimal("5000")))
    assert (m.billing, m.billing_source) == (Decimal("187.00"), "expected")


def test_an_entered_zero_is_received_income_not_a_fallback():
    m = _month(row=_row(billed_hours_manual=Decimal("10")), received="0")
    assert (m.billing, m.billing_source) == (Decimal("0.00"), "actual")


def test_received_more_than_5_percent_off_expected_warns():
    exactly_5 = _month(row=_row(billed_hours_manual=Decimal("10")), received="177.65")
    over_5 = _month(row=_row(billed_hours_manual=Decimal("10")), received="170")
    assert not any("differs" in w for w in exactly_5.warnings)
    assert any("differs" in w for w in over_5.warnings)


def test_other_costs_are_shared_plus_one_off():
    m = _month(row=_row(client_costs=Decimal("5")), shared="15")
    assert (m.shared_costs, m.one_off_costs, m.client_costs) == (Decimal("15.00"), Decimal("5.00"), Decimal("20.00"))


# ── Rates: client tier beats the client's own rate ─────────────────────────────

def _tier(**kw):
    base = dict(id=uuid4(), name="Client A", rate=Decimal("30"), unit="per_hour", currency="USD",
                is_active=True, applies_to="clients")
    base.update(kw)
    return SimpleNamespace(**base)


def test_client_tier_rate_overrides_the_billing_rate():
    tier = _tier()
    client = _client(payment_tier_id=tier.id, billing_rate_usd=Decimal("25"))
    assert client_billing.client_rate(None, client, {tier.id: tier}) == (Decimal("30.00"), "tier", "Client A")


def test_daily_client_tier_is_turned_into_an_hourly_rate():
    tier = _tier(rate=Decimal("160"), unit="per_day")
    client = _client(payment_tier_id=tier.id)
    assert client_billing.client_rate(None, client, {tier.id: tier})[0] == Decimal("20.00")


@pytest.mark.parametrize("tier_kw", [{"applies_to": "workers"}, {"is_active": False}])
def test_worker_or_inactive_tier_falls_back_to_the_billing_rate(tier_kw):
    tier = _tier(**tier_kw)
    client = _client(payment_tier_id=tier.id, billing_rate_usd=Decimal("25"))
    assert client_billing.client_rate(None, client, {tier.id: tier})[:2] == (Decimal("25.00"), "client")


def test_no_tier_and_no_rate_warns_when_hours_are_billed():
    client = _client(billing_rate_usd=None)
    m = _month(client, _row(billed_hours_manual=Decimal("5")))
    assert m.expected is None
    assert any("No billing rate" in w for w in m.warnings)


# ── Locks ──────────────────────────────────────────────────────────────────────

def test_a_paid_client_cannot_be_edited(monkeypatch):
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.approved)
    cid = uuid4()
    monkeypatch.setattr(client_billing, "paid_client_ids", lambda db, pid: {cid})
    with pytest.raises(client_billing.BillingError, match="already been paid"):
        client_billing._require_open(None, period, cid)


def test_a_paid_month_cannot_be_edited():
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.paid)
    with pytest.raises(client_billing.BillingError, match="already paid"):
        client_billing._require_open(SimpleNamespace(), period, uuid4())


def test_ledger_rows_show_locked_once_paid():
    assert _month(payout=SimpleNamespace(status="paid")).locked
    assert _month(period_paid=True).locked
    assert not _month(payout=SimpleNamespace(status="sent")).locked


def test_received_dates_survive_the_ledger_dict():
    m = _month(received="10", received_on=date(2026, 10, 30))
    client_billing.apply_split(m, Decimal("0"), _lines((GS, "100")))
    out = m.to_dict()
    assert out["received_on"] == "2026-10-30"
    assert out["recipients"][0]["payee_id"] == str(GS.id)


# ── The split: net distributable between recipients ────────────────────────────

LOUIS, SAM, HOLDER = _payee("Louis"), _payee("Sam - Can"), _payee("Holder")


def test_sam_can_row_from_the_client_splits_sheet():
    """Revenue 4,180.00 − worker cost 1,037.98 − transfer 0.01 = 3,142.01, split 33.3% three ways."""
    m = _month(received="4180", worker_cost="1037.98")
    client_billing.apply_split(m, Decimal("0.01"), _lines((LOUIS, "33.3"), (SAM, "33.3"), (HOLDER, "33.3")))

    assert (m.transfer_cost, m.split_total_costs, m.net_distributable) == (
        Decimal("0.01"), Decimal("1037.99"), Decimal("3142.01"),
    )
    assert [r["amount"] for r in m.recipients] == [Decimal("1046.29")] * 3
    assert m.split_check == "Check split"  # 99.9%, as the sheet flags it
    assert any("add up to 99.90%" in w for w in m.warnings)


def test_a_split_that_adds_up_to_100_is_ok():
    m = _month(received="5946.60", worker_cost="1220.05")
    client_billing.apply_split(m, Decimal("0.01"), _lines((LOUIS, "37.5"), (SAM, "37.5"), (GS, "25")))
    assert m.net_distributable == Decimal("4726.54")
    assert [r["amount"] for r in m.recipients] == [Decimal("1772.45"), Decimal("1772.45"), Decimal("1181.64")]
    assert m.split_check == "OK"
    assert (m.payout_amount, m.gs_amount) == (Decimal("3544.90"), Decimal("1181.64"))


def test_costs_come_off_before_the_split():
    m = _month(row=_row(client_costs=Decimal("5")), received="1000", shared="15", worker_cost="400")
    client_billing.apply_split(m, Decimal("0"), _lines((LOUIS, "100")), carried_from="September 2026")
    assert (m.split_total_costs, m.net_distributable) == (Decimal("420.00"), Decimal("580.00"))
    assert (m.recipients[0]["amount"], m.recipients_from) == (Decimal("580.00"), "September 2026")


def test_a_typed_amount_replaces_the_worked_out_one():
    m = _month(received="1000")
    client_billing.apply_split(m, Decimal("0"), _lines((LOUIS, "50"), (GS, "50"), overrides={1: Decimal("520")}))
    louis, gs = m.recipients
    assert (louis["amount_calc"], louis["amount_override"], louis["amount"]) == (
        Decimal("500.00"), Decimal("520.00"), Decimal("520.00"),
    )
    assert gs["amount"] == Decimal("500.00")
    assert m.split_check == "Check split"
    assert any("1020.00 USD, not the net distributable of 1000.00" in w for w in m.warnings)


def test_typed_amounts_that_add_up_to_the_net_are_ok():
    m = _month(received="1000")
    client_billing.apply_split(
        m, Decimal("0"), _lines((LOUIS, "50"), (GS, "50"), overrides={1: Decimal("520"), 2: Decimal("480")}),
    )
    assert m.split_check == "OK"


def test_no_recipients_needs_attention():
    m = _month(received="100")
    client_billing.apply_split(m, Decimal("0"), [])
    assert m.split_check == "Check split"
    assert any("No recipients" in w for w in m.warnings)


def test_a_payee_owed_money_without_payout_details_warns():
    bare = _payee("Bare", payout_currency=None, payout_email=None)
    m = _month(received="100")
    client_billing.apply_split(m, Decimal("0"), _lines((bare, "100")))
    assert m.recipients[0]["payout_ready"] is False
    assert any("Bare has no payout currency" in w for w in m.warnings)


def test_gs_never_needs_payout_details():
    m = _month(received="100")
    client_billing.apply_split(m, Decimal("0"), _lines((GS, "100")))
    assert not any("payout" in w for w in m.warnings)


def test_costs_bigger_than_revenue_warn():
    m = _month(received="100", worker_cost="150")
    client_billing.apply_split(m, Decimal("0"), _lines((GS, "100")))
    assert m.net_distributable == Decimal("-50.00")
    assert any("negative" in w for w in m.warnings)


def test_default_recipients_come_from_the_agreement():
    agreement = SimpleNamespace(owner_pct=Decimal("30"), third_party_name="Referrer", third_party_pct=Decimal("10"),
                                gs_pct=Decimal("60"))
    owner = _payee("Marcel 1")
    lines, source = client_billing.default_recipients(_client(), agreement, {owner.id: owner, GS.id: GS})
    assert source == "agreement"
    assert [(l["name"], l["pct"], l["payee_id"]) for l in lines] == [
        ("Marcel 1", Decimal("30"), owner.id), ("Referrer", Decimal("10"), None), ("Global Solutions", Decimal("60"), GS.id),
    ]


def test_without_an_agreement_gs_takes_everything():
    lines, source = client_billing.default_recipients(_client(), None, {GS.id: GS})
    assert source == "default"
    assert [(l["payee_id"], l["pct"]) for l in lines] == [(GS.id, Decimal("100"))]


class _RecipientDB:
    def __init__(self):
        self.added, self.deleted = [], []

    def exec(self, stmt):
        return SimpleNamespace(all=lambda: [])

    def delete(self, row):
        self.deleted.append(row)

    def flush(self):
        pass

    def add(self, row):
        self.added.append(row)


@pytest.fixture
def payee_lookup(monkeypatch):
    known = {"louis": LOUIS, "holder": HOLDER, "global solutions": GS}

    def resolve(db, payee_id, name):
        if payee_id is not None:
            return next(p for p in known.values() if p.id == payee_id)
        key = (name or "").strip().casefold()
        if key not in known:
            known[key] = _payee(name.strip())
        return known[key]

    monkeypatch.setattr(client_billing, "resolve_payee", resolve)
    return known


def test_saving_recipients_drops_blank_slots_and_keeps_their_order(payee_lookup):
    db = _RecipientDB()
    client_billing.set_recipients(db, SimpleNamespace(id=uuid4()), _client(), [
        {"name": " Louis ", "pct": "50"}, {"name": "", "pct": "0"},
        {"payee_id": HOLDER.id, "pct": "50", "amount_override": "12.345"},
    ])
    assert [(r.slot, r.payee_id, r.name, r.pct, r.amount_override) for r in db.added] == [
        (1, LOUIS.id, "Louis", Decimal("50.00"), None),
        (3, HOLDER.id, "Holder", Decimal("50.00"), Decimal("12.35")),
    ]


def test_a_new_name_becomes_a_payee(payee_lookup):
    db = _RecipientDB()
    client_billing.set_recipients(db, SimpleNamespace(id=uuid4()), _client(), [{"name": "New Person", "pct": "100"}])
    assert db.added[0].payee_id == payee_lookup["new person"].id


def test_percentages_that_do_not_add_up_are_saved_and_flagged_later(payee_lookup):
    db = _RecipientDB()
    client_billing.set_recipients(db, SimpleNamespace(id=uuid4()), _client(), [{"name": "Louis", "pct": "40"}])
    assert db.added[0].pct == Decimal("40.00")


@pytest.mark.parametrize("recipients, message", [
    ([{"name": None, "pct": "10"}], "no payee"),
    ([{"name": "Louis", "pct": "50"}, {"name": "louis", "pct": "50"}], "listed twice"),
    ([{"name": "Louis", "pct": "120"}], "between 0 and 100"),
])
def test_bad_recipients_are_refused(payee_lookup, recipients, message):
    with pytest.raises(client_billing.BillingError, match=message):
        client_billing.set_recipients(_RecipientDB(), SimpleNamespace(id=uuid4()), _client(), recipients)


def test_clearing_recipients_records_an_empty_month(payee_lookup):
    db = _RecipientDB()
    client_billing.set_recipients(db, SimpleNamespace(id=uuid4()), _client(), [])
    assert [(r.slot, r.name, r.payee_id) for r in db.added] == [(1, None, None)]


# ── Payee payouts: one per payee per month, a line per client ──────────────────

class PayoutDB:
    def __init__(self):
        self.payouts = []
        self.lines = {}

    def add(self, row):
        if isinstance(row, PayeePayout) and not any(p is row for p in self.payouts):
            self.payouts.append(row)

    def delete(self, row):
        self.payouts = [p for p in self.payouts if p is not row]
        self.lines.pop(row.id, None)

    def flush(self):
        pass


@pytest.fixture
def payout_env(monkeypatch):
    db = PayoutDB()
    rates = {"EUR": Decimal("0.92"), "UGX": Decimal("3700")}
    monkeypatch.setattr(client_billing, "snapshot", lambda db, period, months: None)
    monkeypatch.setattr(client_payouts, "payouts_for", lambda db, pid: {p.payee_id: p for p in db.payouts})
    monkeypatch.setattr(client_payouts, "legacy_payouts", lambda db, pid: [])
    monkeypatch.setattr(
        client_payouts, "lines_for",
        lambda db, ids: {pid: [SimpleNamespace(client_id=c, amount_usd=a, pct=p) for c, p, a in db.lines.get(pid, [])]
                         for pid in ids},
    )
    monkeypatch.setattr(client_payouts, "_set_lines", lambda db, payout, lines: db.lines.__setitem__(payout.id, lines))
    monkeypatch.setattr(client_payouts, "payout_fx",
                        lambda db, cur, live=True: Decimal("1") if cur == "USD" else rates.get(cur))
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.approved, label="October 2026")
    payees = {p.id: p for p in (LOUIS, SAM, HOLDER, GS)}
    return db, rates, period, payees


def _split_month(name, revenue, *pairs, overrides=None):
    m = _month(_client(name=name), received=revenue)
    client_billing.apply_split(m, Decimal("0"), _lines(*pairs, overrides=overrides))
    return m


def test_a_payee_on_two_clients_gets_one_combined_payout(payout_env):
    db, _rates, period, payees = payout_env
    a = _split_month("Account A", "1000", (LOUIS, "50"), (GS, "50"))
    b = _split_month("Account B", "400", (LOUIS, "25"), (SAM, "25"), (GS, "50"))

    result = client_payouts.prepare(db, period, refresh_fx=True, months=[a, b], payees=payees)

    assert result["created"] == 2
    by_payee = {p.payee_id: p for p in db.payouts}
    assert set(by_payee) == {LOUIS.id, SAM.id}  # Global Solutions keeps its share
    louis = by_payee[LOUIS.id]
    assert (louis.amount_usd, louis.currency, louis.fx_rate, louis.amount_local) == (
        Decimal("600.00"), "EUR", Decimal("0.92"), Decimal("552.00"),
    )
    assert sorted((c, a) for c, _p, a in db.lines[louis.id]) == sorted(
        [(a.client_id, Decimal("500.00")), (b.client_id, Decimal("100.00"))],
    )


def test_later_rate_changes_do_not_move_a_frozen_payout(payout_env):
    db, rates, period, payees = payout_env
    month = _split_month("Account A", "1000", (LOUIS, "100"))
    client_payouts.prepare(db, period, refresh_fx=True, months=[month], payees=payees)
    rates["EUR"] = Decimal("0.80")

    client_payouts.prepare(db, period, months=[month], payees=payees)
    assert db.payouts[0].amount_local == Decimal("920.00")

    client_payouts.prepare(db, period, refresh_fx=True, months=[month], payees=payees)
    assert db.payouts[0].amount_local == Decimal("800.00")


def test_a_changed_amount_sends_a_sent_statement_back_to_draft(payout_env):
    db, _rates, period, payees = payout_env
    client_payouts.prepare(db, period, refresh_fx=True, months=[_split_month("A", "1000", (LOUIS, "100"))],
                           payees=payees)
    payout = db.payouts[0]
    payout.status, payout.statement_path = "sent", "/tmp/statement.pdf"

    client_payouts.prepare(db, period, months=[_split_month("A", "1100", (LOUIS, "100"))], payees=payees)

    assert payout.amount_usd == Decimal("1100.00")
    assert (payout.status, payout.sent_at, payout.statement_path) == ("draft", None, None)


def test_a_paid_payout_never_changes_and_locks_its_clients(payout_env):
    db, rates, period, payees = payout_env
    month = _split_month("A", "1000", (LOUIS, "50"), (SAM, "50"))
    client_payouts.prepare(db, period, refresh_fx=True, months=[month], payees=payees)
    louis = next(p for p in db.payouts if p.payee_id == LOUIS.id)
    client_payouts.mark_paid(db, louis, period, reference="TRX-1", actor_id=None)
    rates["EUR"] = Decimal("0.50")

    later = _split_month("A", "5000", (LOUIS, "50"), (SAM, "50"))
    later.client_id = month.client_id
    client_payouts.prepare(db, period, refresh_fx=True, months=[later], payees=payees)

    assert (louis.status, louis.reference, louis.amount_usd) == ("paid", "TRX-1", Decimal("500.00"))
    sam = next(p for p in db.payouts if p.payee_id == SAM.id)
    assert sam.amount_usd == Decimal("500.00")  # the client's month is locked by Louis's paid payout


def test_a_draft_payout_whose_amount_drops_to_zero_is_removed(payout_env):
    db, _rates, period, payees = payout_env
    client_payouts.prepare(db, period, refresh_fx=True, months=[_split_month("A", "1000", (LOUIS, "100"))],
                           payees=payees)
    zero = _split_month("A", "0", (LOUIS, "100"))

    assert client_payouts.prepare(db, period, months=[zero], payees=payees)["removed"] == 1
    assert db.payouts == []


def test_no_exchange_rate_leaves_the_local_amount_empty(payout_env):
    db, _rates, period, payees = payout_env
    xaf = _payee("Xaf", payout_currency="XAF")
    payees[xaf.id] = xaf
    month = _split_month("A", "100", (xaf, "100"))
    assert client_payouts.prepare(db, period, months=[month], payees=payees)["no_fx"] == 1
    assert db.payouts[0].amount_local is None
    with pytest.raises(client_payouts.PayoutError, match="No exchange rate"):
        client_payouts.mark_paid(db, db.payouts[0], period, reference=None, actor_id=None)


def _payout(**kw):
    base = dict(payee_id=uuid4(), payroll_period_id=uuid4(), amount_usd=Decimal("520"), currency="EUR",
                fx_rate=Decimal("0.92"), amount_local=Decimal("478.40"), status="draft")
    base.update(kw)
    return PayeePayout(**base)


def test_payees_are_paid_only_after_approval():
    period = SimpleNamespace(status=PayrollPeriodStatusEnum.calculated)
    with pytest.raises(client_payouts.PayoutError, match="Approve the month"):
        client_payouts.mark_paid(PayoutDB(), _payout(), period, reference="x", actor_id=None)


def test_undo_paid_is_refused_once_the_month_is_paid():
    approved = SimpleNamespace(status=PayrollPeriodStatusEnum.approved)
    payout = _payout()
    client_payouts.mark_paid(PayoutDB(), payout, approved, reference=" TRX-9 ", actor_id=None)
    assert payout.reference == "TRX-9"

    client_payouts.undo_paid(PayoutDB(), payout, approved)
    assert (payout.status, payout.reference, payout.paid_at) == ("draft", None, None)

    client_payouts.mark_paid(PayoutDB(), payout, approved, reference=None, actor_id=None)
    with pytest.raises(client_payouts.PayoutError, match="already paid"):
        client_payouts.undo_paid(PayoutDB(), payout, SimpleNamespace(status=PayrollPeriodStatusEnum.paid))


def test_admin_can_type_the_payout_rate_until_paid():
    approved = SimpleNamespace(status=PayrollPeriodStatusEnum.approved)
    payout = _payout(status="sent")
    client_payouts.set_rate(PayoutDB(), payout, approved, Decimal("0.9"))
    assert (payout.amount_local, payout.status) == (Decimal("468.00"), "draft")

    payout.status = "paid"
    with pytest.raises(client_payouts.PayoutError):
        client_payouts.set_rate(PayoutDB(), payout, approved, Decimal("1.1"))


def test_combined_statement_has_a_section_per_client():
    a = _split_month("Account A", "1000", (LOUIS, "50"), (GS, "50"), overrides={1: Decimal("520")})
    b = _split_month("Account B", "400", (LOUIS, "25"), (GS, "75"))
    sections = client_payouts.statement_sections([a, b], LOUIS.id, [a.client_id, b.client_id])

    assert [name for name, _ in sections] == ["Account A", "Account B"]
    a_rows = dict((r[0], r[1]) for r in sections[0][1])
    assert (a_rows["Revenue"], a_rows["Net distributable"], a_rows["Your %"]) == ("1,000.00", "1,000.00", "50.00%")
    assert (a_rows["Worked out"], a_rows["Your share"]) == ("500.00", "520.00")
    assert dict((r[0], r[1]) for r in sections[1][1])["Your share"] == "100.00"

    rows = client_payouts.email_rows(sections, Decimal("620"))
    assert rows[-1] == ("Amount due to you", "620.00", "Total of your shares this month.")

    pdf = client_payouts.build_statement_pdf(
        payee_name="Louis", period_label="October 2026", currency="EUR", fx_rate=Decimal("0.92"),
        amount_local=Decimal("570.40"), total_usd=Decimal("620"), sections=sections,
    )
    assert pdf.startswith(b"%PDF")
