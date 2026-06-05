'use client';

import PageHeader from '@/components/platform/PageHeader';

const toggles = [
  { name: 'WhatsApp Notifications', enabled: false, note: 'Deferred until Business account active' },
  { name: 'Claude AI Summaries', enabled: false, note: 'Pending API funding' },
  { name: 'Firebase Real-time Board', enabled: true, note: 'Active' },
  { name: 'Guacamole RDP Gateway', enabled: true, note: 'Active' },
];

export default function SystemSettingsPage() {
  return (
    <div>
      <PageHeader
        title="System Settings"
        description="Roles, permissions, feature toggles, integrations, and environment configuration."
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Roles & Permissions</h2>
          {['CEO / Leadership', 'Handler / Operations Lead', 'Country Manager', 'Worker (GS)', 'Partner Worker', 'Technical Admin'].map((role) => (
            <div key={role} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
              <span className="text-sm text-white">{role}</span>
              <button className="text-xs text-emerald-accent hover:underline">Configure</button>
            </div>
          ))}
        </div>
        <div className="glass-panel p-6">
          <h2 className="text-sm font-bold text-white mb-4">Feature Toggles</h2>
          {toggles.map((t) => (
            <div key={t.name} className="flex items-center justify-between py-3 border-b border-white/[0.03] last:border-0">
              <div>
                <p className="text-sm text-white">{t.name}</p>
                <p className="text-xs text-brand-on-surface-variant">{t.note}</p>
              </div>
              <div className={`w-10 h-5 rounded-full relative ${t.enabled ? 'bg-emerald-accent/30' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full ${t.enabled ? 'right-0.5 bg-emerald-accent' : 'left-0.5 bg-white/30'}`} />
              </div>
            </div>
          ))}
        </div>
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
