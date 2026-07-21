'use client';

import { useState } from 'react';
import { AlertCircle, ChevronDown, Plus, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

export interface WorkPeriodCreated {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: string;
  status: string;
  wallet_pushed_at: string | null;
  paid_at: string | null;
  created_at: string;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKeyFromDate(iso: string): string {
  return iso.slice(0, 7);
}

function labelFromMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function boundsForMonth(ym: string): { start: string; end: string; label: string } {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  return { start: toISODate(start), end: toISODate(end), label: labelFromMonthKey(ym) };
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">{label}</label>
      {children}
    </div>
  );
}

export default function NewWorkPeriodModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (p: WorkPeriodCreated) => void;
}) {
  const initial = boundsForMonth(currentMonthKey());
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [customDates, setCustomDates] = useState(false);
  const [label, setLabel] = useState(initial.label);
  const [labelTouched, setLabelTouched] = useState(false);
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [currency, setCurrency] = useState<'USD' | 'GBP'>('USD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyMonth(ym: string, keepCustomRange: boolean) {
    const b = boundsForMonth(ym);
    setMonthKey(ym);
    if (!keepCustomRange) {
      setStartDate(b.start);
      setEndDate(b.end);
    }
    if (!labelTouched) setLabel(b.label);
  }

  function handleMonthChange(ym: string) {
    applyMonth(ym, customDates);
  }

  function handleToggleCustom(next: boolean) {
    setCustomDates(next);
    if (!next) {
      const b = boundsForMonth(monthKey);
      setStartDate(b.start);
      setEndDate(b.end);
      if (!labelTouched) setLabel(b.label);
    }
  }

  function handleStartChange(iso: string) {
    setStartDate(iso);
    const ym = monthKeyFromDate(iso);
    setMonthKey(ym);
    if (!labelTouched) setLabel(labelFromMonthKey(ym));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<WorkPeriodCreated>('/payroll/periods', {
        label: label.trim() || labelFromMonthKey(monthKey),
        start_date: startDate,
        end_date: endDate,
        currency,
        status: 'open',
      });
      onCreated(created);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create work period.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-theme-heading">New work period</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Defaults to a full calendar month. Use custom dates if pay runs across month boundaries.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-theme-heading hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
          <Field label="Work period month">
            <input
              type="month"
              required
              value={monthKey}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="input-field"
            />
            <p className="text-[10px] text-theme-muted mt-1.5 leading-snug">
              Name defaults to this month (from the start date). You can edit the label below.
            </p>
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={customDates}
              onChange={(e) => handleToggleCustom(e.target.checked)}
              className="accent-emerald-400"
            />
            <span className="text-[13px] text-white">Custom date range</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date">
              <input
                type="date"
                required
                value={startDate}
                disabled={!customDates}
                onChange={(e) => handleStartChange(e.target.value)}
                className="input-field disabled:opacity-60"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                required
                value={endDate}
                disabled={!customDates}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-field disabled:opacity-60"
              />
            </Field>
          </div>

          <Field label="Label">
            <input
              required
              value={label}
              onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
              placeholder="e.g. May 2026"
              className="input-field"
            />
          </Field>

          <Field label="Reporting currency">
            <div className="relative">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'USD' | 'GBP')}
                className="input-field appearance-none pr-8"
              >
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
            </div>
          </Field>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
              {saving ? <SpinningDots size="sm" /> : <Plus size={14} />} Create work period
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
