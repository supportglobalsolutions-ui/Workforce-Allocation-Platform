'use client';

import { useMemo } from 'react';
import { Sigma } from 'lucide-react';
import { useMoneyDisplay } from '@/lib/money';

export interface PayTotalsRow {
  summary: {
    local_currency: string;
    final_net: string | number;
  } | null;
}

const num = (x: number) => x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One card: the month's total net pay in USD (each worker's pay converted at the Currencies page rate). */
export default function PayTotalsCards({ rows }: { rows: PayTotalsRow[] }) {
  const { usdRates } = useMoneyDisplay();

  const total = useMemo(() => {
    let sum = 0;
    const missing: string[] = [];
    for (const r of rows) {
      if (!r.summary) continue;
      const currency = (r.summary.local_currency || '').toUpperCase();
      const rate = usdRates[currency];
      if (!rate) { if (!missing.includes(currency)) missing.push(currency); continue; }
      sum += Number(r.summary.final_net ?? 0) / rate;
    }
    return { sum, missing, any: rows.some((r) => r.summary) };
  }, [rows, usdRates]);

  if (!total.any) return null;

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-emerald-accent/40 bg-emerald-accent/5 px-4 py-2.5 mb-3">
      <Sigma size={16} className="text-emerald-accent shrink-0" />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent">Total net · USD</p>
        <p className="text-lg font-bold text-emerald-accent tabular-nums">
          <span className="text-xs font-semibold mr-1">USD</span>{num(total.sum)}
        </p>
        {total.missing.length > 0 && (
          <p className="text-[10px] text-amber-400">Excludes {total.missing.join(', ')} — no exchange rate</p>
        )}
      </div>
    </div>
  );
}
