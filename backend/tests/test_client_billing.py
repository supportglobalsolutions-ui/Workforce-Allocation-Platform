"""Client billing (gross split, desktop-hours switch, client tiers) and client payouts."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.client_payout import ClientPayout
from models.enums import ClientContractStatusEnum, PayrollPeriodStatusEnum
from services import client_billing, client_payouts


def _client(**kw):
    base = dict(
        id=uuid4(), name="Marcel 1", platform="Outlier", contract_status=ClientContractStatusEnum.active,
        hours_from_desktops=False, payout_currency="EUR", payout_email="marcel@example.org",
        payout_details=None, payment_tier_id=None, billing_rate_usd=Decimal("18.70"),
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _row(**kw):
    base = dict(amount=None, billed_hours_manual=None, client_costs=Decimal("0"), received_on=None, notes=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _month(client=None, row=None, *, desktop_hours="0", desktops=0, pct="30", shared="0",
           worker_cost="0", payout=None, period_paid=False, rate=None):
    client = client or _client()
    return client_billing.compute_month(
        client=client, row=row, payout=payout,
        desktop_count=desktops, desktop_hours=Decimal(desktop_hours),
        rate=rate or client_billing.client_rate(None, client, {}),
        client_pct=Decimal(pct), gs_pct=Decimal(100) - Decimal(pct),
        shared_cost=Decimal(shared), worker_cost=Decimal(worker_cost), period_paid=period_paid,
    )


# ── Billed hours: the desktop-hours switch ─────────────────────────────────────

def test_switch_off_bills_the_typed_hours_and_ignores_desktops():
    m = _month(row=_row(billed_hours_manual=Decimal("100")), desktop_hours="80", desktops=2)
    assert (m.billed_hours, m.hours_source) == (Decimal("100.00"), "typed")
    assert m.expected == Decimal("1870.00")


def test_switch_on_bills_the_hours_on_the_clients_desktops():
    client = _client(hours_from_desktops=True)
    m = _month(client, _row(billed_hours_manual=Decimal("100")), desktop_hours="80", desktops=2)
    assert (m.billed_hours, m.hours_source) == (Decimal("80.00"), "desktops")
    assert m.expected == Decimal("1496.00")


def test_switch_on_without_a_linked_desktop_warns():
    m = _month(_client(hours_from_desktops=True), desktops=0)
    assert any("no desktop is linked" in w for w in m.warnings)


def test_switch_off_with_no_typed_hours_has_no_expected_income():
    m = _month(row=_row())
    assert (m.billed_hours, m.expected, m.basis, m.basis_source) == (None, None, Decimal("0"), None)


# ── Expected vs received and the gross split ───────────────────────────────────

def test_marcel_1_worked_example():
    """100 h × $18.70, $1,800 received, 30% to the client, $20 of costs."""
    m = _month(row=_row(billed_hours_manual=Decimal("100"), amount=Decimal("1800")),
               shared="15", pct="30", worker_cost="800")
    m_one_off = _month(row=_row(billed_hours_manual=Decimal("100"), amount=Decimal("1800"), client_costs=Decimal("5")),
                       shared="15", pct="30", worker_cost="800")

    assert m.expected == Decimal("1870.00")
    assert m.variance == Decimal("-70.00")
    assert (m.basis, m.basis_source) == (Decimal("1800.00"), "actual")
    assert m_one_off.client_costs == Decimal("20.00")
    assert m_one_off.client_share == Decimal("520.00")
    assert m_one_off.gs_share == Decimal("1280.00")
    assert m_one_off.gs_margin == Decimal("460.00")
    assert not any("differs" in w for w in m_one_off.warnings)


def test_split_falls_back_to_expected_until_income_is_received():
    m = _month(row=_row(billed_hours_manual=Decimal("10")), pct="50")
    assert (m.basis, m.basis_source) == (Decimal("187.00"), "expected")
    assert m.client_share == Decimal("93.50")


def test_an_entered_zero_is_received_income_not_a_fallback():
    m = _month(row=_row(billed_hours_manual=Decimal("10"), amount=Decimal("0")))
    assert (m.basis, m.basis_source, m.client_share) == (Decimal("0.00"), "actual", Decimal("0.00"))


def test_received_more_than_5_percent_off_expected_warns():
    exactly_5 = _month(row=_row(billed_hours_manual=Decimal("10"), amount=Decimal("177.65")))
    over_5 = _month(row=_row(billed_hours_manual=Decimal("10"), amount=Decimal("170")))
    assert not any("differs" in w for w in exactly_5.warnings)
    assert any("differs" in w for w in over_5.warnings)


def test_costs_bigger_than_the_share_leave_the_client_owing():
    m = _month(row=_row(amount=Decimal("100"), client_costs=Decimal("50")), pct="30")
    assert m.client_share == Decimal("-20.00")
    assert m.gs_share == Decimal("120.00")
    assert any("owes GS" in w for w in m.warnings)


def test_worker_cost_never_changes_the_clients_share():
    cheap = _month(row=_row(amount=Decimal("1000")), worker_cost="0")
    dear = _month(row=_row(amount=Decimal("1000")), worker_cost="900")
    assert cheap.client_share == dear.client_share == Decimal("300.00")
    assert (cheap.gs_margin, dear.gs_margin) == (Decimal("700.00"), Decimal("-200.00"))


def test_margin_is_after_worker_cost_and_the_costs_gs_pays():
    m = _month(row=_row(amount=Decimal("1000"), client_costs=Decimal("50")), worker_cost="400")
    assert (m.client_share, m.gs_share) == (Decimal("250.00"), Decimal("750.00"))
    assert m.gs_margin == Decimal("300.00")


def test_missing_payout_details_warn_when_something_is_owed():
    m = _month(_client(payout_email=None, payout_details=None), _row(amount=Decimal("100")))
    assert any("payout" in w for w in m.warnings)


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

class _OneResult:
    def __init__(self, value):
        self.value = value

    def first(self):
        return self.value


def test_a_paid_client_cannot_be_edited():
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.approved)
    paid = SimpleNamespace(status="paid")
    db = SimpleNamespace(exec=lambda stmt: _OneResult(paid))
    with pytest.raises(client_billing.BillingError, match="already been paid"):
        client_billing._require_open(db, period, uuid4())


def test_a_paid_month_cannot_be_edited():
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.paid)
    with pytest.raises(client_billing.BillingError, match="already paid"):
        client_billing._require_open(SimpleNamespace(), period, uuid4())


def test_ledger_rows_show_locked_once_paid():
    assert _month(payout=SimpleNamespace(status="paid")).locked
    assert _month(period_paid=True).locked
    assert not _month(payout=SimpleNamespace(status="sent")).locked


# ── Client payouts ─────────────────────────────────────────────────────────────

class PayoutDB:
    def __init__(self):
        self.payouts = []

    def add(self, row):
        if not any(p is row for p in self.payouts):
            self.payouts.append(row)

    def delete(self, row):
        self.payouts = [p for p in self.payouts if p is not row]

    def flush(self):
        pass


@pytest.fixture
def payout_env(monkeypatch):
    db = PayoutDB()
    rates = {"EUR": Decimal("0.92")}
    monkeypatch.setattr(client_billing, "snapshot", lambda db, period, months: None)
    monkeypatch.setattr(client_payouts, "payouts_for", lambda db, pid: {p.client_id: p for p in db.payouts})
    monkeypatch.setattr(client_payouts, "payout_fx",
                        lambda db, cur, live=True: Decimal("1") if cur == "USD" else rates.get(cur))
    period = SimpleNamespace(id=uuid4(), status=PayrollPeriodStatusEnum.approved, label="October 2026")
    return db, rates, period


MARCEL = _client()


def _marcel_month(amount="1800"):
    return _month(MARCEL, _row(billed_hours_manual=Decimal("100"), amount=Decimal(amount), client_costs=Decimal("20")))


def test_approval_prepares_a_payout_at_the_frozen_rate(payout_env):
    db, _rates, period = payout_env
    result = client_payouts.prepare(db, period, refresh_fx=True, months=[_marcel_month()])

    (payout,) = db.payouts
    assert result["created"] == 1
    assert (payout.amount_usd, payout.currency, payout.fx_rate) == (Decimal("520.00"), "EUR", Decimal("0.92"))
    assert payout.amount_local == Decimal("478.40")
    assert payout.status == "draft"


def test_later_rate_changes_do_not_move_a_frozen_payout(payout_env):
    db, rates, period = payout_env
    month = _marcel_month()
    client_payouts.prepare(db, period, refresh_fx=True, months=[month])
    rates["EUR"] = Decimal("0.80")

    client_payouts.prepare(db, period, months=[month])
    assert db.payouts[0].amount_local == Decimal("478.40")

    client_payouts.prepare(db, period, refresh_fx=True, months=[month])
    assert db.payouts[0].amount_local == Decimal("416.00")


def test_a_changed_amount_sends_a_sent_statement_back_to_draft(payout_env):
    db, _rates, period = payout_env
    client_payouts.prepare(db, period, refresh_fx=True, months=[_marcel_month()])
    payout = db.payouts[0]
    payout.status, payout.statement_path = "sent", "/tmp/statement.pdf"

    client_payouts.prepare(db, period, months=[_marcel_month(amount="1900")])

    assert payout.amount_usd == Decimal("550.00")
    assert (payout.status, payout.sent_at, payout.statement_path) == ("draft", None, None)


def test_a_paid_payout_never_changes(payout_env):
    db, rates, period = payout_env
    client_payouts.prepare(db, period, refresh_fx=True, months=[_marcel_month()])
    payout = db.payouts[0]
    client_payouts.mark_paid(db, payout, period, reference="TRX-1", actor_id=None)
    rates["EUR"] = Decimal("0.50")

    client_payouts.prepare(db, period, refresh_fx=True, months=[_marcel_month(amount="5000")])

    assert (payout.status, payout.reference) == ("paid", "TRX-1")
    assert (payout.amount_usd, payout.amount_local) == (Decimal("520.00"), Decimal("478.40"))


def test_a_draft_payout_whose_share_drops_to_zero_is_removed(payout_env):
    db, _rates, period = payout_env
    client_payouts.prepare(db, period, refresh_fx=True, months=[_marcel_month()])
    zero = _month(MARCEL, _row(amount=Decimal("0")))

    assert client_payouts.prepare(db, period, months=[zero])["removed"] == 1
    assert db.payouts == []


def test_no_exchange_rate_leaves_the_local_amount_empty(payout_env):
    db, _rates, period = payout_env
    month = _month(_client(payout_currency="XAF"), _row(amount=Decimal("100")))
    assert client_payouts.prepare(db, period, months=[month])["no_fx"] == 1
    assert db.payouts[0].amount_local is None
    with pytest.raises(client_payouts.PayoutError, match="No exchange rate"):
        client_payouts.mark_paid(db, db.payouts[0], period, reference=None, actor_id=None)


def _payout(**kw):
    base = dict(client_id=uuid4(), payroll_period_id=uuid4(), amount_usd=Decimal("520"), currency="EUR",
                fx_rate=Decimal("0.92"), amount_local=Decimal("478.40"), status="draft")
    base.update(kw)
    return ClientPayout(**base)


def test_clients_are_paid_only_after_approval():
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


def test_statement_lists_every_step_of_the_split():
    rows = client_payouts.statement_rows(_marcel_month())
    labels = [r[0] for r in rows]
    assert labels[0] == "Billed hours" and labels[-1] == "Amount due to you"
    assert ("Other costs", "-20.00") in [(r[0], r[1]) for r in rows]
    assert rows[-1][1] == "520.00"

    pdf = client_payouts.build_statement_pdf(
        client_name="Marcel 1", period_label="October 2026", currency="EUR",
        fx_rate=Decimal("0.92"), amount_local=Decimal("478.40"), rows=rows,
    )
    assert pdf.startswith(b"%PDF")


def test_received_dates_survive_the_ledger_dict():
    m = _month(row=_row(amount=Decimal("10"), received_on=date(2026, 10, 30)))
    assert m.to_dict()["received_on"] == "2026-10-30"
