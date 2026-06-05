'use client';

import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import RouteShell from '@/components/navigation/RouteShell';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <RouteShell>{children}</RouteShell>
    </ThemeProvider>
  );
}
