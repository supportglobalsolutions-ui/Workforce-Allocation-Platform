'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { AuthRole } from '@/lib/auth/config';
import type { CurrencyOption } from '@/lib/currencies';
import { setDisplayCurrency, setDisplayEnabled, setUsdRates } from '@/lib/money';

const STAFF_ROLES: AuthRole[] = ['admin', 'executive', 'super_admin'];

/** Load USD rates from the Currencies page (used by the Finance total card). */
async function refreshCatalog(): Promise<void> {
  try {
    const rows = await api.get<CurrencyOption[]>('/currencies/list');
    const rates: Record<string, number> = {};
    for (const c of rows) {
      const r = Number(c.usd_rate);
      if (Number.isFinite(r) && r > 0) rates[c.code.toUpperCase()] = r;
    }
    setUsdRates(rates);
  } catch {
    /* rates unavailable — amounts stay in their recorded currency */
  }
}

function isStaffPortal(pathname: string | null): boolean {
  return !!pathname && (pathname.startsWith('/admin') || pathname.startsWith('/leadership'));
}

/** Loads exchange rates for staff in the admin and leadership portals. */
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
    // The top-bar switch was removed: clear any old choice so nothing stays converted.
    // Totals pick USD / GBP on the Finance total card instead.
    setDisplayCurrency(null);
    void refreshCatalog();
  }, [isStaff, session, loadedFor]);

  return null;
}
