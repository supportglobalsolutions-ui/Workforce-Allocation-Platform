'use client';

import {
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  AuthRole,
  AuthSession,
  ROLE_TO_PORTAL,
  ROLE_ALLOWED_PORTALS,
} from './config';
import { api } from '@/lib/api';

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return sessionFromUser(user);
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export async function sessionFromUser(user: User): Promise<AuthSession> {
  const token = await user.getIdTokenResult(/* forceRefresh */ true);
  const role = (token.claims['role'] as AuthRole | undefined) ?? 'user';
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName ?? (user.email?.split('@')[0] ?? user.uid),
    authRole: role,
    primaryPortal: ROLE_TO_PORTAL[role],
    allowedPortals: ROLE_ALLOWED_PORTALS[role],
  };
}

export function subscribeAuthState(
  callback: (session: AuthSession | null) => void,
): () => void {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) { callback(null); return; }
    try { callback(await sessionFromUser(user)); }
    catch { callback(null); }
  });
}

// ── Backend API helpers ────────────────────────────────────────────────────

export type AccountStatus = 'pending' | 'approved' | 'rejected';

export interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  role: AuthRole;
  status: AccountStatus;
  disabled: boolean;
  createdAt: number;
}

export const apiListUsers = () =>
  api.get<ManagedUser[]>('/auth/users');

export const apiCreateUser = (
  email: string,
  password: string,
  displayName: string,
  role: AuthRole,
) => api.post<ManagedUser>('/auth/users', { email, password, displayName, role });

export const apiUpdateUserRole = (uid: string, role: AuthRole) =>
  api.patch<void>(`/auth/users/${uid}/role`, { role });

export const apiRegisterUser = (email: string, password: string, displayName: string) =>
  api.post<ManagedUser>('/auth/register', { email, password, displayName });

export const apiApproveUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/approve`, {});

export const apiRejectUser = (uid: string) =>
  api.patch<ManagedUser>(`/auth/users/${uid}/reject`, {});
