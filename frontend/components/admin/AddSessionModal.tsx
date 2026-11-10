'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { formatLocalAndUsd, useMoneyDisplay } from '@/lib/money';

interface SessionRate {
  currency: string;
  tier_rate: string | null;
  period_id: string | null;
  period_label: string | null;
  period_status: string | null;
}

interface Desktop { id: string; nickname: string; client_name?: string | null }
interface ClientOption { id: string; name: string }

interface WorkerTier {
  id: string;
  name: string;
  currency: string;
  rate: string | number;
  unit: string;
  hourly_equivalent: string | number | null;
  is_active?: boolean;
  applies_to?: string;
}

/**
 * Add a session for a worker by hand: it is closed and approved straight away
 * and paid at the worker's current rate or a rate typed for this session.
 * Bulk adds several at once (e.g. work done outside the system); the hours
 * typed are either the total across them or the hours of each one.
 */
export default function AddSessionModal({ workerId, workerName, onClose, onAdded }: {
  workerId: string;
  workerName: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [form, setForm] = useState({
    title: '', day: new Date().toISOString().slice(0, 10), hours: '', rateMode: 'worker' as 'worker' | 'typed', rate: '',
    tierId: '', client: '', desktop: '', note: '',
    mode: 'single' as 'single' | 'bulk', count: '', hoursAre: 'total' as 'total' | 'each',
  });
  const [rate, setRate] = useState<SessionRate | null>(null);
  const [rateLoading, setRateLoading] = useState(true);
  const [tiers, setTiers] = useState<WorkerTier[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [desktops, setDesktops] = useState<Desktop[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMoneyDisplay();

  useEffect(() => {
    api.get<ClientOption[]>('/clients')
      .then((list) => setClients([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setClients([]));
    api.get<Desktop[]>('/rdp').then((list) => setDesktops([...list].sort((a, b) => a.nickname.localeCompare(b.nickname)))).catch(() => undefined);
    api.get<WorkerTier[]>('/payment-tiers?scope=workers')
      .then((list) => setTiers(list.filter((t) => t.is_active !== false && t.hourly_equivalent != null)))
      .catch(() => setTiers([]));
  }, []);

  useEffect(() => {
    let current = true;
    setRate(null);
    if (!form.day) { setRateLoading(false); return; }
    setRateLoading(true);
    api.get<SessionRate>(`/workers/${workerId}/session-rate?on=${form.day}`)
      .then(value => { if (current) setRate(value); })
      .catch(() => { if (current) setRate(null); })
      .finally(() => { if (current) setRateLoading(false); });
    return () => { current = false; };
  }, [workerId, form.day]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const set = (key: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: ev.target.value }));

  const closed = rate?.period_status === 'approved' || rate?.period_status === 'paid';
  const bulk = form.mode === 'bulk';
  const count = bulk ? Math.max(0, Math.floor(Number(form.count) || 0)) : 1;
  const typedHours = Number(form.hours) || 0;
  const hours = bulk && form.hoursAre === 'each' ? typedHours * count : typedHours;
  const needsTierPick = !rateLoading && rate?.tier_rate == null;
  const selectedTier = tiers.find((t) => t.id === form.tierId) ?? null;
  const tierHourly = selectedTier?.hourly_equivalent != null ? Number(selectedTier.hourly_equivalent) : 0;
  const unitRate = form.rateMode === 'typed'
    ? Number(form.rate) || 0
    : needsTierPick
      ? tierHourly
      : Number(rate?.tier_rate ?? 0);
  const payCurrency = form.rateMode === 'worker' && needsTierPick && selectedTier
    ? selectedTier.currency
    : (rate?.currency ?? '…');
  const fmt = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tierOptions = rate?.currency
    ? [...tiers].sort((a, b) => {
        const aMatch = a.currency === rate.currency ? 0 : 1;
        const bMatch = b.currency === rate.currency ? 0 : 1;
        return aMatch - bMatch || a.name.localeCompare(b.name);
      })
    : [...tiers].sort((a, b) => a.name.localeCompare(b.name));

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (form.rateMode === 'typed' && form.rate === '') { setError('Type the rate, or select Use rate.'); return; }
    if (form.rateMode === 'worker' && needsTierPick && !selectedTier) {
      setError('Pick a tier, or type a rate.');
      return;
    }
    if (form.rateMode === 'worker' && rateLoading) { setError('Still loading the worker rate.'); return; }
    if (!form.client) { setError('Pick the client this work was for.'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: form.title.trim(),
        day: form.day,
        hours: typedHours,
        rate: form.rateMode === 'typed'
          ? Number(form.rate)
          : needsTierPick
            ? tierHourly
            : null,
        client_id: form.client,
        rdp_resource_id: form.desktop || null,
        note: form.note.trim() || null,
      };
      if (bulk) await api.post(`/workers/${workerId}/sessions/bulk`, { ...body, count, hours_are: form.hoursAre });
      else await api.post(`/workers/${workerId}/sessions`, body);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the session.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1.5 block';
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true"
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <form onSubmit={save} className="glass-modal w-full max-w-lg rounded-2xl overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06]">
          <div>
            <p className="text-base font-bold text-theme-heading">{bulk ? 'Add sessions in bulk' : 'Add session'}</p>
            <p className="text-xs text-theme-muted mt-0.5">{workerName} · approved straight away, marked “Added by admin”</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="inline-flex rounded-xl border border-white/[0.08] p-0.5" role="group" aria-label="Single or bulk">
            {(['single', 'bulk'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setForm((f) => ({ ...f, mode: m }))} aria-pressed={form.mode === m}
                className={`px-3 py-1 text-xs font-semibold rounded-lg ${form.mode === m ? 'bg-white/10 text-theme-heading' : 'text-theme-muted hover:text-theme-heading'}`}>
                {m === 'single' ? 'Single' : 'Bulk'}
              </button>
            ))}
          </div>
          <label className="block">
            <span className={label}>{bulk ? 'Description' : 'Title'}</span>
            <input required maxLength={160} value={form.title} onChange={set('title')}
              placeholder={bulk ? 'e.g. Sessions done outside the system' : 'e.g. Training day, catch-up work'} className="input-field w-full" />
          </label>
          {bulk ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className={label}>Date</span>
                  <input required type="date" value={form.day} onChange={set('day')} className="input-field w-full" />
                </label>
                <label className="block">
                  <span className={label}>Sessions</span>
                  <input required type="number" min={1} max={200} step={1} value={form.count} onChange={set('count')} className="input-field w-full tabular-nums" />
                </label>
                <label className="block">
                  <span className={label}>Hours</span>
                  <input required type="number" min={0.25} step="0.25" max={form.hoursAre === 'each' ? 24 : undefined} value={form.hours} onChange={set('hours')} className="input-field w-full tabular-nums" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-theme-heading cursor-pointer">
                  <input type="radio" checked={form.hoursAre === 'total'} onChange={() => setForm((f) => ({ ...f, hoursAre: 'total' }))} />
                  Total for all sessions
                </label>
                <label className="flex items-center gap-1.5 text-sm text-theme-heading cursor-pointer">
                  <input type="radio" checked={form.hoursAre === 'each'} onChange={() => setForm((f) => ({ ...f, hoursAre: 'each' }))} />
                  Per session
                </label>
              </div>
              {count > 0 && typedHours > 0 && (
                <p className="text-[11px] text-theme-muted">
                  {form.hoursAre === 'each'
                    ? `${count} sessions × ${fmt(typedHours)} h = ${fmt(hours)} h added to active hours.`
                    : `${count} sessions, ${fmt(hours)} h in total (about ${fmt(hours / count)} h each) added to active hours.`}
                </p>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={label}>Date</span>
                <input required type="date" value={form.day} onChange={set('day')} className="input-field w-full" />
              </label>
              <label className="block">
                <span className={label}>Hours</span>
                <input required type="number" min={0.25} max={24} step="0.25" value={form.hours} onChange={set('hours')} className="input-field w-full tabular-nums" />
              </label>
            </div>
          )}
          {rate?.period_label && (
            <p className={`text-[11px] ${closed ? 'text-danger' : 'text-theme-muted'}`}>
              Counts in {rate.period_label}{closed ? `, which is ${rate.period_status}; reopen it first.` : '.'}
            </p>
          )}
          <div>
            <span className={label}>Rate ({payCurrency} per hour)</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-theme-heading cursor-pointer">
                <input type="radio" checked={form.rateMode === 'worker'} onChange={() => setForm((f) => ({ ...f, rateMode: 'worker' }))} />
                Use rate{rateLoading ? ' (loading…)' : rate?.tier_rate != null ? ` (${rate.currency} ${fmt(Number(rate.tier_rate))}/hour)` : ' (not set)'}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-theme-heading cursor-pointer">
                <input type="radio" checked={form.rateMode === 'typed'} onChange={() => setForm((f) => ({ ...f, rateMode: 'typed' }))} />
                Typed
              </label>
              {form.rateMode === 'typed' && (
                <input type="number" min={0} step="0.01" value={form.rate} onChange={set('rate')} aria-label="Rate per hour"
                  className="input-field !py-1.5 w-28 tabular-nums" />
              )}
            </div>
            {form.rateMode === 'worker' && needsTierPick && (
              <label className="block mt-2">
                <span className={label}>Tier</span>
                <select
                  required
                  value={form.tierId}
                  onChange={set('tierId')}
                  className="input-field w-full"
                  aria-label="Pick a payment tier"
                >
                  <option value="">Select a tier…</option>
                  {tierOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.currency} {fmt(Number(t.hourly_equivalent))}/hour
                    </option>
                  ))}
                </select>
                {tierOptions.length === 0 && (
                  <span className="mt-1 block text-[11px] text-theme-muted">No active worker tiers. Add one under Payroll → Tiers, or type a rate.</span>
                )}
              </label>
            )}
            {hours > 0 && unitRate > 0 && (
              <p className="mt-1 text-[11px] text-theme-muted">
                Pay: {fmt(hours)} h × {fmt(unitRate)} = {formatLocalAndUsd(hours * unitRate, payCurrency)}
              </p>
            )}
          </div>
          <label className="block">
            <span className={label}>Client</span>
            <select required value={form.client} onChange={set('client')} className="input-field w-full">
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-theme-muted">
              Required. Hours count toward this client&apos;s expected income (hours × account rate).
            </span>
          </label>
          <label className="block">
            <span className={label}>Account / desktop (optional)</span>
            <select value={form.desktop} onChange={set('desktop')} className="input-field w-full">
              <option value="">No desktop</option>
              {desktops.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nickname}{d.client_name ? ` · ${d.client_name}` : ''}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-theme-muted">
              Optional. For Hours Log / machine tracking only — income follows the client above.
            </span>
          </label>
          <label className="block">
            <span className={label}>Note (optional)</span>
            <textarea rows={2} maxLength={2000} value={form.note} onChange={set('note')} className="input-field w-full" />
          </label>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs"><AlertCircle size={14} /> {error}</div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 pt-4 border-t border-white/[0.06]">
          <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
          <button
            type="submit"
            disabled={saving || closed || rateLoading || !form.client || (form.rateMode === 'worker' && needsTierPick && !form.tierId) || (form.rateMode === 'typed' && form.rate === '')}
            className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
          >
            {saving ? <SpinningDots size="sm" /> : <Check size={14} />} {bulk ? `Add ${count || ''} sessions` : 'Add session'}
          </button>
        </div>
      </form>
    </div>
  );
}
