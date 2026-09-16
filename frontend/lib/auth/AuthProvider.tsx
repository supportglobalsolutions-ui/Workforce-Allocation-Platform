'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthSession, canAccessPortal } from './config';
import {
  signInWithPassword,
  signOut,
  subscribeAuthState,
  lookupAccountStatus,
  resolveLoginEmail,
  requestLoginOtp,
  verifyLoginOtp,
  completeLoginSession,
  registerLoginFailure,
  isPrivilegedLoginRole,
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

export type PendingLoginOtp = {
  sending: boolean;
  sentTo: string | null;
  challenge: LoginOtpChallenge | null;
  resendsRemaining: number;
};

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  isLoggingOut: boolean;
  pendingLoginOtp: PendingLoginOtp | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyOtp: (challengeId: string, code: string) => Promise<LoginResult>;
  resendOtp: () => Promise<LoginResult>;
  cancelOtp: () => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (portal: PortalRole) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PENDING_APPROVAL =
  'Your account is pending admin approval. You can sign in after an administrator approves it.';
const BANNED_ACCOUNT =
  'Your account has been banned due to violating system rules. Contact an administrator for assistance.';
const REJECTED_ACCOUNT = 'Your account request was rejected. Contact an administrator.';

function messageForAccountStatus(status: string | null): string | null {
  if (status === 'pending') return PENDING_APPROVAL;
  if (status === 'banned') return BANNED_ACCOUNT;
  if (status === 'rejected') return REJECTED_ACCOUNT;
  return null;
}

function isBlockedSignIn(err: unknown): boolean {
  if (!err) return false;
  const message = (
    err instanceof Error
      ? `${err.message} ${(err as Error & { code?: string }).code || ''}`
      : String(err)
  ).toLowerCase();
  return (
    message.includes('user-disabled')
    || message.includes('user_disabled')
    || message.includes('user_banned')
    || message.includes('user is banned')
    || message.includes('user is disabled')
    || message.includes('awaiting admin approval')
    || message.includes('pending admin approval')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sign-in-timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [pendingLoginOtp, setPendingLoginOtp] = useState<PendingLoginOtp | null>(null);
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
      setPendingLoginOtp(null);
      setSession(s);
      router.replace(ROLE_LANDING[s.primaryPortal]);
      return { ok: true as const };
    },
    [router],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<LoginResult> => {
      let passwordAccepted = false;
      try {
        const identifier = email.trim();
        let lookupEmail = identifier.includes('@') ? identifier.toLowerCase() : null;
        if (!lookupEmail) {
          try {
            lookupEmail = await withTimeout(resolveLoginEmail(identifier), 2000);
          } catch {
            lookupEmail = null;
          }
        }
        if (lookupEmail) {
          const blocked = messageForAccountStatus(await lookupAccountStatus(lookupEmail));
          if (blocked) return { ok: false, error: blocked };
        }

        otpPendingRef.current = true;
        const { session: provisional, accessToken } = await withTimeout(
          signInWithPassword(email, password),
          8000,
        );
        passwordAccepted = true;
        pendingAccessTokenRef.current = accessToken;

        if (!isPrivilegedLoginRole(provisional.authRole)) {
          return finishLogin(accessToken);
        }

        setPendingLoginOtp({
          sending: true,
          sentTo: email,
          challenge: null,
          resendsRemaining: 5,
        });

        const challenge = await requestLoginOtp(false);
        if (!challenge.required) {
          setPendingLoginOtp(null);
          return finishLogin(accessToken);
        }

        setPendingLoginOtp({
          sending: false,
          sentTo: challenge.sent_to,
          challenge,
          resendsRemaining: challenge.resends_remaining ?? 5,
        });
        return { ok: true, otpRequired: true, challenge };
      } catch (err: unknown) {
        otpPendingRef.current = false;
        pendingAccessTokenRef.current = null;
        setPendingLoginOtp(null);

        if (err instanceof Error && err.message === 'sign-in-timeout') {
          void signOut();
          return {
            ok: false,
            error:
              'Sign-in is taking too long. If this account is still pending approval, you can sign in after an administrator approves it.',
          };
        }
        if (isBlockedSignIn(err)) {
          void signOut();
          const lookupEmail = email.trim().includes('@') ? email.trim().toLowerCase() : null;
          const status = lookupEmail ? await lookupAccountStatus(lookupEmail) : null;
          return { ok: false, error: messageForAccountStatus(status) ?? PENDING_APPROVAL };
        }

        if (!passwordAccepted) {
          try {
            await registerLoginFailure(email);
          } catch (rateErr: unknown) {
            return { ok: false, error: getAuthErrorMessage(rateErr) };
          }
        }

        void signOut();
        const { reportError } = await import('@/lib/errors');
        return { ok: false, error: reportError('Sign in', err) };
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
      setPendingLoginOtp((current) => (
        current
          ? { ...current, sending: true }
          : { sending: true, sentTo: null, challenge: null, resendsRemaining: 5 }
      ));
      const challenge = await requestLoginOtp(true);
      if (!challenge.required || !challenge.challenge_id) {
        const token = pendingAccessTokenRef.current;
        setPendingLoginOtp(null);
        if (token) return finishLogin(token);
        return { ok: false, error: 'Could not resend code. Sign in again.' };
      }
      setPendingLoginOtp({
        sending: false,
        sentTo: challenge.sent_to,
        challenge,
        resendsRemaining: challenge.resends_remaining ?? 0,
      });
      return { ok: true, otpRequired: true, challenge };
    } catch (err: unknown) {
      setPendingLoginOtp((current) => (current ? { ...current, sending: false } : null));
      return { ok: false, error: getAuthErrorMessage(err) };
    }
  }, [finishLogin]);

  const cancelOtp = useCallback(async () => {
    otpPendingRef.current = false;
    pendingAccessTokenRef.current = null;
    setPendingLoginOtp(null);
    await signOut();
    setSession(null);
  }, []);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    const blocked = logoutBlockReason();
    if (blocked) {
      window.alert(blocked);
      return;
    }

    setIsLoggingOut(true);

    // Optional RDP check — don't hang logout if the API is slow.
    let activeId: string | null = null;
    try {
      const active = await Promise.race([
        getMyActiveRdp(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 600)),
      ]);
      activeId = active?.rdp_resource_id ?? null;
    } catch {
      activeId = null;
    }

    if (activeId) {
      const confirmed = window.confirm(
        'You have an open RDP connection. End connection and log out?',
      );
      if (!confirmed) {
        setIsLoggingOut(false);
        return;
      }
      void endRdpConnection(activeId).catch(() => { /* still sign out */ });
    }

    otpPendingRef.current = false;
    pendingAccessTokenRef.current = null;
    clearAuthRoleCookie();
    setSession(null);
    router.replace('/login');
    void signOut().finally(() => setIsLoggingOut(false));
  }, [router, isLoggingOut]);

  const canAccess = useCallback(
    (portal: PortalRole) => canAccessPortal(session, portal),
    [session],
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        isLoggingOut,
        pendingLoginOtp,
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
