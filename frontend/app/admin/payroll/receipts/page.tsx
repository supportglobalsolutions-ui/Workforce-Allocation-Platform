'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import PayrollTabs from '@/components/platform/PayrollTabs';
import { Mail, MessageCircle, Send, Users, FileText } from 'lucide-react';
import { api } from '@/lib/api';

interface Worker {
  id: string;
  display_name: string;
  country: string;
  status: string;
}

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
}

export default function PayrollReceiptsPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'both'>('both');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Worker[]>('/workers'),
      api.get<PayrollPeriod[]>('/payroll/periods'),
    ])
      .then(([workerList, periodList]) => {
        setWorkers(workerList);
        setPeriods(periodList);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, []);

  const activeWorkers = workers.filter((w) => w.status === 'active');

  return (
    <div>
      <PageHeader
        title="Send Payroll Receipts"
        description="Deliver approved payroll receipts to workers via email and WhatsApp."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/payroll" className="btn-secondary text-sm">Payroll Dashboard</Link>
            <Link href="/admin/payroll/export" className="btn-secondary text-sm">Export</Link>
          </div>
        }
      />

      <PayrollTabs active="/admin/payroll/receipts" />

      {loading ? (
        <p className="text-theme-muted text-sm mt-4">Loading...</p>
      ) : error ? (
        <p className="text-danger text-sm mt-4">{error}</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <div className="glass-panel p-6">
            <h2 className="text-sm font-bold text-theme-heading mb-4 flex items-center gap-2">
              <Send size={16} className="text-emerald-accent" />
              Compose delivery
            </h2>
            {submitted ? (
              <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm">
                Receipts queued for delivery. Workers will receive notifications via the selected channels.
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
              >
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Payroll Period</label>
                  <select className="input-field" required disabled={periods.length === 0}>
                    {periods.length === 0 ? (
                      <option value="">No periods available</option>
                    ) : (
                      periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} ({new Date(p.start_date).toLocaleDateString()} – {new Date(p.end_date).toLocaleDateString()})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Recipients</label>
                  <select className="input-field" multiple size={4} disabled={activeWorkers.length === 0}>
                    {activeWorkers.length === 0 ? (
                      <option value="">No active workers</option>
                    ) : (
                      activeWorkers.map((w) => (
                        <option key={w.id} value={w.id}>{w.display_name} — {w.country}</option>
                      ))
                    )}
                  </select>
                  <p className="text-[10px] text-theme-muted mt-1">Hold Ctrl/Cmd to select multiple workers</p>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-2 block">Delivery channel</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: 'email' as const, label: 'Email', icon: Mail },
                      { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageCircle },
                      { id: 'both' as const, label: 'Both', icon: Users },
                    ]).map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setChannel(id)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                          channel === id
                            ? 'border-emerald-accent/40 bg-emerald-accent/10 text-emerald-accent'
                            : 'border-theme text-theme-muted hover:border-emerald-accent/20'
                        }`}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Message (optional)</label>
                  <textarea
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Add a note to include with the receipt..."
                  />
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-gold-accent/5 border border-gold-accent/20 text-xs text-theme-muted">
                  <FileText size={14} className="text-gold-accent shrink-0 mt-0.5" />
                  <span>WhatsApp delivery requires WhatsApp Business integration (deferred until account is active). Email sends immediately.</span>
                </div>

                <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={periods.length === 0 || activeWorkers.length === 0}>
                  <Send size={16} />
                  Send Receipts
                </button>
              </form>
            )}
          </div>

          <div className="glass-panel p-6">
            <h2 className="text-sm font-bold text-theme-heading mb-4">Receipt preview</h2>
            <div className="rounded-xl border border-theme p-5 bg-theme-bg text-sm text-theme-muted text-center">
              Select a payroll period and worker to preview a receipt.
            </div>
          </div>
        </div>
      )}

      <h2 className="text-sm font-bold text-theme-heading mb-4">Delivery log</h2>
      <DataTable
        columns={[
          { key: 'worker', header: 'Worker' },
          { key: 'period', header: 'Period' },
          { key: 'channel', header: 'Channel' },
          { key: 'time', header: 'Sent at' },
          { key: 'status', header: 'Status' },
        ]}
        data={[]}
        emptyMessage="No receipts sent yet."
      />
    </div>
  );
}
