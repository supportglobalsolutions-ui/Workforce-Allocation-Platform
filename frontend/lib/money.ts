'use client';

import { useSyncExternalStore } from 'react';

/**
 * Display-currency layer. Money is always stored in the currency it was
 * recorded in (USD / GBP reporting bases, local payout currencies). An admin
 * may pick a display currency in the top bar; every amount formatted through
 * this module is then converted to it at the catalog rate for viewing only.
 *
 * Kept as a module store rather than React context so page-level helpers
 * defined outside components can format money too. Components that render
 * money call `useMoneyDisplay()` once so they re-render when the choice or the
 * rates change.
 */

export const DISPLAY_CURRENCY_STORAGE_KEY = 'gs-display-currency';

interface MoneyState {
  /** Chosen display currency, or null to show amounts as recorded. */
  display: string | null;
  /** Conversion is only applied where the switcher is visible (staff portals). */
  enabled: boolean;
  /** `1 USD = rate CODE` for every catalog currency. */
  usdRates: Record<string, number>;
}

let state: MoneyState = { display: null, enabled: false, usdRates: { USD: 1 } };
const listeners = new Set<() => void>();

function setState(patch: Partial<MoneyState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setDisplayCurrency(code: string | null) {
  const next = code ? code.toUpperCase() : null;
  try {
    if (next) localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next);
    else localStorage.removeItem(DISPLAY_CURRENCY_STORAGE_KEY);
  } catch { /* storage blocked — choice lasts for this tab only */ }
  setState({ display: next });
}

export function readStoredDisplayCurrency(): string | null {
  try {
    return localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDisplayEnabled(enabled: boolean) {
  if (state.enabled !== enabled) setState({ enabled });
}

export function setUsdRates(rates: Record<string, number>) {
  setState({ usdRates: { ...rates, USD: 1 } });
}

/** Subscribe a component to display-currency changes. */
export function useMoneyDisplay() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    display: s.enabled ? s.display : null,
    enabled: s.enabled,
    usdRates: s.usdRates,
  };
}

function activeTarget(): string | null {
  return state.enabled ? state.display : null;
}

/** The display currency in effect right now, or null when showing amounts as recorded. */
export function getDisplayTarget(): string | null {
  return activeTarget();
}

/**
 * Convert `amount` recorded in `from` to the display currency. Falls back to the
 * recorded amount when no display currency is set or a rate is missing.
 */
export function convertMoney(
  amount: number,
  from: string | null | undefined,
): { amount: number; currency: string; converted: boolean } {
  const src = (from || '').toUpperCase();
  const target = activeTarget();
  if (!target || !src || src === target) return { amount, currency: src, converted: false };
  const fromRate = state.usdRates[src];
  const toRate = state.usdRates[target];
  if (!fromRate || !toRate) return { amount, currency: src, converted: false };
  return { amount: (amount / fromRate) * toRate, currency: target, converted: true };
}

export function formatNumber(x: number): string {
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "KES 1,234.00", converted to the display currency when one is chosen. */
export function formatMoney(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string {
  const n = Number(amount ?? 0);
  const c = convertMoney(Number.isFinite(n) ? n : 0, currency);
  return c.currency ? `${c.currency} ${formatNumber(c.amount)}` : formatNumber(c.amount);
}

/** Just the number part of `formatMoney`, for layouts that print the code separately. */
export function formatMoneyAmount(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
): string {
  const n = Number(amount ?? 0);
  return formatNumber(convertMoney(Number.isFinite(n) ? n : 0, currency).amount);
}

/** The currency code `formatMoney` will print for an amount recorded in `currency`. */
export function displayCurrencyFor(currency: string | null | undefined): string {
  return convertMoney(1, currency).currency;
}

/**
 * Totals kept per currency ("KES 1,000.00 · UGX 5,000.00"). With a display
 * currency chosen, every convertible total collapses into one figure.
 */
export function formatMoneyTotals(
  totals: Map<string, number> | Record<string, number>,
  empty = '0.00',
): string {
  return moneyTotalsList(totals, empty).join(' · ');
}

/** `formatMoneyTotals` as one string per currency, for chip layouts. */
export function moneyTotalsList(
  totals: Map<string, number> | Record<string, number>,
  empty = '0.00',
): string[] {
  const entries = totals instanceof Map ? Array.from(totals.entries()) : Object.entries(totals);
  const merged = new Map<string, number>();
  for (const [cur, value] of entries) {
    if (!value) continue;
    const c = convertMoney(Number(value), cur);
    merged.set(c.currency, (merged.get(c.currency) ?? 0) + c.amount);
  }
  if (merged.size === 0) {
    const target = activeTarget();
    return [target ? `${target} ${formatNumber(0)}` : empty];
  }
  return Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, value]) => (cur ? `${cur} ${formatNumber(value)}` : formatNumber(value)));
}
