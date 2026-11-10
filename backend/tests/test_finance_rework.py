"""Income entries, admin-added sessions with their own rate, month checks and Super Admin sign-off."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from models.enums import PayrollPeriodStatusEnum, PayrollSessionEnum, SessionTypeEnum
from services import admin_sessions, income, month_checks, payroll_engine
from services.session_evidence import evidence_complete, work_minutes


class _DB:
    def __init__(self):
        self.added, self.deleted = [], []

    def add(self, row):
        if not any(r is row for r in self.added):
            self.added.append(row)

    def delete(self, row):
        self.deleted.append(row)

    def flush(self):
        pass


def _period(status=PayrollPeriodStatusEnum.open, **kw):
    base = dict(id=uuid4(), label="October 2026", status=status, start_date=date(2026, 10, 1),
                end_date=date(2026, 10, 31), currency="USD", bypass_reason=None, bypassed_by=None,
                bypassed_at=None, bypassed_issues=None)
    base.update(kw)
    return SimpleNamespace(**base)


# ── Income ─────────────────────────────────────────────────────────────────────

def test_income_in_another_currency_is_frozen_in_usd(monkeypatch):
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: Decimal("3700") if cur == "UGX" else Decimal("1"))
    entry = income.create(_DB(), _period(), category="client_payout", amount=Decimal("1850000"), currency="ugx")
    assert (entry.currency, entry.fx_rate, entry.amount_usd) == ("UGX", Decimal("3700"), Decimal("500.00"))


def test_a_typed_rate_wins_over_todays_rate(monkeypatch):
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: Decimal("3700"))
    entry = income.create(_DB(), _period(), category="gs_account", amount=Decimal("1800000"), currency="UGX",
                          fx_rate=Decimal("3600"))
    assert entry.amount_usd == Decimal("500.00")


def test_changing_the_amount_keeps_the_frozen_rate(monkeypatch):
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: Decimal("3700"))
    entry = income.create(_DB(), _period(), category="gs_account", amount=Decimal("3700"), currency="UGX")
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: Decimal("1000"))
    income.update(_DB(), _period(), entry, {"amount": Decimal("7400")})
    assert (entry.fx_rate, entry.amount_usd) == (Decimal("3700"), Decimal("2.00"))


def test_other_income_needs_a_description():
    with pytest.raises(income.IncomeError, match="Describe"):
        income.create(_DB(), _period(), category="other", amount=Decimal("10"))
    entry = income.create(_DB(), _period(), category="other", amount=Decimal("10"), description="Refund")
    assert entry.description == "Refund"


def test_unknown_category_is_refused():
    with pytest.raises(income.IncomeError, match="Pick a category"):
        income.create(_DB(), _period(), category="salary", amount=Decimal("10"))


def test_no_rate_asks_for_one(monkeypatch):
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: None)
    with pytest.raises(income.IncomeError, match="type the rate"):
        income.create(_DB(), _period(), category="gs_account", amount=Decimal("10"), currency="XAF")


def test_paid_months_take_no_income():
    with pytest.raises(income.IncomeError, match="already paid"):
        income.create(_DB(), _period(PayrollPeriodStatusEnum.paid), category="gs_account", amount=Decimal("1"))


def test_totals_are_by_category():
    rows = [SimpleNamespace(category=c, amount_usd=Decimal(a))
            for c, a in (("client_payout", "100"), ("client_payout", "50.5"), ("other", "10"))]
    assert income.totals(rows) == {
        "total_usd": "160.50",
        "by_category": {"client_payout": "150.50", "gs_account": "0.00", "other": "10.00"},
    }


def test_the_ledger_received_cell_refuses_when_there_are_several_entries(monkeypatch):
    cid = uuid4()
    monkeypatch.setattr(income, "entries_for", lambda db, pid: [SimpleNamespace(client_id=cid)] * 2)
    with pytest.raises(income.IncomeError, match="several income entries"):
        income.set_client_received(_DB(), _period(), cid, amount=Decimal("5"))


def test_the_ledger_received_cell_adds_a_client_payout_in_usd(monkeypatch):
    cid = uuid4()
    monkeypatch.setattr(income, "entries_for", lambda db, pid: [])
    db = _DB()
    income.set_client_received(db, _period(), cid, amount=Decimal("190"))
    (entry,) = db.added
    assert (entry.category, entry.client_id, entry.currency, entry.amount_usd) == (
        "client_payout", cid, "USD", Decimal("190.00"),
    )


def test_the_ledger_received_cell_edits_or_clears_the_one_entry(monkeypatch):
    monkeypatch.setattr(income, "usd_rate", lambda db, cur: Decimal("3700"))
    cid = uuid4()
    entry = income.create(_DB(), _period(), category="client_payout", amount=Decimal("370000"), currency="UGX",
                          client_id=cid)
    monkeypatch.setattr(income, "entries_for", lambda db, pid: [entry])
    income.set_client_received(_DB(), _period(), cid, amount=Decimal("120"))
    assert (entry.currency, entry.fx_rate, entry.amount_usd) == ("USD", Decimal("1"), Decimal("120.00"))
    db = _DB()
    income.set_client_received(db, _period(), cid, amount=None)
    assert db.deleted == [entry]


class _ExecDB(_DB):
    """Answers each `exec` with the next prepared list of rows."""

    def __init__(self, *results):
        super().__init__()
        self.results = list(results)

    def exec(self, _stmt):
        rows = self.results.pop(0)
        return SimpleNamespace(all=lambda: rows)


def test_month_data_client_income_is_saved_as_the_clients_income_entry(monkeypatch):
    from services import cost_ledger

    cid = uuid4()
    calls = []
    monkeypatch.setattr(income, "set_client_received",
                        lambda db, period, client_id, *, amount: calls.append((client_id, amount)))
    db = _ExecDB([cid], [])
    assert cost_ledger.set_client_earnings(db, period=_period(), amounts={cid: Decimal("190")}) == 1
    assert calls == [(cid, Decimal("190.00"))]


def test_month_data_client_income_reports_income_errors(monkeypatch):
    from services import cost_ledger

    cid = uuid4()

    def refuse(db, period, client_id, *, amount):
        raise income.IncomeError("This client has several income entries this month: edit them on the Income tab.")

    monkeypatch.setattr(income, "set_client_received", refuse)
    with pytest.raises(cost_ledger.CostLedgerError, match="several income entries"):
        cost_ledger.set_client_earnings(_ExecDB([cid], []), period=_period(), amounts={cid: Decimal("5")})


# ── Admin-added sessions and pay at their own rate ─────────────────────────────

def _session(hours, rate=None, session_type=SessionTypeEnum.gs_rdp):
    start = datetime(2026, 10, 5, 9, tzinfo=timezone.utc)
    end = start + timedelta(hours=hours)
    return SimpleNamespace(
        rate_override=Decimal(rate) if rate is not None else None, session_type=session_type,
        image_start_at=start, image_end_at=end, work_blocks=[{"start": start.isoformat(), "end": end.isoformat()}],
        duration_minutes=None,
    )


def test_sessions_with_their_own_rate_add_the_difference():
    sessions = [_session(10), _session(2, rate="15"), _session(1, rate="5")]
    # 13 h × 10 at the tier rate, then +2 h × 5 and −1 h × 5 for the two typed rates.
    assert payroll_engine.rate_override_adjustment(sessions, Decimal("10")) == Decimal("5.00")


def test_a_typed_rate_still_pays_when_the_worker_has_no_tier():
    assert payroll_engine.rate_override_adjustment([_session(3, rate="12")], None) == Decimal("36.00")


def test_partner_sessions_ignore_a_typed_rate():
    s = _session(3, rate="12", session_type=SessionTypeEnum.partner_multilog)
    assert payroll_engine.rate_override_adjustment([s], Decimal("10")) == Decimal("0.00")


@pytest.fixture
def add_env(monkeypatch):
    calls = []
    monkeypatch.setattr(payroll_engine, "on_session_hours_changed", lambda db, s: calls.append(s))
    return calls


def _worker():
    return SimpleNamespace(id=uuid4(), display_name="Ada")


def _desk(*, client_id=...):
    return SimpleNamespace(
        id=uuid4(),
        client_id=uuid4() if client_id is ... else client_id,
        nickname="Monica-Desk",
    )


def _client_row():
    return SimpleNamespace(id=uuid4(), name="Marcel 1")


class _ClientDeskDB(_DB):
    def __init__(self, client, desk=None):
        super().__init__()
        self.client = client
        self.desk = desk

    def get(self, model, pk):
        if self.client is not None and pk == self.client.id:
            return self.client
        if self.desk is not None and pk == self.desk.id:
            return self.desk
        return None


def test_an_admin_session_is_closed_approved_and_counts_its_hours(monkeypatch, add_env):
    period = _period()
    client = _client_row()
    desk = _desk()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: period)
    db = _ClientDeskDB(client, desk)
    s = admin_sessions.create(
        db, _worker(), title="Data labelling", day=date(2026, 10, 7),
        hours=Decimal("2.5"), rate=Decimal("12"), note="Offline batch",
        client_id=client.id, rdp_resource_id=desk.id,
    )
    assert (s.added_by_admin, s.title, s.rate_override, s.admin_notes) == (True, "Data labelling", Decimal("12.00"),
                                                                          "Offline batch")
    assert s.payroll_approval_state == PayrollSessionEnum.approved
    assert s.payroll_period_id == period.id
    assert (s.rdp_resource_id, s.client_id) == (desk.id, client.id)
    assert work_minutes(s) == 150
    assert evidence_complete(s)
    assert add_env == [s]


def test_admin_sessions_need_a_client(monkeypatch, add_env):
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period())
    with pytest.raises(admin_sessions.AdminSessionError, match="Pick the client"):
        admin_sessions.create(
            _ClientDeskDB(None), _worker(), title="x", day=date(2026, 10, 7), hours=Decimal("1"),
            client_id=None,
        )
    with pytest.raises(admin_sessions.AdminSessionError, match="Client not found"):
        admin_sessions.create(
            _ClientDeskDB(None), _worker(), title="x", day=date(2026, 10, 7), hours=Decimal("1"),
            client_id=uuid4(),
        )
    client = _client_row()
    with pytest.raises(admin_sessions.AdminSessionError, match="Desktop not found"):
        admin_sessions.create(
            _ClientDeskDB(client), _worker(), title="x", day=date(2026, 10, 7), hours=Decimal("1"),
            client_id=client.id, rdp_resource_id=uuid4(),
        )


def test_admin_sessions_need_a_name_and_sensible_hours(monkeypatch, add_env):
    client = _client_row()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period())
    with pytest.raises(admin_sessions.AdminSessionError, match="name"):
        admin_sessions.create(
            _ClientDeskDB(client), _worker(), title=" ", day=date(2026, 10, 7), hours=Decimal("1"),
            client_id=client.id,
        )
    with pytest.raises(admin_sessions.AdminSessionError, match="Hours"):
        admin_sessions.create(
            _ClientDeskDB(client), _worker(), title="x", day=date(2026, 10, 7), hours=Decimal("25"),
            client_id=client.id,
        )


@pytest.mark.parametrize("status, message", [
    (PayrollPeriodStatusEnum.paid, "already paid"),
    (PayrollPeriodStatusEnum.approved, "reopen it"),
])
def test_admin_sessions_are_refused_on_closed_months(monkeypatch, add_env, status, message):
    client = _client_row()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period(status))
    with pytest.raises(admin_sessions.AdminSessionError, match=message):
        admin_sessions.create(
            _ClientDeskDB(client), _worker(), title="x", day=date(2026, 10, 7), hours=Decimal("1"),
            client_id=client.id,
        )


def test_bulk_total_hours_are_shared_and_add_up_exactly(monkeypatch, add_env):
    client = _client_row()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period())
    made = admin_sessions.create_bulk(
        _ClientDeskDB(client), _worker(), count=3, hours=Decimal("1"), hours_are="total",
        title="Outside work", day=date(2026, 10, 7), client_id=client.id,
    )
    assert [work_minutes(s) for s in made] == [20, 20, 20]
    assert admin_sessions.split_minutes(4, Decimal("1.05"), "total") == [16, 16, 16, 15]


def test_bulk_hours_each_are_multiplied(monkeypatch, add_env):
    client = _client_row()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period())
    made = admin_sessions.create_bulk(
        _ClientDeskDB(client), _worker(), count=5, hours=Decimal("20"), hours_are="each",
        title="Outside work", day=date(2026, 10, 7), client_id=client.id,
    )
    assert sum(work_minutes(s) for s in made) == 100 * 60
    assert len(add_env) == 5


def test_bulk_refuses_sessions_over_a_day(monkeypatch, add_env):
    client = _client_row()
    monkeypatch.setattr(admin_sessions, "_period_for", lambda db, day: _period())
    with pytest.raises(admin_sessions.AdminSessionError, match="at most 24"):
        admin_sessions.create_bulk(
            _ClientDeskDB(client), _worker(), count=2, hours=Decimal("50"), hours_are="total",
            title="x", day=date(2026, 10, 7), client_id=client.id,
        )


# ── Month checks and bypass ────────────────────────────────────────────────────

ISSUES = [{"key": "split:a", "kind": "split", "message": "A: recipients add up to 90%.", "href": "/x"}]


def test_a_bypass_needs_a_reason():
    with pytest.raises(ValueError, match="reason"):
        month_checks.bypass(_DB(), _period(), reason=" ok ", actor_id=uuid4(), open_issues=ISSUES)


def test_a_bypass_covers_only_the_issues_open_at_the_time():
    period = _period()
    month_checks.bypass(_DB(), period, reason="Client confirmed by phone", actor_id=uuid4(), open_issues=ISSUES)
    assert month_checks.is_bypassed(period, ISSUES)
    new_issue = {"key": "payee_details:b", "kind": "payee_details", "message": "B", "href": "/y"}
    assert not month_checks.is_bypassed(period, [*ISSUES, new_issue])

    month_checks.clear_bypass(period)
    assert not month_checks.is_bypassed(period, ISSUES)


def test_approval_is_refused_while_checks_are_open(monkeypatch):
    period = _period(PayrollPeriodStatusEnum.calculated)
    db = SimpleNamespace(get=lambda model, pid: period)
    monkeypatch.setattr(month_checks, "issues", lambda db, p, months=None: ISSUES)
    with pytest.raises(ValueError, match="1 month check"):
        payroll_engine.approve_period(db, period.id, uuid4())


# ── Super Admin gates ──────────────────────────────────────────────────────────

def _deps_of(path: str, method: str):
    from routers.payroll import router

    for route in router.routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return [d.call for d in route.dependant.dependencies]
    raise AssertionError(f"{method} {path} not found")


@pytest.mark.parametrize("path", [
    "/periods/{period_id}/approve",
    "/periods/{period_id}/reopen",
    "/periods/{period_id}/mark-paid",
    "/periods/{period_id}/bypass",
])
def test_sign_off_routes_are_super_admin_only(path):
    from fastapi import HTTPException

    deps = _deps_of(path, "POST")
    role_checks = [d for d in deps if getattr(d, "__name__", "") == "dependency"]
    assert role_checks, "no role dependency"
    with pytest.raises(HTTPException) as exc:
        role_checks[0](current_user={"role": "admin"})
    assert exc.value.status_code == 403
    assert role_checks[0](current_user={"role": "super_admin"}) == {"role": "super_admin"}
