'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/theme/ThemeToggle';
import SiteFooter from '@/components/layout/SiteFooter';
import { applyThemeToDocument } from '@/lib/theme/tokens';
import { useTheme } from '@/lib/theme/ThemeProvider';

const CINEMATIC_PATHS = ['/', '/login', '/signup', '/reset-password', '/contact'];

/** Public marketing/auth pages — theme toggle lives in LandingNavbar. */
function CinematicShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col bg-brand-background text-theme-body relative overflow-x-clip">
      <main className="flex-1 flex flex-col w-full">{children}</main>
    </div>
  );
}

function AppPublicShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <div className="min-h-screen flex flex-col bg-brand-background relative overflow-x-clip">
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle variant="icon" />
      </div>
      <div className="flex-1 flex flex-col w-full min-w-0 px-4 sm:px-6">{children}</div>
      <SiteFooter />
    </div>
  );
}

export default function BareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCinematic = CINEMATIC_PATHS.includes(pathname ?? '/');

  if (isCinematic) {
    return <CinematicShell>{children}</CinematicShell>;
  }

  return <AppPublicShell>{children}</AppPublicShell>;
}
