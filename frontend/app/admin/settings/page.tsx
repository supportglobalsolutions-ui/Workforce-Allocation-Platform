'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, FlaskConical, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { SYSTEM_TABS } from '@/components/platform/AdminSectionTabs';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { enableTestMode, leaveTestMode, useTestModeUid } from '@/lib/testMode';

const PLATFORM = [
  { name: 'Supabase Auth', status: 'Connected' },
  { name: 'PostgreSQL', status: 'Connected' },
  { name: 'Supabase Database & Realtime', status: 'Active' },
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
  alert_email_masked?: string;
  otp_recipient_masked: string | null;
  using_previous_email: boolean;
  configured_email_trusted_at: string | null;
  otp_ready: boolean;
  otp_blocked_reason: string | null;
  can_edit_alert_email?: boolean;
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
  const canEdit = data?.can_edit_alert_email === true;

  return (
    <section className="glass-panel p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-accent/30 bg-gold-accent/10 text-gold-accent">
          <Mail size={16} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-theme-heading">Admin alert email</h2>
          <p className="text-xs text-theme-muted mt-1">
            Receives confirmation codes for irreversible actions. Only a protected Super Admin can change this address.
            After a change, the new address cannot receive those codes for 24 hours.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><SpinningDots size="sm" className="text-emerald-accent" /></div>
      ) : error && !data ? (
        <p className="text-xs text-danger flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" /> {error}
        </p>
      ) : !canEdit ? (
        <div className="space-y-2">
          <p className="text-sm text-theme-heading font-medium">
            {data?.alert_email_masked || data?.alert_email || '—'}
          </p>
          <p className="text-xs text-theme-muted">
            This inbox can only be changed by a protected Super Admin.
          </p>
        </div>
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

/** Extra inboxes that also receive emails sent in test mode. */
function TestEmailsEditor() {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get<{ emails: string[] }>('/settings/test-mode-emails')
      .then((r) => setEmails(r.emails))
      .catch(() => { /* leave the list empty */ });
  }, []);

  async function save(next: string[], done: string) {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api.put<{ emails: string[] }>('/settings/test-mode-emails', { emails: next });
      setEmails(r.emails);
      setMsg({ kind: 'ok', text: done });
      return true;
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save test emails.' });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    const addr = draft.trim().toLowerCase();
    if (!addr) return;
    if (emails.includes(addr)) { setDraft(''); return; }
    if (await save([...emails, addr], `${addr} will receive test emails.`)) setDraft('');
  }

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <h3 className="text-xs font-bold text-theme-heading flex items-center gap-1.5">
        <Mail size={13} /> Test email recipients
      </h3>
      <p className="text-xs text-theme-muted mt-1">
        Emails sent in test mode go to whoever is testing, plus these addresses. Nobody else receives them.
      </p>
      {emails.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {emails.map((e) => (
            <li key={e} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-3 pr-1.5 py-1 text-xs text-theme-heading">
              {e}
              <button
                type="button"
                aria-label={`Remove ${e}`}
                disabled={saving}
                onClick={() => void save(emails.filter((x) => x !== e), `${e} removed.`)}
                className="rounded-full p-0.5 text-theme-muted hover:text-danger disabled:opacity-50"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(ev) => { ev.preventDefault(); void add(); }}
      >
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="name@company.com"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-theme-heading"
        />
        <button type="submit" disabled={saving || !draft.trim()} className="btn-secondary text-xs disabled:opacity-50">
          {saving ? 'Saving…' : 'Add email'}
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-xs ${msg.kind === 'ok' ? 'text-emerald-accent' : 'text-danger'}`}>{msg.text}</p>
      )}
    </div>
  );
}

interface TestModeState {
  ready: boolean;
  building: boolean;
  error: string | null;
}

function TestModeCard({ uid }: { uid: string }) {
  const on = useTestModeUid() === uid;
  const [state, setState] = useState<TestModeState | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api.get<TestModeState>('/test-mode').then(setState).catch((e) => {
      setError(e instanceof Error ? e.message : 'Could not load test mode.');
    });
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.get<TestModeState>('/test-mode');
        setState(next);
        if (next.ready) {
          enableTestMode(uid);
          window.location.reload();
        } else if (!next.building) {
          setWaiting(false);
          setError(next.error || 'Setting up the test workspace failed. Try again.');
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting, uid]);

  async function turnOn() {
    setError(null); setNote(null);
    try {
      const next = await api.post<TestModeState>('/test-mode/prepare', {});
      setState(next);
      if (next.ready) {
        enableTestMode(uid);
        window.location.reload();
      } else {
        setWaiting(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on test mode.');
    }
  }

  async function clearData() {
    if (!window.confirm('Delete all test data for every admin? Real data is not affected.')) return;
    setClearing(true); setError(null); setNote(null);
    try {
      const next = await api.delete<TestModeState>('/test-mode/data');
      setState(next);
      if (on) {
        leaveTestMode();
        return;
      }
      setNote('Test data cleared. Turning test mode on again starts with an empty workspace.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear test data.');
    } finally {
      setClearing(false);
    }
  }

  const busy = waiting || state?.building;

  return (
    <section className="glass-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/10 text-amber-400">
            <FlaskConical size={16} />
          </span>
          <div>
            <h2 className="text-sm font-bold text-theme-heading">Test mode</h2>
            <p className="text-xs text-theme-muted mt-1">
              While it&apos;s on you work in a test copy of the platform that starts empty: everything you add is
              test data, and real workers, payroll and desktops are hidden. Every admin who turns test mode on
              shares the same test data, and it stays until someone clears it. Everyone else keeps working on
              real data. Emails only go to your own address and the test addresses below, marked [TEST], and real
              desktop logins and accounts can&apos;t be changed.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Test mode"
          disabled={!!busy || !state}
          onClick={() => (on ? leaveTestMode() : void turnOn())}
          className={`theme-toggle-track shrink-0 disabled:opacity-50 ${on ? '!bg-amber-400/80' : ''}`}
        >
          <span className={`theme-toggle-thumb ${on ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {busy && (
          <p className="text-xs text-amber-400 flex items-center gap-2">
            <SpinningDots size="sm" className="text-amber-400" /> Setting up your test workspace — about a minute…
          </p>
        )}
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
        {state?.ready && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-theme-muted">
              {on ? 'Test mode is on.' : 'Test mode is off. Your test data is kept for next time.'}
            </p>
            <button
              type="button"
              onClick={() => void clearData()}
              disabled={clearing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger hover:underline disabled:opacity-50"
            >
              <Trash2 size={12} /> {clearing ? 'Clearing…' : 'Clear test data'}
            </button>
          </div>
        )}
      </div>

      <TestEmailsEditor />
    </section>
  );
}

export default function SystemSettingsPage() {
  const { session } = useAuth();
  return (
    <div>
      <PageHeader
        title="Settings"
      />
      <AdminSectionTabs tabs={SYSTEM_TABS} />

      <div className="max-w-3xl mx-auto space-y-6">
        {(session?.authRole === 'admin' || session?.authRole === 'super_admin') && <TestModeCard uid={session.uid} />}
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
              Role changes and pending approvals are on Accounts.
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
