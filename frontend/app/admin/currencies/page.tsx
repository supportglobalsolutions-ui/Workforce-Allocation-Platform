'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Coins, Globe, Pencil, Plus, RefreshCw, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Country {
  id: string;
  name: string;
  currency_code: string;
  is_active: boolean;
  created_at: string;
}

interface FxRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: number;
  source: 'manual' | 'api';
  as_of_date: string;
  created_at: string;
}

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  is_active: boolean;
  usd_rate: number | null;
  usd_rate_source: 'manual' | 'api' | 'identity' | 'derived' | null;
  gbp_rate: number | null;
  created_at: string;
}

type BaseCurrency = 'USD' | 'GBP';

const fmtRate = (x: number) =>
  Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Small currencies like GBP sit below 1, so keep enough precision to be readable. */
const fmtExchange = (x: number | null) => {
  if (x === null || x === undefined) return '—';
  const n = Number(x);
  const digits = n !== 0 && Math.abs(n) < 10 ? 4 : 2;
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

function SourceChip({ source }: { source: 'manual' | 'api' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
      source === 'manual'
        ? 'bg-gold-accent/20 text-gold-accent border-gold-accent/30'
        : 'bg-white/10 text-theme-muted border-white/10'
    }`}>
      {source}
    </span>
  );
}

// ── Currency catalog panel ─────────────────────────────────────────────────────

function RateSourceChip({ source }: { source: Currency['usd_rate_source'] }) {
  if (!source || source === 'identity') return null;
  const styles: Record<string, string> = {
    manual:  'bg-gold-accent/20 text-gold-accent border-gold-accent/30',
    api:     'bg-white/10 text-theme-muted border-white/10',
    derived: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${styles[source]}`}>
      {source}
    </span>
  );
}

function CurrenciesPanel({ onChanged }: { onChanged: () => void }) {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', usd_rate: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<Currency[]>('/currencies/list')
      .then(setCurrencies)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load currencies'));
  }, []);

  useEffect(load, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post<Currency>('/currencies/list', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        ...(form.usd_rate !== '' ? { usd_rate: Number(form.usd_rate) } : {}),
      });
      setForm({ code: '', name: '', usd_rate: '' });
      setShowAdd(false);
      load();
      onChanged();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to add currency.');
    } finally {
      setSaving(false);
    }
  }

  async function saveRate(c: Currency) {
    setRowBusy(c.id);
    setError(null);
    try {
      await api.patch<Currency>(`/currencies/list/${c.id}`, { usd_rate: Number(editRate) });
      setEditingId(null);
      load();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save rate.');
    } finally {
      setRowBusy(null);
    }
  }

  async function toggleActive(c: Currency) {
    setRowBusy(c.id);
    try {
      await api.patch<Currency>(`/currencies/list/${c.id}`, { is_active: !c.is_active });
      load();
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update currency.');
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-theme-heading flex items-center gap-2">
            <Coins size={13} className="text-gold-accent" /> Currencies
          </h2>
          <p className="text-[11px] text-theme-muted mt-0.5">
            Every rate is <strong>1 USD = x</strong>. GBP is one of these rows, so the GBP column is worked out from it automatically.
          </p>
        </div>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <Plus size={12} /> Add Currency
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-end gap-3 bg-white/[0.02]">
          <div className="w-24">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Code</label>
            <input required minLength={3} maxLength={3} value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="UGX" className="input-field uppercase" />
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Name</label>
            <input required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ugandan Shilling" className="input-field" />
          </div>
          <div className="w-40">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Rate (1 USD =)</label>
            <input type="number" step="any" min={0} value={form.usd_rate}
              onChange={(e) => setForm((f) => ({ ...f, usd_rate: e.target.value }))}
              placeholder="3750" className="input-field" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
            {saving ? 'Adding…' : 'Add'}
          </button>
          {formError && <p className="w-full text-xs text-danger">{formError}</p>}
        </form>
      )}

      {error && <p className="text-danger text-sm px-4 py-3 flex items-center gap-2"><AlertCircle size={14} /> {error}</p>}

      {currencies === null ? (
        <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {['Code', 'Name', '1 USD =', '1 GBP =', 'Active'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currencies.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-theme-muted">No currencies yet.</td></tr>
              )}
              {currencies.map((c) => {
                const isUsd = c.code === 'USD';
                const editing = editingId === c.id;
                return (
                  <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-theme-heading">{c.code}</td>
                    <td className="px-4 py-2.5 text-theme-heading">{c.name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {isUsd ? (
                        <span className="text-theme-muted">1.00 (base)</span>
                      ) : editing ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input type="number" step="any" min={0} autoFocus value={editRate}
                            onChange={(e) => setEditRate(e.target.value)}
                            className="input-field !py-1 !px-2 w-28 text-sm" />
                          <button type="button" disabled={rowBusy === c.id || editRate === ''} onClick={() => saveRate(c)}
                            title="Save rate"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-emerald-accent hover:bg-emerald-accent/10 disabled:opacity-40">
                            {rowBusy === c.id ? <SpinningDots size="sm" /> : <Check size={13} />}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} title="Cancel"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading">
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="font-bold tabular-nums text-theme-heading">{fmtExchange(c.usd_rate)}</span>
                          <RateSourceChip source={c.usd_rate_source} />
                          <button type="button"
                            onClick={() => { setEditingId(c.id); setEditRate(c.usd_rate != null ? String(c.usd_rate) : ''); }}
                            title="Edit rate"
                            className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5">
                            <Pencil size={12} />
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-theme-muted whitespace-nowrap">{fmtExchange(c.gbp_rate)}</td>
                    <td className="px-4 py-2.5">
                      <button type="button" disabled={rowBusy === c.id} onClick={() => toggleActive(c)}
                        title="Click to toggle"
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                          c.is_active
                            ? 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30 hover:bg-emerald-accent/30'
                            : 'bg-white/10 text-theme-muted border-white/10 hover:bg-white/20'
                        }`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Countries panel ────────────────────────────────────────────────────────────

function CountriesPanel() {
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = () => {
    api.get<Country[]>('/currencies/countries')
      .then(setCountries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load countries'));
  };

  useEffect(load, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post<Country>('/currencies/countries', {
        name: name.trim(),
        currency_code: code.trim().toUpperCase(),
      });
      setName(''); setCode(''); setShowAdd(false);
      load();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to add country.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Country) {
    setTogglingId(c.id);
    try {
      await api.patch<Country>(`/currencies/countries/${c.id}`, { is_active: !c.is_active });
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update country.');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <h2 className="text-xs font-bold uppercase tracking-wider text-theme-heading flex items-center gap-2">
          <Globe size={13} className="text-emerald-accent" /> Countries
        </h2>
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          <Plus size={12} /> Add Country
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-end gap-3 bg-white/[0.02]">
          <div className="flex-1 min-w-[10rem]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Country name</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kenya" className="input-field" />
          </div>
          <div className="w-28">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Code</label>
            <input required minLength={3} maxLength={3} value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="KES" className="input-field uppercase" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
            {saving ? 'Adding…' : 'Add'}
          </button>
          {formError && <p className="w-full text-xs text-danger">{formError}</p>}
        </form>
      )}

      {error && <p className="text-danger text-sm px-4 py-3">{error}</p>}

      {countries === null ? (
        <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {['Country', 'Currency', 'Active', 'Created'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countries.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-theme-muted">No countries yet.</td></tr>
              )}
              {countries.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.currency_code}</td>
                  <td className="px-4 py-3">
                    <button type="button" disabled={togglingId === c.id} onClick={() => toggleActive(c)}
                      title="Click to toggle"
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors disabled:opacity-50 ${
                        c.is_active
                          ? 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30 hover:bg-emerald-accent/30'
                          : 'bg-white/10 text-white/50 border-white/10 hover:bg-white/20'
                      }`}>
                      {togglingId === c.id ? '…' : c.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted">
                    {new Date(c.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── FX rates panel ─────────────────────────────────────────────────────────────

interface QuoteGroup {
  quote: string;
  manual: FxRate | null;
  api: FxRate | null;
}

function FxRatesPanel({ countries }: { countries: Country[] }) {
  const [base, setBase] = useState<BaseCurrency>('USD');
  const [rates, setRates] = useState<FxRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [quote, setQuote] = useState('');
  const [rateValue, setRateValue] = useState('');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const load = (b: BaseCurrency) => {
    setRates(null);
    setError(null);
    api.get<FxRate[]>(`/currencies/rates?base=${b}`)
      .then(setRates)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load rates'));
  };

  useEffect(() => load(base), [base]);

  // Latest rate per (quote, source); rows arrive newest-first.
  const groups: QuoteGroup[] = useMemo(() => {
    if (!rates) return [];
    const map = new Map<string, QuoteGroup>();
    for (const r of rates) {
      let g = map.get(r.quote_currency);
      if (!g) {
        g = { quote: r.quote_currency, manual: null, api: null };
        map.set(r.quote_currency, g);
      }
      if (r.source === 'manual' && !g.manual) g.manual = r;
      if (r.source === 'api' && !g.api) g.api = r;
    }
    return Array.from(map.values()).sort((a, b) => a.quote.localeCompare(b.quote));
  }, [rates]);

  const currencyCodes = useMemo(
    () => Array.from(new Set(countries.map((c) => c.currency_code))).sort(),
    [countries],
  );

  async function handleAddRate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post<FxRate>('/currencies/rates', {
        base_currency: base,
        quote_currency: quote.trim().toUpperCase(),
        rate: Number(rateValue),
        source: 'manual',
        as_of_date: asOf,
      });
      setQuote(''); setRateValue(''); setShowAdd(false);
      load(base);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : 'Failed to add rate.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshMsg(null);
    setError(null);
    try {
      const res = await api.post<{ stored: { USD: number; GBP: number } }>('/currencies/rates/refresh', {});
      setRefreshMsg(`Stored ${res.stored.USD} USD and ${res.stored.GBP} GBP rates from the API.`);
      load(base);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to refresh rates.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-theme-heading">FX Rates</h2>
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
            {(['USD', 'GBP'] as BaseCurrency[]).map((b) => (
              <button key={b} type="button" onClick={() => setBase(b)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  base === b ? 'bg-emerald-accent/20 text-emerald-400' : 'text-theme-muted hover:text-white'
                }`}>
                {b}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowAdd((v) => !v)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
            <Plus size={12} /> Manual Rate
          </button>
          <button type="button" disabled={refreshing} onClick={handleRefresh}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-60">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh from API
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={handleAddRate} className="px-4 py-3 border-b border-white/[0.06] flex flex-wrap items-end gap-3 bg-white/[0.02]">
          <div className="w-36">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Quote currency</label>
            <input required list="fx-quote-codes" minLength={3} maxLength={3} value={quote}
              onChange={(e) => setQuote(e.target.value.toUpperCase())} placeholder="KES" className="input-field uppercase" />
            <datalist id="fx-quote-codes">
              {currencyCodes.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="w-36">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Rate (1 {base} =)</label>
            <input required type="number" step="any" min={0} value={rateValue}
              onChange={(e) => setRateValue(e.target.value)} placeholder="129.50" className="input-field" />
          </div>
          <div className="w-40">
            <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">As-of date</label>
            <input required type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="input-field" />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save manual rate'}
          </button>
          {formError && <p className="w-full text-xs text-danger">{formError}</p>}
        </form>
      )}

      {refreshMsg && (
        <p className="px-4 py-2 text-xs text-emerald-accent bg-emerald-accent/5 border-b border-white/[0.06]">{refreshMsg}</p>
      )}
      {error && (
        <p className="px-4 py-3 text-sm text-danger flex items-center gap-2"><AlertCircle size={14} /> {error}</p>
      )}

      {rates === null && !error ? (
        <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
      ) : rates !== null && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  {['Quote', 'Effective Rate', 'Source', 'As of', 'Other Source'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-theme-muted">No rates for {base} yet. Refresh from the API or add a manual rate.</td></tr>
                )}
                {groups.map((g) => {
                  // A manual rate always overrides the API rate.
                  const effective = g.manual ?? g.api;
                  const other = g.manual ? g.api : null;
                  if (!effective) return null;
                  return (
                    <tr key={g.quote} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-white font-bold">{g.quote}</td>
                      <td className={`px-4 py-3 font-bold ${effective.source === 'manual' ? 'text-gold-accent' : 'text-white'}`}>
                        {fmtRate(effective.rate)}
                      </td>
                      <td className="px-4 py-3"><SourceChip source={effective.source} /></td>
                      <td className="px-4 py-3 text-xs text-theme-muted">{effective.as_of_date}</td>
                      <td className="px-4 py-3 text-xs text-theme-muted">
                        {other ? (
                          <span className="inline-flex items-center gap-1.5">
                            api {fmtRate(other.rate)} <span className="opacity-60">({other.as_of_date})</span>
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-white/[0.06]">
            <button type="button" onClick={() => setShowHistory((v) => !v)}
              className="w-full px-4 py-2.5 text-xs text-theme-muted hover:text-white transition-colors flex items-center justify-center gap-1.5">
              {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showHistory ? 'Hide rate history' : `Show rate history (${rates.length} rows)`}
            </button>
            {showHistory && (
              <div className="overflow-x-auto border-t border-white/[0.06]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      {['Quote', 'Rate', 'Source', 'As of', 'Recorded'].map((h) => (
                        <th key={h} className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-theme-muted">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((r) => (
                      <tr key={r.id} className="border-b border-white/[0.03]">
                        <td className="px-4 py-2 font-mono text-xs">{r.quote_currency}</td>
                        <td className="px-4 py-2 text-xs">{fmtRate(r.rate)}</td>
                        <td className="px-4 py-2"><SourceChip source={r.source} /></td>
                        <td className="px-4 py-2 text-xs text-theme-muted">{r.as_of_date}</td>
                        <td className="px-4 py-2 text-xs text-theme-muted">{new Date(r.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CurrenciesPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    api.get<Country[]>('/currencies/countries').then(setCountries).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Currencies & FX Rates"
        description="USD is the base currency and GBP is quoted against it. Every payout currency converts from USD or GBP, never the other way. Manual entries override API rates, and rates are frozen per payslip on pay day."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />
      <div className="space-y-6">
        <CurrenciesPanel onChanged={() => setReloadKey((k) => k + 1)} />
        <CountriesPanel />
        <FxRatesPanel key={reloadKey} countries={countries} />
      </div>
    </div>
  );
}
