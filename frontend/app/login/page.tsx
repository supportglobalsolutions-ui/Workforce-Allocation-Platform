'use client';

import AuthPageShell from '@/components/landing/AuthPageShell';
import LoginCard from '@/components/landing/LoginCard';

export default function LoginPage() {
  return (
    <AuthPageShell>
      <LoginCard />
    </AuthPageShell>
  );
}
