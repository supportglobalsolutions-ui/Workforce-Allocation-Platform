'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/theme/ThemeToggle';
import SiteFooter from '@/components/layout/SiteFooter';
import { applyThemeToDocument } from '@/lib/theme/tokens';
import { useTheme } from '@/lib/theme/ThemeProvider';

const CINEMATIC_PATHS = ['/', '/login', '/signup', '/reset-password'];

function CinematicShell({ children }: { children: React.ReactNode }) {
  // Marketing/auth screens are designed for the dark cyber look only.
  useEffect(() => {
    applyThemeToDocument('dark');
    return () => {
      // Restore the user's saved preference when leaving these pages.
      try {
        const stored = localStorage.getItem('gs-theme');
        if (stored === 'light' || stored === 'dark') {
          applyThemeToDocument(stored);
        }
      } catch {
        /* ignore */
      }
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#010e0b] text-[#cbe9df] relative overflow-x-clip selection:bg-emerald-500/30 selection:text-white">
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

/** Minimal shell — theme toggle only on non-cinematic public pages */
export default function BareShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCinematic = CINEMATIC_PATHS.includes(pathname ?? '/');

  if (isCinematic) {
    return <CinematicShell>{children}</CinematicShell>;
  }

  return <AppPublicShell>{children}</AppPublicShell>;
}
