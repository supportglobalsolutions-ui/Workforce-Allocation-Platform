'use client';

import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  syncSessionCookie,
  clearSessionCookie,
  LoginOtpRequiredError,
} from './session-cookie';
import {
  AuthRole,
  AuthSession,
  ROLE_TO_PORTAL,
  ROLE_ALLOWED_PORTALS,
} from './config';
import { api } from '@/lib/api';

export async function sessionFromUser(user: User, accessToken?: string): Promise<AuthSession> {
  const appMeta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};

  let jwtClaims: Record<string, any> = {};
  if (accessToken) {
    try {
      const base64Url = accessToken.split('.')[1];
      if (base64Url) {
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join(''),
        );
        jwtClaims = JSON.parse(jsonPayload);
      }
    } catch {}
  }

  const roleFromClaims =
    (jwtClaims.user_role as AuthRole) ||
    ((jwtClaims.custom_claims as Record<string, any>)?.role as AuthRole) ||
    (jwtClaims.app_metadata?.role as AuthRole) ||
    (appMeta.role as AuthRole | undefined);

  const role: AuthRole =
    roleFromClaims && (roleFromClaims as string) !== 'authenticated'
      ? roleFromClaims
      : ((appMeta.role as AuthRole | undefined) ?? 'user');

  const displayName =
    (userMeta.display_name as string) ||
    (userMeta.full_name as string) ||
    user.email?.split('@')[0] ||
    user.id;

  return {
    uid: user.id,
    email: user.email ?? '',
    displayName,
    authRole: role,
    primaryPortal: ROLE_TO_PORTAL[role] || 'worker',
    allowedPortals: ROLE_ALLOWED_PORTALS[role] || ['worker'],
  };
}

export type LoginOtpChallenge = {
  required: boolean;
  reason: 'first_login' | 'privileged' | null;
  challenge_id: string | null;
  sent_to: string | null;
  ttl_seconds: number | null;
  expires_at: string | null;
  resends_remaining?: number;
  sending?: boolean;
};

export type SignupOtpChallenge = {
  sent_to: string | null;
  ttl_seconds: number | null;
  resends_remaining?: number;
  sending?: boolean;
};

export function isPrivilegedLoginRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin' || role === 'executive';
}

/**
 * Turn a username OR an email into the address Supabase authenticates with.
 * Anything containing '@' is treated as an email and passed straight through,
 * so a lookup is only needed for usernames.
 */
export async function resolveLoginEmail(identifier: string): Promise<string> {
  const value = identifier.trim();
  if (value.includes('@')) return value.toLowerCase();
  const { email } = await api.post<{ email: string }>('/auth/resolve-identifier', {
    identifier: value,
  });
  return email;
}

export const apiCheckUsername = (username: string) =>
  api.get<{ available: boolean; reason: string | null; username: string }>(
    `/auth/username-available?username=${encodeURIComponent(username)}`,
  );

/**
 * Password sign-in only — does not set the app session cookie.
 * Accepts a username or an email as the identifier.
 */
export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<{ session: AuthSession; accessToken: string }> {
  const email = await resolveLoginEmail(identifier);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw error || new Error('Login failed');
  }
  return {
    session: await sessionFromUser(data.user, data.session.access_token),
    accessToken: data.session.access_token,
  };
}

export async function requestLoginOtp(resend = false): Promise<LoginOtpChallenge> {
  return api.post<LoginOtpChallenge>('/auth/login-otp/challenge', { resend });
}

/** Record a *failed* password attempt toward rate limits (do not call on success). */
export async function registerLoginFailure(email: string): Promise<void> {
  try {
    await api.post('/auth/login-attempt', { email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/too many requests/i.test(msg)) throw err;
  }
}

export async function verifyLoginOtp(challengeId: string, code: string): Promise<void> {
  await api.post('/auth/login-otp/verify', {
    challenge_id: challengeId,
    code,
  });
}

export async function clearLoginOtp(): Promise<void> {
  try {
    await api.post('/auth/login-otp/clear', {});
  } catch {
    /* best-effort on logout */
  }
}

/** Finish login after OTP (or when OTP is not required). */
export async function completeLoginSession(accessToken: string): Promise<AuthSession> {
  try {
    await syncSessionCookie(accessToken);
  } catch (err) {
    if (err instanceof LoginOtpRequiredError) {
      throw err;
    }
    throw err;
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) {
    throw new Error('Session expired. Sign in again.');
  }
  return sessionFromUser(data.session.user, data.session.access_token);
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const { session, accessToken } = await signInWithPassword(email, password);
  await syncSessionCookie(accessToken);
  return session;
}

export async function signOut(): Promise<void> {
  // Clear local UI auth first; server MFA clear is best-effort in background.
  void clearLoginOtp();
  void clearSessionCookie();
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }
}

async function settleAuthSession(
  session: { user: User; access_token: string } | null,
  callback: (session: AuthSession | null) => void,
  options?: { skipIf?: () => boolean },
): Promise<void> {
  if (options?.skipIf?.()) {
    callback(null);
    return;
  }
  if (!session?.user) {
    callback(null);
    return;
  }
  try {
    // Abort-bounded in syncSessionCookie (5s) — never hang the UI gate.
    await syncSessionCookie(session.access_token);
    callback(await sessionFromUser(session.user, session.access_token));
  } catch (err) {
    if (err instanceof LoginOtpRequiredError) {
      callback(null);
      return;
    }
    try {
      callback(await sessionFromUser(session.user, session.access_token));
    } catch {
      callback(null);
    }
  }
}

export function subscribeAuthState(
  callback: (session: AuthSession | null) => void,
  options?: { skipIf?: () => boolean },
): () => void {
  let settled = false;
  const emit = (session: AuthSession | null) => {
    settled = true;
    callback(session);
  };

  // getSession can hang while Supabase refreshes a stale token. Cap wait so
  // public pages (signup/login) are never stuck on a spinner.
  const bootTimer = window.setTimeout(() => {
    if (!settled) emit(null);
  }, 4_000);

  void Promise.race([
    supabase.auth.getSession(),
    new Promise<{ data: { session: null } }>((resolve) => {
      window.setTimeout(() => resolve({ data: { session: null } }), 3_500);
    }),
  ]).then(async ({ data: { session } }) => {
    window.clearTimeout(bootTimer);
    if (settled && !session?.user) return;
    await settleAuthSession(session, emit, options);
  }).catch(() => {
    window.clearTimeout(bootTimer);
    if (!settled) emit(null);
  });

  // Prefer keeping a live Supabase user even if cookie sync fails briefly
  // (e.g. OTP gate) — avoids bouncing workers to /login mid-session.
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (options?.skipIf?.()) {
      return;
    }
    if (event === 'SIGNED_OUT' || !session?.user) {
      void clearSessionCookie();
      emit(null);
      return;
    }
    await settleAuthSession(
      { user: session.user, access_token: session.access_token },
      emit,
      options,
    );
  });

  return () => {
    window.clearTimeout(bootTimer);
    subscription.unsubscribe();
  };
}

// ── Backend API helpers ────────────────────────────────────────────────────

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'banned';

export interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  country?: string;
  residence?: string;
  username?: string;
  role: AuthRole;
  status: AccountStatus;
  disabled: boolean;
  banned: boolean;
  createdAt: number;
  partnerEntityId?: string | null;
  protected?: boolean;
  createdByUid?: string | null;
}

export const apiListUsers = () =>
  api.get<ManagedUser[]>('/auth/users');

/**
 * Create an account. Pass an empty password with sendInvite to email the
 * person a one-time link so they choose their own credential.
 */
export const apiCreateUser = (
  email: string,
  password: string,
  displayName: string,
  role: AuthRole,
  partnerEntityId?: string | null,
  sendInvite = false,
  username = '',
) => api.post<ManagedUser>('/auth/users', {
  email,
  displayName,
  username,
  role,
  sendInvite,
  ...(sendInvite ? {} : { password }),
  ...(partnerEntityId ? { partnerEntityId } : {}),
});

/** Re-send the set-your-password link; invite links are single-use. */
export const apiResendInvite = (uid: string) =>
  api.post<{ sent_to: string; sending: boolean }>(`/auth/users/${uid}/resend-invite`, {});

export const apiUpdateUserRole = (
  uid: string,
  role: AuthRole,
  partnerEntityId?: string | null,
) => api.patch<ManagedUser>(`/auth/users/${uid}/role`, {
  role,
  ...(role === 'partner'
    ? { partnerEntityId: partnerEntityId ?? null }
    : {}),
});

export const apiRegisterUser = (body: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  country: string;
  residence: string;
  username?: string;
  verificationToken: string;
}) => api.post<ManagedUser>('/auth/register', body);

export const apiListSignupCountries = () =>
  api.get<{ id: string; name: string }[]>('/auth/register-countries');

export const requestSignupOtp = (email: string, resend = false) =>
  api.post<SignupOtpChallenge>('/auth/register-otp/challenge', { email, resend });

export const verifySignupOtp = (email: string, code: string) =>
  api.post<{ verification_token: string }>('/auth/register-otp/verify', { email, code });

export const apiApproveUser = (
  uid: string,
  body?: {
    worker_type?: string;
    partner_entity_id?: string | null;
    country?: string | null;
    role?: AuthRole;
  },
) => api.patch<ManagedUser>(`/auth/users/${uid}/approve`, body ?? {});

export const apiRejectUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/reject`, {});

export const apiDeleteUser = (uid: string) =>
  api.delete<{ ok: boolean; deleted: boolean; uid: string }>(`/auth/users/${uid}`);

export const apiBanUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/ban`, {});

export const apiUnbanUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/unban`, {});

export async function lookupAccountStatus(email: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`/api/auth/account-status?email=${encodeURIComponent(email)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: string };
    return typeof data.status === 'string' ? data.status : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const apiGetAccountStatus = (email: string) =>
  api.get<{ status: AccountStatus | 'unknown' }>(`/auth/account-status?email=${encodeURIComponent(email)}`);

export const apiBanWorker = (workerId: string) =>
  api.patch<{ banned: boolean }>(`/workers/${workerId}/ban`, {});

export const apiUnbanWorker = (workerId: string) =>
  api.patch<{ banned: boolean }>(`/workers/${workerId}/unban`, {});
