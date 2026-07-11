'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UserManagementRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin/workers'); }, [router]);
  return null;
}
