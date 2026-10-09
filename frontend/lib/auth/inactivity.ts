export const IDLE_TIMEOUT_MS = 15 * 60_000;
export const IDLE_WARNING_MS = 2 * 60_000;
export const activityKey = (uid: string) => `gs-auth-activity:${uid}`;

const fallback = new Map<string, number>();

export function remainingIdleMs(lastActivity: number, now = Date.now()): number {
  if (!Number.isFinite(lastActivity) || lastActivity > now) return 0;
  return Math.max(0, lastActivity + IDLE_TIMEOUT_MS - now);
}

export function readActivity(uid: string): number | null {
  try {
    const value = window.localStorage.getItem(activityKey(uid));
    return value === null ? (fallback.get(uid) ?? null) : Number(value);
  } catch {
    return fallback.get(uid) ?? null;
  }
}

export function writeActivity(uid: string, timestamp = Date.now()): void {
  fallback.set(uid, timestamp);
  try { window.localStorage.setItem(activityKey(uid), String(timestamp)); } catch { /* use memory */ }
}

/**
 * A real sign-in counts as activity in every tab. Without this, a tab still
 * holding the previous session's expired timestamp signs the shared Supabase
 * session out the moment a new login lands (e.g. mid-OTP in another tab).
 * Token refreshes don't change last_sign_in_at, so idle sessions still expire.
 */
export function noteSignIn(uid: string, lastSignInAt: string | null | undefined, now = Date.now()): void {
  const signedInAt = Date.parse(lastSignInAt ?? '');
  if (!Number.isFinite(signedInAt) || signedInAt < now - IDLE_TIMEOUT_MS) return;
  // Clamp: a server clock ahead of ours would otherwise read as "expired".
  const at = Math.min(signedInAt, now);
  if (at > (readActivity(uid) ?? 0)) writeActivity(uid, at);
}

export function isIdleExpired(uid: string, now = Date.now()): boolean {
  const activity = readActivity(uid);
  // Existing logins receive the policy on their first visit after rollout.
  if (activity === null) {
    writeActivity(uid, now);
    return false;
  }
  return remainingIdleMs(activity, now) === 0;
}
