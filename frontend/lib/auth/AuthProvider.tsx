'use client';

import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AuthSession, authenticate, canAccessPortal } from './config';
import {
  getSessionServerSnapshot,
  getSessionSnapshot,
  subscribeSession,
  writeStoredSession,
} from './session-store';
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
  const session = useSyncExternalStore(
    subscribeSession,
    getSessionSnapshot,
    getSessionServerSnapshot
  );

  const login = useCallback(async (email: string, password: string) => {
    const result = authenticate(email, password);
    if (!result) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    writeStoredSession(result);
    router.push(ROLE_LANDING[result.primaryPortal]);
    return { ok: true };
  }, [router]);

  const logout = useCallback(() => {
    writeStoredSession(null);
    router.push('/');
  }, [router]);

  const canAccess = useCallback(
    (portal: PortalRole) => canAccessPortal(session, portal),
    [session]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading: false,
        login,
        logout,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
