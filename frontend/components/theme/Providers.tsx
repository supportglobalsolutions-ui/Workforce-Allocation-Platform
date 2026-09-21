'use client';

import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import RouteShell from '@/components/navigation/RouteShell';
import ChunkLoadRecovery from '@/components/navigation/ChunkLoadRecovery';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChunkLoadRecovery />
        <RouteShell>{children}</RouteShell>
      </AuthProvider>
    </ThemeProvider>
  );
}
