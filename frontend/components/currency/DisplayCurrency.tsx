'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Coins } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { AuthRole } from '@/lib/auth/config';
import type { CurrencyOption } from '@/lib/currencies';
import {
  readStoredDisplayCurrency,
  setDisplayCurrency,
  setDisplayEnabled,
  setUsdRates,
  useMoneyDisplay,
} from '@/lib/money';

const STAFF_ROLES: AuthRole[] = ['admin', 'executive', 'super_admin'];
const PINNED = ['USD', 'GBP'];

let catalog: CurrencyOption[] = [];
const catalogListeners = new Set<(c: CurrencyOption[]) => void>();

async function refreshCatalog(): Promise<void> {
  try {
    const rows = await api.get<CurrencyOption[]>('/currencies/list');
    catalog = rows;
    const rates: Record<string, number> = {};
    for (const c of rows) {
      const r = Number(c.usd_rate);
      if (Number.isFinite(r) && r > 0) rates[c.code.toUpperCase()] = r;
    }
    setUsdRates(rates);
    catalogListeners.forEach((l) => l(rows));
  } catch {
    /* rates unavailable — amounts stay in their recorded currency */
  }
}

function isStaffPortal(pathname: string | null): boolean {
  return !!pathname && (pathname.startsWith('/admin') || pathname.startsWith('/leadership'));
}

/** Turns conversion on for staff in the admin and leadership portals and loads rates. */
export function DisplayCurrencySync() {
  const { session } = useAuth();
  const pathname = usePathname();
  const isStaff = !!session && STAFF_ROLES.includes(session.authRole);
  const enabled = isStaff && isStaffPortal(pathname);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    setDisplayEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!isStaff || !session || loadedFor === session.uid) return;
    setLoadedFor(session.uid);
    setDisplayCurrency(readStoredDisplayCurrency());
    void refreshCatalog();
  }, [isStaff, session, loadedFor]);

  return null;
}

/** Top-bar control: show every amount on the site in one chosen currency. */
export function DisplayCurrencySwitcher() {
  const { display, enabled } = useMoneyDisplay();
  const [open, setOpen] = useState(false);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>(catalog);

  useEffect(() => {
    catalogListeners.add(setCurrencies);
    return () => { catalogListeners.delete(setCurrencies); };
  }, []);

  const toggle = useCallback(() => {
    setOpen((o) => {
      if (!o) void refreshCatalog();
      return !o;
    });
  }, []);

  const options = useMemo(() => {
    const active = currencies.filter((c) => c.is_active);
    const byCode = new Map(active.map((c) => [c.code.toUpperCase(), c]));
    const pinned = PINNED.map((code) => ({
      code,
      name: byCode.get(code)?.name ?? (code === 'USD' ? 'US Dollar' : 'British Pound'),
    }));
    const rest = active
      .filter((c) => !PINNED.includes(c.code.toUpperCase()))
      .map((c) => ({ code: c.code.toUpperCase(), name: c.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...pinned, ...rest];
  }, [currencies]);

  if (!enabled) return null;

  function choose(code: string | null) {
    setDisplayCurrency(code);
    setOpen(false);
  }

  const itemClass = (selected: boolean) =>
    `w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md text-left text-sm transition-colors ${
      selected ? 'text-gold-accent font-semibold' : 'text-theme-heading hover:bg-white/[0.05]'
    }`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Show money in"
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all ${
          display
            ? 'border-gold-accent/40 bg-gold-accent/10 text-gold-accent'
            : 'border-theme text-theme-muted hover:text-theme-heading hover:border-gold-accent/40 hover:bg-white/[0.04]'
        }`}
      >
        <Coins size={15} className="shrink-0" />
        <span className="text-xs font-bold">{display ?? 'Default'}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close currency menu"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute top-[calc(100%+6px)] right-0 w-52 max-h-80 overflow-y-auto bg-brand-card border border-theme rounded-lg shadow-xl p-1 z-50"
          >
            <button type="button" role="option" aria-selected={!display} onClick={() => choose(null)} className={itemClass(!display)}>
              Default
              {!display && <Check size={14} />}
            </button>
            {options.map((o) => (
              <button key={o.code} type="button" role="option" aria-selected={display === o.code} onClick={() => choose(o.code)} className={itemClass(display === o.code)}>
                <span className="truncate">{o.name}</span>
                {display === o.code && <Check size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
