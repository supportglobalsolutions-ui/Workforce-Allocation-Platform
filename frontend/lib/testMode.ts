/**
 * Test mode: an admin or Super Admin works in a private, empty copy of the platform.
 * While on, every API call carries X-Test-Mode; the backend honours it only
 * for admin and super_admin tokens and routes that account to its own sandbox, so other
 * people's sessions keep using real data.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'gs-test-mode';
const EVENT = 'gs-test-mode-change';

/** The uid test mode was turned on for, or null when it is off. */
export function readTestModeUid(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function isTestModeOn(): boolean {
  return !!readTestModeUid();
}

export function enableTestMode(uid: string): void {
  try { window.localStorage.setItem(KEY, uid); } catch { /* header just won't persist */ }
  window.dispatchEvent(new Event(EVENT));
}

export function disableTestMode(): void {
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTestMode(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  // Another tab turning it on or off.
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useTestModeUid(): string | null {
  return useSyncExternalStore(subscribeTestMode, readTestModeUid, () => null);
}

export function testModeHeaders(): Record<string, string> {
  return isTestModeOn() ? { 'X-Test-Mode': '1' } : {};
}

/** Leaving test mode (or losing the workspace) must show real data again, so reload. */
export function leaveTestMode(): void {
  disableTestMode();
  window.location.reload();
}

export const TEST_MODE_NOT_READY = 'test_mode_not_ready';
