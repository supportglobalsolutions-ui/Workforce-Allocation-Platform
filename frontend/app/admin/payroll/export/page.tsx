'use client';

import { useEffect, useState } from 'react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import { AlertCircle, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  status: string;
}

export default function PayrollExportPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) setPeriodId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load periods'))
      .finally(() => setLoading(false));
  }, []);

  const selected = periods.find((p) => p.id === periodId) ?? null;

  async function handleDownload() {
    if (!periodId || !selected) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const slug = selected.label.replace(/\s+/g, '-');
      await downloadFile(`/payroll/periods/${periodId}/payslips.zip`, `payslips-${slug}.zip`);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Payroll Export Center"
        description="Download the bulk payslip zip for a named working month."
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />
      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <>
          <div className="glass-panel p-6 space-y-4 mb-6">
            <PeriodFilter
              periods={periods}
              value={periodId}
              onChange={setPeriodId}
              variant="select"
              label="Working month"
            />
            {downloadError && (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
                <AlertCircle size={14} className="shrink-0" /> {downloadError}
              </div>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
              disabled={!periodId || downloading}
            >
              <Download size={16} />
              {downloading ? 'Preparing zip…' : 'Download payslips zip'}
            </button>
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
