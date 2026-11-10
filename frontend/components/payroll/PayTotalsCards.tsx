'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMoneyDisplay } from '@/lib/money';

export interface PayTotalsRow {
  worker_country?: string;
  summary: {
    local_currency: string;
    final_net: string | number;
  } | null;
}

const num = (x: number) => x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One card: the month's total net pay in USD (each worker's pay converted at the Currencies page rate). */
export default function PayTotalsCards({ rows }: { rows: PayTotalsRow[] }) {
  const { usdRates } = useMoneyDisplay();
  const [currency, setCurrency] = useState('USD');
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const groups = useMemo(() => {
    const map = new Map<string, { country: string; currency: string; net: number; count: number }>();
    for (const row of rows) {
      if (!row.summary) continue;
      const country = row.worker_country || 'Unassigned';
      const local = row.summary.local_currency;
      const key = `${country}|${local}`;
      const group = map.get(key) || { country, currency: local, net: 0, count: 0 };
      group.net += Number(row.summary.final_net); group.count++;
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.country.localeCompare(b.country));
  }, [rows]);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const update = () => setEdges({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    const observer = new ResizeObserver(update);
    observer.observe(element); element.addEventListener('scroll', update); update();
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [groups]);

  const total = useMemo(() => {
    let sum = 0;
    const missing: string[] = [];
    for (const r of rows) {
      if (!r.summary) continue;
      const currency = (r.summary.local_currency || '').toUpperCase();
      const rate = currency === 'USD' ? 1 : usdRates[currency];
      if (!rate) { if (!missing.includes(currency)) missing.push(currency); continue; }
      sum += Number(r.summary.final_net ?? 0) / rate;
    }
    return { sum, missing, any: rows.some((r) => r.summary) };
  }, [rows, usdRates]);

  if (!total.any) return null;

  return (
    <div className="relative mb-3" id="finance-country-totals">
      {edges.left && <button type="button" aria-label="Scroll totals left" onClick={() => strip.current?.scrollBy({ left: -300, behavior: 'smooth' })} className="absolute left-0 top-5 z-10 rounded-full border border-theme bg-brand-card p-2 shadow"><ChevronLeft size={16} /></button>}
      <div ref={strip} className="flex gap-3 overflow-x-auto pb-2">
      {groups.map((group) => <div key={`${group.country}|${group.currency}`} className="shrink-0 w-64 rounded-xl border border-theme px-4 py-3">
        <p className="text-[10px] font-bold uppercase text-theme-muted">{group.country} · {group.count} worker{group.count === 1 ? '' : 's'}</p>
        <p className="mt-1 text-lg font-bold tabular-nums"><span className="mr-1 text-xs text-theme-muted">{group.currency}</span>{num(group.net)}</p>
        {(group.currency === 'USD' || usdRates[group.currency] > 0) ? <>
          <p className="text-xs text-emerald-accent">≈ USD {num(group.net / (group.currency === 'USD' ? 1 : usdRates[group.currency]))}</p>
          <p className="text-[10px] text-theme-muted">API: 1 USD = {(group.currency === 'USD' ? 1 : usdRates[group.currency]).toLocaleString(undefined, { maximumFractionDigits: 6 })} {group.currency}</p>
        </> : <p className="text-xs text-amber-500">API conversion unavailable</p>}
      </div>)}
      <div className="shrink-0 w-64 rounded-xl border border-emerald-accent/40 bg-emerald-accent/5 px-4 py-3">
        <label className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent">Total net · <select aria-label="Total currency" className="bg-transparent" value={currency} onChange={(event) => setCurrency(event.target.value)}><option>USD</option><option>GBP</option></select></label>
        <p className="text-lg font-bold text-emerald-accent tabular-nums">
          <span className="text-xs font-semibold mr-1">{currency}</span>{total.missing.length ? '—' : currency === 'USD' ? num(total.sum) : usdRates.GBP > 0 ? num(total.sum * usdRates.GBP) : '—'}
        </p>
        {usdRates.GBP > 0 && <p className="text-[10px] text-theme-muted">API rate: 1 GBP = {(1 / usdRates.GBP).toFixed(5)} USD</p>}
        {total.missing.length > 0 && (
          <p className="text-[10px] text-amber-400">Excludes {total.missing.join(', ')} — no exchange rate</p>
        )}
      </div>
      </div>
      {edges.right && <button type="button" aria-label="Scroll totals right" onClick={() => strip.current?.scrollBy({ left: 300, behavior: 'smooth' })} className="absolute right-0 top-5 z-10 rounded-full border border-theme bg-brand-card p-2 shadow"><ChevronRight size={16} /></button>}
    </div>
  );
}
