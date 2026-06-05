'use client';

import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import RouteShell from '@/components/navigation/RouteShell';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouteShell>{children}</RouteShell>
      </AuthProvider>
    </ThemeProvider>
  );
}
