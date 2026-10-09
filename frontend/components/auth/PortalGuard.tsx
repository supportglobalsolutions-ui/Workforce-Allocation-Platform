'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { PortalRole, ROLE_LANDING } from '@/lib/navigation/config';
import SpinningDots from '@/components/shared/SpinningDots';

export default function PortalGuard({
  children,
  requiredPortal,
}: {
  children: React.ReactNode;
  requiredPortal: PortalRole;
}) {
  const { session, isLoading, canAccess } = useAuth();
  const router = useRouter();
  const redirecting = useRef(false);
  const [waitTooLong, setWaitTooLong] = useState(false);

  const allowed = Boolean(session && canAccess(requiredPortal));

  useEffect(() => {
    if (isLoading || allowed || redirecting.current) return;

    redirecting.current = true;
    if (!session) {
      // Carry the page we were on, exactly as middleware does. Without it a
      // refresh that briefly loses the session sends you to /login, which then
      // sees the session restored and drops you at your role's landing page —
      // so a super admin reading a worker page lands on CEO Command instead of
      // back where they were.
      // Read from location rather than useSearchParams: this runs only in the
      // browser, and the hook would force every portal layout under Suspense.
      const returnTo = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    // A real permission problem — this portal is not theirs. Landing page is
    // the right destination here.
    router.replace(ROLE_LANDING[session.primaryPortal]);
  }, [isLoading, allowed, session, router]);

  useEffect(() => {
    if (!isLoading && allowed) {
      setWaitTooLong(false);
      return;
    }
    const t = window.setTimeout(() => setWaitTooLong(true), 6_000);
    return () => window.clearTimeout(t);
  }, [isLoading, allowed]);

  // Never paint an empty viewport. `return null` used to leave only the root
  // brand background — which looks like a broken app during auth resolve or
  // portal redirect.
  if (isLoading || !allowed) {
    return (
      <div className="min-h-screen bg-brand-background flex flex-col items-center justify-center gap-4 px-6">
        <SpinningDots size="lg" className="text-emerald-accent" />
        {waitTooLong && (
          <div className="text-center space-y-3 max-w-sm">
            <p className="text-sm text-theme-muted">
              This is taking longer than usual. A stale page cache can cause that.
            </p>
            <button
              type="button"
              className="btn-primary text-sm py-2 px-4"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
