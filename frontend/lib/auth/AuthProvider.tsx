'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthSession, canAccessPortal } from './config';
import {
  signInWithPassword,
  signOut,
  subscribeAuthState,
  apiGetAccountStatus,
  requestLoginOtp,
  verifyLoginOtp,
  completeLoginSession,
  registerLoginFailure,
  type LoginOtpChallenge,
} from './supabase-auth';
import { clearAuthRoleCookie } from './cookies';
import { getAuthErrorMessage } from './errors';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';
import { endRdpConnection, getMyActiveRdp } from '@/lib/rdp';
import { logoutBlockReason } from '@/lib/logout-guard';
import { supabase } from '@/lib/supabase';

export type LoginResult =
  | { ok: true; otpRequired?: false }
  | {
      ok: true;
      otpRequired: true;
      challenge: LoginOtpChallenge;
    }
  | { ok: false; error: string };

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyOtp: (challengeId: string, code: string) => Promise<LoginResult>;
  resendOtp: () => Promise<LoginResult>;
  cancelOtp: () => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (portal: PortalRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const otpPendingRef = useRef(false);
  const pendingAccessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAuthState(
      (s) => {
        setSession(s);
        setIsLoading(false);
        if (!s) clearAuthRoleCookie();
      },
      { skipIf: () => otpPendingRef.current },
    );
    return unsub;
  }, []);

  const finishLogin = useCallback(
    async (accessToken: string) => {
      const s = await completeLoginSession(accessToken);
      otpPendingRef.current = false;
      pendingAccessTokenRef.current = null;
      setSession(s);
      router.replace(ROLE_LANDING[s.primaryPortal]);
      return { ok: true as const };
    },
    [router],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      try {
        otpPendingRef.current = true;
        const { session: provisional, accessToken } = await signInWithPassword(email, password);
        pendingAccessTokenRef.current = accessToken;

        const challenge = await requestLoginOtp();
        if (!challenge.required) {
          return finishLogin(accessToken);
        }

        // Hold provisional identity without unlocking the app cookie.
        void provisional;
        return { ok: true, otpRequired: true, challenge };
      } catch (err: unknown) {
        otpPendingRef.current = false;
        pendingAccessTokenRef.current = null;
        try {
          await registerLoginFailure(email);
        } catch (rateErr: unknown) {
          return { ok: false, error: getAuthErrorMessage(rateErr) };
        }
        try {
          await signOut();
        } catch {
          /* ignore */
        }

        const isDisabled =
          err instanceof Error &&
          (err.message.includes('user-disabled') ||
            err.message.includes('disabled') ||
            err.message.includes('banned') ||
            err.message.includes('awaiting'));

        if (isDisabled) {
          try {
            const { status } = await apiGetAccountStatus(email);
            if (status === 'banned') {
              return {
                ok: false,
                error:
                  'Your account has been banned due to violating system rules. Contact an administrator for assistance.',
              };
            }
            if (status === 'pending') {
              return { ok: false, error: 'Your account is awaiting admin approval.' };
            }
            if (status === 'rejected') {
              return {
                ok: false,
                error: 'Your account request was rejected. Contact an administrator.',
              };
            }
          } catch {
            /* fall through */
          }
          return { ok: false, error: 'Your account has been disabled. Contact an administrator.' };
        }

        return { ok: false, error: getAuthErrorMessage(err) };
      }
    },
    [finishLogin],
  );

  const verifyOtp = useCallback(
    async (challengeId: string, code: string): Promise<LoginResult> => {
      try {
        await verifyLoginOtp(challengeId, code);
        const token = pendingAccessTokenRef.current;
        if (!token) {
          const { data } = await supabase.auth.getSession();
          const access = data.session?.access_token;
          if (!access) {
            return { ok: false, error: 'Session expired. Sign in again.' };
          }
          return finishLogin(access);
        }
        return finishLogin(token);
      } catch (err: unknown) {
        return { ok: false, error: getAuthErrorMessage(err) };
      }
    },
    [finishLogin],
  );

  const resendOtp = useCallback(async (): Promise<LoginResult> => {
    try {
      const challenge = await requestLoginOtp();
      if (!challenge.required || !challenge.challenge_id) {
        const token = pendingAccessTokenRef.current;
        if (token) return finishLogin(token);
        return { ok: false, error: 'Could not resend code. Sign in again.' };
      }
      return { ok: true, otpRequired: true, challenge };
    } catch (err: unknown) {
      return { ok: false, error: getAuthErrorMessage(err) };
    }
  }, [finishLogin]);

  const cancelOtp = useCallback(async () => {
    otpPendingRef.current = false;
    pendingAccessTokenRef.current = null;
    await signOut();
    setSession(null);
  }, []);

  const logout = useCallback(async () => {
    const blocked = logoutBlockReason();
    if (blocked) {
      window.alert(blocked);
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
      /* still allow logout */
    }
    otpPendingRef.current = false;
    pendingAccessTokenRef.current = null;
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
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        login,
        verifyOtp,
        resendOtp,
        cancelOtp,
        logout,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
