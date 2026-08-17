'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export interface CurrencyOption {
  id: string;
  code: string;
  name: string;
  symbol: string | null;
  is_active: boolean;
  usd_rate: number | null;
  gbp_rate: number | null;
}

/**
 * Active payout currencies from the admin catalog, for pay-currency dropdowns.
 * Falls back to an empty list so a dropdown can still show the row's own value.
 */
export function useCurrencies() {
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  useEffect(() => {
    api.get<CurrencyOption[]>('/currencies/list?active_only=true')
      .then(setCurrencies)
      .catch(() => setCurrencies([]));
  }, []);

  return currencies;
}

/** Currency codes for a dropdown, guaranteeing `current` is present. */
export function currencyCodes(currencies: CurrencyOption[], current?: string | null): string[] {
  const codes = currencies.map((c) => c.code);
  if (current && !codes.includes(current)) codes.unshift(current);
  return codes;
}
