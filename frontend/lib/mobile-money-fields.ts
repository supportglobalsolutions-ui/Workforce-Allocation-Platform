/** Client-side filters for mobile-money payout fields (silent — no rule error copy). */

export const MM_NAME_MAX = 60;
export const MM_PROVIDER_MAX = 32;

/** Strip everything except letters, digits, and spaces; enforce max length. */
export function filterMmText(value: string, maxLen: number): string {
  return value.replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, maxLen);
}

export function filterMobileMoneyName(value: string): string {
  return filterMmText(value, MM_NAME_MAX);
}

export function filterMobileMoneyProvider(value: string): string {
  return filterMmText(value, MM_PROVIDER_MAX);
}

function normalizeMmText(value: string, maxLen: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Missing only — format is enforced by the input filter, not error messages. */
export function validateMobileMoneyName(value: string, { required = true } = {}): string {
  if (!required) return '';
  return normalizeMmText(value, MM_NAME_MAX) ? '' : 'Enter the full name on your mobile money account.';
}

export function validateMobileMoneyProvider(value: string, { required = true } = {}): string {
  if (!required) return '';
  return normalizeMmText(value, MM_PROVIDER_MAX) ? '' : 'Enter your mobile money provider.';
}

/** True when name, provider, and phone are all present for payroll payouts. */
export function hasCompletePayoutDetails(w: {
  mobile_money_name?: string | null;
  mobile_money_provider?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(
    (w.mobile_money_name || '').trim()
    && (w.mobile_money_provider || '').trim()
    && (w.phone || '').trim(),
  );
}
