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

// All requests go through Next.js /api proxy → backend (configured in next.config.js rewrites)
const API = '/api';

async function authHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface ManagedUser {
  uid: string;
  email: string;
  displayName: string;
  role: AuthRole;
  disabled: boolean;
  createdAt: number;
}

export async function apiListUsers(): Promise<ManagedUser[]> {
  const res = await fetch(`${API}/auth/users`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiCreateUser(
  email: string,
  password: string,
  displayName: string,
  role: AuthRole,
): Promise<ManagedUser> {
  const res = await fetch(`${API}/auth/users`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ email, password, displayName, role }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiUpdateUserRole(uid: string, role: AuthRole): Promise<void> {
  const res = await fetch(`${API}/auth/users/${uid}/role`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(await res.text());
}
