'use client';

import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import RouteShell from '@/components/navigation/RouteShell';
import ChunkLoadRecovery from '@/components/navigation/ChunkLoadRecovery';
import { DisplayCurrencySync } from '@/components/currency/DisplayCurrency';
import TestModeBanner from '@/components/testMode/TestModeBanner';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ChunkLoadRecovery />
        <DisplayCurrencySync />
        <TestModeBanner />
        <RouteShell>{children}</RouteShell>
      </AuthProvider>
    </ThemeProvider>
  );
}
