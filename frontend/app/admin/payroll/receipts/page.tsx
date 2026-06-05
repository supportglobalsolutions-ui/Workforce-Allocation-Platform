'use client';

import { useState } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import PayrollTabs from '@/components/platform/PayrollTabs';
import { Mail, MessageCircle, Send, Users, FileText } from 'lucide-react';
import { workers } from '@/lib/mock-data';

const deliveryLog = [
  { worker: 'Sarah Mwangi', channel: 'Email', period: '2026-05', status: 'sent', time: '2026-06-04 14:22' },
  { worker: 'James Okonkwo', channel: 'WhatsApp', period: '2026-05', status: 'sent', time: '2026-06-04 14:23' },
  { worker: 'Grace Nakato', channel: 'Both', period: '2026-05', status: 'pending', time: '—' },
];

export default function PayrollReceiptsPage() {
  const [channel, setChannel] = useState<'email' | 'whatsapp' | 'both'>('both');
  const [submitted, setSubmitted] = useState(false);

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

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* Send form */}
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
                <select className="input-field" required>
                  <option value="2026-05">2026-05 (May 1 – May 31)</option>
                  <option value="2026-04">2026-04 (Apr 1 – Apr 30)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Recipients</label>
                <select className="input-field" multiple size={4} defaultValue={workers.filter(w => w.status === 'active').map(w => w.id)}>
                  {workers.filter(w => w.status === 'active').map((w) => (
                    <option key={w.id} value={w.id}>{w.name} — {w.country}</option>
                  ))}
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

              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Send size={16} />
                Send Receipts
              </button>
            </form>
          )}
        </div>

        {/* Preview */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-theme-heading mb-4">Receipt preview</h2>
          <div className="rounded-xl border border-theme p-5 bg-theme-bg">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-theme">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent">GlobalSolutions</p>
                <p className="text-lg font-black text-theme-heading">Payroll Receipt</p>
              </div>
              <span className="text-xs font-mono text-gold-accent">2026-05</span>
            </div>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span className="text-theme-muted">Worker</span><span className="text-theme-heading font-medium">Sarah Mwangi</span></div>
              <div className="flex justify-between"><span className="text-theme-muted">Period</span><span className="text-theme-heading">May 1 – May 31, 2026</span></div>
              <div className="flex justify-between"><span className="text-theme-muted">Hours</span><span className="text-theme-heading font-mono">42.5h</span></div>
              <div className="flex justify-between"><span className="text-theme-muted">Gross</span><span className="text-theme-heading font-mono">£4,250</span></div>
              <div className="flex justify-between border-t border-theme pt-2">
                <span className="text-theme-muted font-bold">Net payment</span>
                <span className="text-emerald-accent font-black font-mono">£3,400</span>
              </div>
            </div>
            <p className="text-[10px] text-theme-muted">This is a payroll-ready report, not a payment instruction.</p>
          </div>
        </div>
      </div>

      {/* Delivery log */}
      <h2 className="text-sm font-bold text-theme-heading mb-4">Delivery log</h2>
      <DataTable
        columns={[
          { key: 'worker', header: 'Worker' },
          { key: 'period', header: 'Period' },
          { key: 'channel', header: 'Channel', render: (r) => (
            <span className="inline-flex items-center gap-1 text-emerald-accent text-xs font-semibold">
              {(r.channel as string) === 'Email' && <Mail size={12} />}
              {(r.channel as string) === 'WhatsApp' && <MessageCircle size={12} />}
              {(r.channel as string) === 'Both' && <Users size={12} />}
              {r.channel as string}
            </span>
          )},
          { key: 'time', header: 'Sent at' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status === 'sent' ? 'approved' : 'pending'} label={r.status as string} /> },
        ]}
        data={deliveryLog as Record<string, unknown>[]}
      />
    </div>
  );
}
