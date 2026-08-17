'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

const PLATFORM = [
  { name: 'Firebase Auth', status: 'Connected' },
  { name: 'PostgreSQL', status: 'Connected' },
  { name: 'Firebase Real-time Board', status: 'Active' },
  { name: 'Guacamole RDP Gateway', status: 'Active' },
] as const;

const LEADERBOARD = [
  { label: 'Completed Sessions', weight: '40 pts' },
  { label: 'Total Hours Worked', weight: '40 pts' },
  { label: 'Average Quality Score', weight: '20 pts' },
] as const;

const TOOLS = [
  {
    label: 'Uptime Kuma',
    description: 'Service health monitoring',
    href: 'http://localhost:3001',
  },
  {
    label: 'Apache Guacamole',
    description: 'RDP gateway & sessions',
    href: 'http://localhost:8080/guacamole',
  },
] as const;

interface AlertSettings {
  alert_email: string;
  otp_recipient_masked: string | null;
  using_previous_email: boolean;
  configured_email_trusted_at: string | null;
  otp_ready: boolean;
  otp_blocked_reason: string | null;
}

function AlertEmailCard() {
  const [data, setData] = useState<AlertSettings | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const row = await api.get<AlertSettings>('/settings');
      setData(row);
      setDraft(row.alert_email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setNote(null);
    try {
      const row = await api.patch<AlertSettings>('/settings/alert-email', { alert_email: draft.trim() });
      setData(row);
      setDraft(row.alert_email);
      setNote(
        row.using_previous_email
          ? `Saved. Confirmation codes still go to ${row.otp_recipient_masked} until the new address has been on file for 24 hours.`
          : 'Saved. This address can receive confirmation codes.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the alert email.');
    } finally {
      setSaving(false);
    }
  }

  const trustedAt = data?.configured_email_trusted_at
    ? new Date(data.configured_email_trusted_at).toLocaleString()
    : null;

  return (
    <section className="glass-panel p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-accent/30 bg-gold-accent/10 text-gold-accent">
          <Mail size={16} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-theme-heading">Admin alert email</h2>
          <p className="text-xs text-theme-muted mt-1">
            Receives confirmation codes for irreversible actions such as deleting a work period.
            After you change it, the new address cannot receive those codes for 24 hours — the
            previous inbox keeps getting them. (Password confirmation for this change is not required yet.)
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><SpinningDots size="sm" className="text-emerald-accent" /></div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          {error && (
            <p className="text-xs text-danger flex items-start gap-1.5">
              <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
            </p>
          )}
          {note && (
            <p className="text-xs text-emerald-accent flex items-start gap-1.5">
              <CheckCircle size={12} className="shrink-0 mt-0.5" /> {note}
            </p>
          )}
          <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted block">Email</label>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="input-field flex-1 min-w-[16rem]"
            />
            <button type="submit" disabled={saving || draft.trim() === data?.alert_email}
              className="btn-primary text-sm py-2 px-4 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {data?.using_previous_email && trustedAt && (
            <p className="text-[11px] text-gold-accent">
              Codes currently go to {data.otp_recipient_masked}. The configured address
              ({data.alert_email}) starts receiving them at {trustedAt}.
            </p>
          )}
        </form>
      )}
    </section>
  );
}

export default function SystemSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform status, the admin alert inbox, leaderboard scoring, and ops tool links."
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <div className="max-w-3xl mx-auto space-y-6">
        <AlertEmailCard />

        <section className="glass-panel p-5">
          <h2 className="text-sm font-bold text-theme-heading mb-1">Platform</h2>
          <p className="text-xs text-theme-muted mb-4">Live services this environment depends on.</p>
          <ul className="divide-y divide-white/[0.06]">
            {PLATFORM.map((item) => (
              <li key={item.name} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-theme-heading">{item.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-accent/15 text-emerald-accent border border-emerald-accent/25">
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel p-5">
          <h2 className="text-sm font-bold text-theme-heading mb-1">Leaderboard scoring</h2>
          <p className="text-xs text-theme-muted mb-4">Current ranking weights (100 pts total).</p>
          <ul className="divide-y divide-white/[0.06]">
            {LEADERBOARD.map((item) => (
              <li key={item.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm text-theme-heading">{item.label}</span>
                <span className="text-xs font-mono text-emerald-accent">{item.weight}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel p-5">
          <h2 className="text-sm font-bold text-theme-heading mb-1">Ops tools</h2>
          <p className="text-xs text-theme-muted mb-4">Infrastructure dashboards (opens in a new tab).</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {TOOLS.map((tool) => (
              <a
                key={tool.label}
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] hover:border-emerald-accent/30 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-theme-heading">{tool.label}</p>
                  <p className="text-xs text-theme-muted mt-0.5">{tool.description}</p>
                </div>
                <ExternalLink size={14} className="shrink-0 text-theme-muted mt-0.5" />
              </a>
            ))}
          </div>
        </section>

        <section className="glass-panel p-5 flex items-start gap-3">
          <ShieldCheck size={18} className="text-gold-accent shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-theme-heading">Roles &amp; access</h2>
            <p className="text-xs text-theme-muted mt-1">
              Operations Lead and Executive accounts, role changes, and pending approvals are managed on the Accounts page.
            </p>
            <Link
              href="/admin/accounts"
              className="inline-flex mt-3 text-xs font-semibold text-emerald-accent hover:underline"
            >
              Open Accounts →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
