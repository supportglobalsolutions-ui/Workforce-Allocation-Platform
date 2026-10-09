'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';

interface MyApproval {
  approved: boolean;
  required: boolean;
  period_label: string | null;
}

/** Shown to members not yet approved for the current working month. */
export default function MonthApprovalBanner() {
  const [status, setStatus] = useState<MyApproval | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<MyApproval>('/member-approvals/me')
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { /* banner is informational; never block the shell */ });
    return () => { cancelled = true; };
  }, []);

  if (!status || !status.required || status.approved) return null;

  return (
    <div className="mb-4 flex items-start gap-3 p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-sm">
      <ShieldAlert size={16} className="shrink-0 mt-0.5" />
      <div>
        <div className="font-semibold">Not approved for {status.period_label ?? 'this month'}</div>
        <div className="text-xs opacity-90">
          You can view your profile and wallet, but RDPs and shifts unlock once an admin approves you for this working month.
        </div>
      </div>
    </div>
  );
}
