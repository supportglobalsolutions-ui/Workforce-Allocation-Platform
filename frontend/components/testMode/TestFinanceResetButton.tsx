'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { api } from '@/lib/api';
import { useTestModeUid } from '@/lib/testMode';

/**
 * Test mode only: zero one month's finance (payslips, wallet credits, shared
 * costs, client earnings) so hours and rates can be typed in again. The
 * backend refuses this outside the test copy.
 */
export default function TestFinanceResetButton({ periodId, label }: { periodId: string; label: string }) {
  const { session } = useAuth();
  const testUid = useTestModeUid();
  const [busy, setBusy] = useState(false);
  if (!testUid || !session || testUid !== session.uid) return null;

  const reset = async () => {
    if (!window.confirm(
      `TEST MODE: reset ${label} to zero?\n\nPayslips, wallet credits, shared costs and client earnings for this month are cleared and the month reopens. Shifts, sessions and absences stay. Real data is not affected.`,
    )) return;
    setBusy(true);
    try {
      await api.post(`/payroll/periods/${periodId}/test-reset`, {});
      window.location.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Reset failed.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void reset()}
      disabled={busy}
      title="Test mode only: clear this month's finance so you can type hours and rates again"
      className="text-sm py-2 px-4 flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 text-amber-400 font-semibold hover:bg-amber-400/20 disabled:opacity-50"
    >
      <RotateCcw size={15} /> {busy ? 'Resetting…' : 'Reset month to 0 (test)'}
    </button>
  );
}
