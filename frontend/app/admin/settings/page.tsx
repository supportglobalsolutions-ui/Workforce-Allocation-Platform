'use client';

import { ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';

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

export default function SystemSettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform status, leaderboard scoring, and ops tool links."
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <div className="max-w-3xl mx-auto space-y-6">
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
