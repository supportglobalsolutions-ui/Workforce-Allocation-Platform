'use client';

import { ExternalLink } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';

const FEATURE_TOGGLES = [
  { name: 'WhatsApp Notifications',   enabled: false, note: 'Deferred until Business account active' },
  { name: 'Claude AI Summaries',      enabled: false, note: 'Pending API funding' },
  { name: 'Firebase Real-time Board', enabled: true,  note: 'Active' },
  { name: 'Guacamole RDP Gateway',    enabled: true,  note: 'Active' },
];

const EXTERNAL_TOOLS = [
  {
    label: 'Uptime Kuma',
    description: 'Service health monitoring dashboard',
    href: 'http://localhost:3001',
    color: 'text-emerald-accent border-emerald-accent/30 bg-emerald-accent/5 hover:bg-emerald-accent/10',
  },
  {
    label: 'Apache Guacamole',
    description: 'Remote desktop gateway & session management',
    href: 'http://localhost:8080/guacamole',
    color: 'text-gold-accent border-gold-accent/30 bg-gold-accent/5 hover:bg-gold-accent/10',
  },
];

export default function SystemSettingsPage() {
  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Feature toggles, integrations, leaderboard, and environment configuration."
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Roles & Permissions */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Roles &amp; Permissions</h2>
          {['CEO / Leadership', 'Handler / Operations Lead', 'Country Manager', 'Worker (GS)', 'Partner Worker', 'Technical Admin'].map((role) => (
            <div key={role} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
              <span className="text-sm text-white">{role}</span>
              <button className="text-xs text-emerald-accent hover:underline">Configure</button>
            </div>
          ))}
        </div>

        {/* Feature Toggles */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Feature Toggles</h2>
          {FEATURE_TOGGLES.map((t) => (
            <div key={t.name} className="flex items-center justify-between py-3 border-b border-white/[0.03] last:border-0">
              <div>
                <p className="text-sm text-white">{t.name}</p>
                <p className="text-xs text-theme-muted">{t.note}</p>
              </div>
              <div className={`w-10 h-5 rounded-full relative ${t.enabled ? 'bg-emerald-accent/30' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${t.enabled ? 'right-0.5 bg-emerald-accent' : 'left-0.5 bg-white/30'}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Leaderboard */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-1">Leaderboard</h2>
          <p className="text-xs text-theme-muted mb-4">Ranking criteria configuration — additional metrics will be added here.</p>
          <div className="space-y-3">
            {[
              { label: 'Completed Sessions', weight: '40 pts max', active: true },
              { label: 'Total Hours Worked',  weight: '40 pts max', active: true },
              { label: 'Average Quality Score', weight: '20 pts max', active: true },
              { label: 'Attendance Rate',    weight: 'Coming soon', active: false },
              { label: 'Assessment Score',   weight: 'Coming soon', active: false },
            ].map(({ label, weight, active }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                <span className={`text-sm ${active ? 'text-white' : 'text-theme-muted'}`}>{label}</span>
                <span className={`text-xs font-mono ${active ? 'text-emerald-accent' : 'text-theme-muted/50'}`}>{weight}</span>
              </div>
            ))}
          </div>
        </div>

        {/* External Tools */}
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-1">External Tools</h2>
          <p className="text-xs text-theme-muted mb-4">Quick links to infrastructure dashboards — open in a new tab.</p>
          <div className="space-y-3">
            {EXTERNAL_TOOLS.map(({ label, description, href, color }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${color}`}
              >
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{description}</p>
                </div>
                <ExternalLink size={14} className="shrink-0 opacity-60" />
              </a>
            ))}
          </div>
        </div>

        {/* Integrations */}
        <div className="glass-panel p-6 lg:col-span-2">
          <h2 className="text-sm font-bold text-white mb-4">Integrations</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {['Firebase Auth', 'PostgreSQL', 'Redis', 'Apache Guacamole', 'Uptime Kuma', 'Claude AI (placeholder)'].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-sm text-white">{i}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
