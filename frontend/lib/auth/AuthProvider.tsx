'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthSession, canAccessPortal } from './config';
import { signIn, signOut, subscribeAuthState, apiGetAccountStatus } from './firebase-auth';
import { clearAuthRoleCookie, setAuthRoleCookie } from './cookies';
import { getFirebaseAuthErrorMessage } from './errors';
import { FirebaseError } from 'firebase/app';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';
import { endRdpConnection, getMyActiveRdp } from '@/lib/rdp';

const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

const DEV_SESSION: AuthSession = {
  uid: 'dev-test-user',
  email: 'dev.test@local.dev',
  displayName: 'Dev Test User',
  authRole: 'super_admin',
  primaryPortal: 'leadership',
  allowedPortals: ['leadership', 'admin', 'worker'],
};

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  canAccess: (portal: PortalRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      setSession(DEV_SESSION);
      setAuthRoleCookie(DEV_SESSION.authRole);
      setIsLoading(false);
      return;
    }

    const unsub = subscribeAuthState((s) => {
      setSession(s);
      setIsLoading(false);
      if (s) {
        setAuthRoleCookie(s.authRole);
      } else {
        clearAuthRoleCookie();
      }
    });
    return unsub;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (DEV_AUTH_BYPASS) {
      setSession(DEV_SESSION);
      setAuthRoleCookie(DEV_SESSION.authRole);
      router.replace(ROLE_LANDING[DEV_SESSION.primaryPortal]);
      return { ok: true as const };
    }

    try {
      const s = await signIn(email, password);
      setSession(s);
      setAuthRoleCookie(s.authRole);
      router.replace(ROLE_LANDING[s.primaryPortal]);
      return { ok: true as const };
    } catch (err: unknown) {
      const isDisabled =
        (err instanceof FirebaseError && err.code === 'auth/user-disabled') ||
        (err instanceof Error && err.message.includes('user-disabled'));

      if (isDisabled) {
        try {
          const { status } = await apiGetAccountStatus(email);
          if (status === 'banned') {
            return { ok: false as const, error: 'Your account has been banned due to violating system rules. Contact an administrator for assistance.' };
          }
          if (status === 'pending') {
            return { ok: false as const, error: 'Your account is awaiting admin approval.' };
          }
          if (status === 'rejected') {
            return { ok: false as const, error: 'Your account request was rejected. Contact an administrator.' };
          }
        } catch {
          // status check failed — fall through to generic message
        }
        return { ok: false as const, error: 'Your account has been disabled. Contact an administrator.' };
      }

      return { ok: false as const, error: getFirebaseAuthErrorMessage(err) };
    }
  }, [router]);

  const logout = useCallback(async () => {
    if (DEV_AUTH_BYPASS) {
      router.replace(ROLE_LANDING[DEV_SESSION.primaryPortal]);
      return;
    }

    try {
      const active = await getMyActiveRdp();
      if (active?.rdp_resource_id) {
        const confirmed = window.confirm(
          'You have an open RDP connection. End connection and log out?',
        );
        if (!confirmed) return;
        await endRdpConnection(active.rdp_resource_id);
      }
    } catch {
      // If active check fails, still allow logout
    }
    await signOut();
    clearAuthRoleCookie();
    setSession(null);
    router.replace('/login');
  }, [router]);

  const canAccess = useCallback(
    (portal: PortalRole) => canAccessPortal(session, portal),
    [session],
  );

  return (
    <AuthContext.Provider value={{ session, isLoading, login, logout, canAccess }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
