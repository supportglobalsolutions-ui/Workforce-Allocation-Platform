'use client';

import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { syncSessionCookie, clearSessionCookie } from './session-cookie';
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

  // Extract custom claims from JWT access token if available
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

  // Priority: custom claim user_role -> custom claim role -> app_metadata.role -> default 'user'
  const roleFromClaims =
    (jwtClaims.user_role as AuthRole) ||
    ((jwtClaims.custom_claims as Record<string, any>)?.role as AuthRole) ||
    (jwtClaims.app_metadata?.role as AuthRole) ||
    (appMeta.role as AuthRole | undefined);

  // Note: standard Supabase JWTs set claims.role = "authenticated". We want the application role.
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

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw error || new Error('Login failed');
  }
  await syncSessionCookie(data.session.access_token);
  return sessionFromUser(data.user, data.session.access_token);
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  await supabase.auth.signOut();
}

export function subscribeAuthState(
  callback: (session: AuthSession | null) => void,
): () => void {
  // Initial session check
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      try {
        await syncSessionCookie(session.access_token);
        callback(await sessionFromUser(session.user, session.access_token));
      } catch {
        callback(null);
      }
    } else {
      callback(null);
    }
  });

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      await clearSessionCookie();
      callback(null);
      return;
    }
    try {
      await syncSessionCookie(session.access_token);
      callback(await sessionFromUser(session.user, session.access_token));
    } catch {
      callback(null);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}

// ── Backend API helpers ────────────────────────────────────────────────────

export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'banned';

export interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  role: AuthRole;
  status: AccountStatus;
  disabled: boolean;
  banned: boolean;
  createdAt: number;
  partnerEntityId?: string | null;
}

export const apiListUsers = () =>
  api.get<ManagedUser[]>('/auth/users');

export const apiCreateUser = (
  email: string,
  password: string,
  displayName: string,
  role: AuthRole,
  partnerEntityId?: string | null,
) => api.post<ManagedUser>('/auth/users', {
  email,
  password,
  displayName,
  role,
  ...(partnerEntityId ? { partnerEntityId } : {}),
});

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

export const apiRegisterUser = (email: string, password: string, displayName: string) =>
  api.post<ManagedUser>('/auth/register', { email, password, displayName });

export const apiApproveUser = (
  uid: string,
  body?: { worker_type?: string; partner_entity_id?: string | null; country?: string | null },
) => api.patch<ManagedUser>(`/auth/users/${uid}/approve`, body ?? {});

export const apiRejectUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/reject`, {});

export const apiBanUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/ban`, {});

export const apiUnbanUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/unban`, {});

export const apiGetAccountStatus = (email: string) =>
  api.get<{ status: AccountStatus | 'unknown' }>(`/auth/account-status?email=${encodeURIComponent(email)}`);

export const apiBanWorker = (workerId: string) =>
  api.patch<{ banned: boolean }>(`/workers/${workerId}/ban`, {});

export const apiUnbanWorker = (workerId: string) =>
  api.patch<{ banned: boolean }>(`/workers/${workerId}/unban`, {});
