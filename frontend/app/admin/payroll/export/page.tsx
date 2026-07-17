'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { FINANCE_TABS, PAYROLL_SUBTABS } from '@/components/platform/AdminSectionTabs';
import { Download, FileSpreadsheet } from 'lucide-react';
import { api } from '@/lib/api';

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

export default function PayrollExportPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then(setPeriods)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load periods'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Payroll Export Center"
        description="Generate CSV or Excel payroll exports with period selector and approval logs."
      />
      <AdminSectionTabs tabs={FINANCE_TABS} />
      <AdminSectionTabs tabs={PAYROLL_SUBTABS} />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <>
          <div className="glass-panel p-6 space-y-4 mb-6">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-1.5 block">Payroll Period</label>
              <select className="input-field" disabled={periods.length === 0}>
                {periods.length === 0 ? (
                  <option>No periods available</option>
                ) : (
                  periods.map((p) => (
                    <option key={p.id}>
                      {p.label} ({new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()})
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setExported('csv')} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={periods.length === 0}>
                <Download size={16} />Export CSV
              </button>
              <button onClick={() => setExported('excel')} className="btn-gold flex-1 flex items-center justify-center gap-2" disabled={periods.length === 0}>
                <FileSpreadsheet size={16} />Export Excel
              </button>
            </div>
            {exported && (
              <p className="text-sm text-success">Export generated ({exported.toUpperCase()}). Download ready.</p>
            )}
          </div>
          <div className="glass-panel p-6">
            <h2 className="text-sm font-bold text-white mb-4">Approval Logs</h2>
            <p className="text-sm text-brand-on-surface-variant">No export approval logs yet.</p>
          </div>
        </>
      )}
    </div>
  );
}
