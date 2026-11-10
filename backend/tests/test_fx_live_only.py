from decimal import Decimal

from services import fx


def test_screenshot_country_totals_reconcile(monkeypatch):
    # Captured API response: regression fixture, not a hard-coded production rate.
    rates = {'USD': Decimal('1'), 'KES': Decimal('129.641415'), 'RWF': Decimal('1477.829021'), 'UGX': Decimal('3981.202747'), 'GBP': Decimal('0.756516')}
    monkeypatch.setattr(fx, 'live_usd_rates', lambda: rates)
    amounts = {'KES': Decimal('39750'), 'RWF': Decimal('191250'), 'UGX': Decimal('1091250')}
    total = sum(fx.convert_amount(None, amount, code, 'USD')[0] for code, amount in amounts.items())
    assert total.quantize(Decimal('0.01')) == Decimal('710.13')
    gbp = fx.convert_amount(None, total, 'USD', 'GBP')[0]
    assert gbp.quantize(Decimal('0.01')) == Decimal('537.22')


def test_live_quotes_override_manual_snapshot(monkeypatch):
    monkeypatch.setattr(fx, 'live_usd_rates', lambda: {'USD': Decimal('1'), 'GBP': Decimal('0.8'), 'KES': Decimal('100')})
    snapshot = {('GBP', 'USD'): (Decimal('9'), 'manual')}
    assert fx.resolve_rate(None, 'GBP', 'USD', snapshot) == (Decimal('1.25'), 'api')
    assert fx.convert_amount(None, Decimal('525'), 'GBP', 'USD')[0] == Decimal('656.25')
    assert fx.resolve_rate(None, 'KES', 'GBP')[0] == Decimal('0.008')


def test_api_failure_does_not_fall_back_to_stored_rates(monkeypatch):
    def fail():
        raise RuntimeError('offline')
    monkeypatch.setattr(fx, 'live_usd_rates', fail)
    assert fx.resolve_rate(None, 'USD', 'GBP', {('USD', 'GBP'): (Decimal('0.7'), 'manual')}) == (None, None)
    assert fx.ensure_rate(None, 'USD', 'GBP') is None
    assert fx.resolve_rate(None, 'USD', 'USD') == (Decimal('1'), 'identity')


def test_cache_reuses_recent_quotes_and_rejects_expired_failure(monkeypatch):
    monkeypatch.setattr(fx, '_live_usd_rates', {})
    monkeypatch.setattr(fx, '_live_loaded_at', 0)
    clock = [1000]
    monkeypatch.setattr(fx, 'monotonic', lambda: clock[0])
    calls = []
    def fetch(_base):
        calls.append(True)
        if len(calls) > 1:
            raise RuntimeError('offline')
        return {'GBP': Decimal('0.8')}
    monkeypatch.setattr(fx, 'fetch_latest_rates', fetch)
    assert fx.resolve_rate(None, 'USD', 'GBP')[0] == Decimal('0.8')
    assert fx.resolve_rate(None, 'GBP', 'USD')[0] == Decimal('1.25')
    assert len(calls) == 1
    clock[0] += fx.LIVE_RATE_TTL_SECONDS + 1
    assert fx.resolve_rate(None, 'USD', 'GBP') == (None, None)
