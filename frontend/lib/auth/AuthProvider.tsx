'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthSession, canAccessPortal } from './config';
import { signIn, signOut, subscribeAuthState } from './firebase-auth';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  canAccess: (portal: PortalRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribeAuthState((s) => {
      setSession(s);
      setIsLoading(false);
      // Set/clear a role cookie so Next.js middleware can enforce routes server-side.
      if (s) {
        document.cookie = `gs-role=${s.authRole}; path=/; max-age=86400; SameSite=Lax`;
      } else {
        document.cookie = 'gs-role=; path=/; max-age=0';
      }
    });
    return unsub;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const s = await signIn(email, password);
      router.push(ROLE_LANDING[s.primaryPortal]);
      return { ok: true };
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (
        raw.includes('wrong-password') ||
        raw.includes('user-not-found') ||
        raw.includes('invalid-credential') ||
        raw.includes('INVALID_LOGIN_CREDENTIALS')
      ) {
        return { ok: false, error: 'Invalid email or password.' };
      }
      if (raw.includes('too-many-requests')) {
        return { ok: false, error: 'Too many attempts. Try again later.' };
      }
      if (raw.includes('user-disabled')) {
        return { ok: false, error: 'Your account is awaiting admin approval or has been disabled.' };
      }
      return { ok: false, error: 'Login failed. Check your credentials.' };
    }
  }, [router]);

  const logout = useCallback(async () => {
    await signOut();
    router.push('/login');
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
