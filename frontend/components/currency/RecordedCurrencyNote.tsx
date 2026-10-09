'use client';

import { Info } from 'lucide-react';
import { useMoneyDisplay } from '@/lib/money';

/**
 * Shown on entry sheets while a top-bar display currency is chosen: typed and
 * calculated amounts stay in their recorded currency here so a row never mixes
 * two currencies. Reports, dashboards and payroll views do convert.
 */
export default function RecordedCurrencyNote({ recorded }: { recorded?: string }) {
  const { display } = useMoneyDisplay();
  if (!display || (recorded && recorded.toUpperCase() === display)) return null;
  return (
    <p className="mb-3 flex items-start gap-1.5 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-[11px] text-sky-200">
      <Info size={12} className="mt-0.5 shrink-0" />
      <span>
        This is an entry sheet, so amounts stay in {recorded ? recorded.toUpperCase() : 'their recorded currency'} for
        typing. Your {display} display applies on payroll, reports, wallets and dashboards.
      </span>
    </p>
  );
}
