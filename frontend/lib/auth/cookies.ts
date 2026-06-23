import type { AuthRole } from './config';

export function setAuthRoleCookie(role: AuthRole): void {
  document.cookie = `gs-role=${role}; path=/; max-age=86400; SameSite=Lax`;
}

export function clearAuthRoleCookie(): void {
  document.cookie = 'gs-role=; path=/; max-age=0';
}
