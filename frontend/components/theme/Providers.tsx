'use client';

import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import ThemeShell from './ThemeShell';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ThemeShell>{children}</ThemeShell>
    </ThemeProvider>
  );
}
