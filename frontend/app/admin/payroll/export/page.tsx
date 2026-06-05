'use client';

import { useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import { Download, FileSpreadsheet } from 'lucide-react';

export default function PayrollExportPage() {
  const [exported, setExported] = useState<string | null>(null);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Payroll Export Center"
        description="Generate CSV or Excel payroll exports with period selector and approval logs."
      />
      <div className="glass-panel p-6 space-y-4 mb-6">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Payroll Period</label>
          <select className="input-field">
            <option>2026-05 (May 1 – May 31)</option>
            <option>2026-04 (Apr 1 – Apr 30)</option>
            <option>2026-03 (Mar 1 – Mar 31)</option>
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setExported('csv')} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Download size={16} />Export CSV
          </button>
          <button onClick={() => setExported('excel')} className="btn-gold flex-1 flex items-center justify-center gap-2">
            <FileSpreadsheet size={16} />Export Excel
          </button>
        </div>
        {exported && (
          <p className="text-sm text-success">Export generated ({exported.toUpperCase()}). Download ready.</p>
        )}
      </div>
      <div className="glass-panel p-6">
        <h2 className="text-sm font-bold text-white mb-4">Approval Logs</h2>
        <div className="space-y-2 text-sm text-brand-on-surface-variant">
          <p>2026-06-01 10:30 — Admin Lead approved Period 2026-04 export</p>
          <p>2026-05-01 09:15 — CEO approved Period 2026-03 export</p>
          <p>2026-04-02 14:00 — Admin Lead flagged 2 exceptions in Period 2026-03</p>
        </div>
      </div>
    </div>
  );
}
