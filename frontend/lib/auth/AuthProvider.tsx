'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AUTH_STORAGE_KEY,
  AuthSession,
  authenticate,
  canAccessPortal,
  clearSessionCookie,
  parseSession,
  setSessionCookie,
} from './config';
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    setSession(parseSession(stored));
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = authenticate(email, password);
    if (!result) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result));
    setSessionCookie(result);
    setSession(result);
    router.push(ROLE_LANDING[result.primaryPortal]);
    return { ok: true };
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    clearSessionCookie();
    setSession(null);
    router.push('/');
  }, [router]);

  const canAccess = useCallback(
    (portal: PortalRole) => canAccessPortal(session, portal),
    [session]
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
