'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, PenLine, Sparkles } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Me {
  id: string;
  display_name: string;
  worker_type: string;
  partner_entity_name: string | null;
}

interface ExternalSession {
  id: string;
  session_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  payroll_approval_state: string | null;
  type_specific_fields: {
    platform_name?: string;
    earnings_amount?: number;
    notes?: string;
  } | null;
}

const TYPE_LABELS: Record<string, string> = {
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third-party Platform',
};

const PLATFORM_SUGGESTIONS = ['Outlier', 'Alignerr', 'DataAnnotation'];

// payroll_approval_state → StatusBadge status key (colors from lib/status)
const PAYROLL_STATE_BADGE: Record<string, { status: string; label: string }> = {
  pending:  { status: 'pending',   label: 'Pending' },
  approved: { status: 'approved',  label: 'Approved' },
  flagged:  { status: 'suspended', label: 'Flagged' },
  excluded: { status: 'offline',   label: 'Excluded' },
};

const fmt = (x: number) =>
  Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatDuration(minutes: number | null) {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ExternalSessionPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [meLoading, setMeLoading] = useState(true);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [sessionType, setSessionType] = useState<'partner_multilog' | 'third_party_platform'>('third_party_platform');
  const [platformName, setPlatformName] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [earnings, setEarnings] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // History
  const [history, setHistory] = useState<ExternalSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Me>('/workers/me')
      .then((w) => {
        setMe(w);
        if (w.worker_type === 'partner_worker') setSessionType('partner_multilog');
      })
      .catch((e) => setMeError(e instanceof Error ? e.message : 'Failed to load your profile'))
      .finally(() => setMeLoading(false));
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const [multilog, thirdParty] = await Promise.all([
        api.get<ExternalSession[]>('/sessions?type=partner_multilog&limit=50'),
        api.get<ExternalSession[]>('/sessions?type=third_party_platform&limit=50'),
      ]);
      const merged = [...multilog, ...thirdParty].sort(
        (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
      );
      setHistory(merged);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Failed to load session history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const totalMinutes = (parseInt(hours || '0', 10) * 60) + parseInt(minutes || '0', 10);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (totalMinutes <= 0) {
      setSubmitError('Enter a duration greater than zero.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const start = new Date(`${date}T${startTime}`);
      const end = new Date(start.getTime() + totalMinutes * 60_000);
      const created = await api.post<{ id: string }>('/sessions', {
        worker_id: me.id,
        session_type: sessionType,
        start_time: start.toISOString(),
        client_id: null,
        type_specific_fields: {
          platform_name: platformName.trim() || undefined,
          earnings_amount: earnings !== '' ? Number(earnings) : undefined,
          notes: notes.trim() || undefined,
        },
      });
      await api.patch(`/sessions/${created.id}`, {
        end_time: end.toISOString(),
        duration_minutes: totalMinutes,
      });
      setSuccess(true);
      setPlatformName(''); setHours(''); setMinutes(''); setEarnings(''); setNotes('');
      await loadHistory();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to log session');
    } finally {
      setSubmitting(false);
    }
  }

  const rows = history.map((s) => ({
    id: s.id,
    date: new Date(s.start_time).toLocaleDateString(),
    type: TYPE_LABELS[s.session_type] ?? s.session_type,
    platform: s.type_specific_fields?.platform_name ?? '—',
    duration: formatDuration(s.duration_minutes),
    earnings: s.type_specific_fields?.earnings_amount != null
      ? fmt(s.type_specific_fields.earnings_amount)
      : '—',
    payroll_state: s.payroll_approval_state ?? 'pending',
  }));

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      <PageHeader
        title="External Session Logging"
        description="Log completed partner multilog or third-party platform work (Outlier, Alignerr, DataAnnotation) so it counts toward payroll."
      />

      {meLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : meError ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {meError}
        </div>
      ) : (
        <>
          {me?.worker_type === 'partner_worker' && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gold-accent/10 border border-gold-accent/30 text-gold-accent text-xs">
              <Sparkles size={14} className="shrink-0" />
              You are a partner worker{me.partner_entity_name ? ` (${me.partner_entity_name})` : ''} — use <span className="font-bold">Partner Multilog</span> for sessions worked through your partner&apos;s accounts.
            </div>
          )}

          {success ? (
            <div className="glass-panel p-6 rounded-2xl border border-emerald-accent/30 space-y-4">
              <div className="flex items-center gap-3 text-emerald-accent">
                <CheckCircle size={20} className="shrink-0" />
                <p className="text-sm font-semibold">
                  Session logged successfully. It appears in your history below and counts toward payroll once approved.
                </p>
              </div>
              <button type="button" onClick={() => { setSuccess(false); setSubmitError(null); }} className="btn-secondary text-sm py-2 px-4">
                Log another session
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-2xl space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Session Type</label>
                  <select
                    value={sessionType}
                    onChange={(e) => setSessionType(e.target.value as typeof sessionType)}
                    className="input-field"
                    required
                  >
                    <option value="partner_multilog">Partner Multilog</option>
                    <option value="third_party_platform">Third-party Platform</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Platform Name</label>
                  <input
                    type="text"
                    list="platform-suggestions"
                    placeholder="e.g. Outlier, Alignerr, DataAnnotation"
                    value={platformName}
                    onChange={(e) => setPlatformName(e.target.value)}
                    className="input-field"
                    required
                  />
                  <datalist id="platform-suggestions">
                    {PLATFORM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Date</label>
                  <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="input-field" required />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Start Time</label>
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="input-field" required />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Duration</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="number" min={0} max={24} placeholder="0"
                        value={hours} onChange={(e) => setHours(e.target.value)}
                        className="input-field pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted pointer-events-none">hrs</span>
                    </div>
                    <div className="relative">
                      <input
                        type="number" min={0} max={59} placeholder="0"
                        value={minutes} onChange={(e) => setMinutes(e.target.value)}
                        className="input-field pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-theme-muted pointer-events-none">min</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Earnings Amount</label>
                  <input
                    type="number" step="0.01" min={0} placeholder="0.00"
                    value={earnings} onChange={(e) => setEarnings(e.target.value)}
                    className="input-field"
                  />
                  <p className="text-[11px] text-theme-muted mt-1.5">
                    Your portion of the platform payout for these hours — used by payroll splits.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-theme-muted mb-1.5 block">Notes</label>
                <textarea
                  rows={3} placeholder="Additional context…"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  className="input-field resize-none"
                />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {submitError}
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60">
                {submitting ? <SpinningDots size="sm" className="text-white" /> : <PenLine size={15} />}
                {submitting ? 'Logging…' : 'Submit Session Log'}
              </button>
            </form>
          )}
        </>
      )}

      {/* History */}
      <section aria-label="External session history">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Logged sessions</h2>
            <p className="text-xs text-theme-muted mt-1">
              {historyLoading ? 'Loading…' : `${history.length} external session${history.length !== 1 ? 's' : ''} on record`}
            </p>
          </div>
        </div>

        {historyLoading ? (
          <div className="flex justify-center py-10"><SpinningDots size="md" className="text-emerald-accent" /></div>
        ) : historyError ? (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
            <AlertCircle size={16} /> {historyError}
          </div>
        ) : (
          <DataTable
            columns={[
              { key: 'date', header: 'Date' },
              { key: 'type', header: 'Type' },
              { key: 'platform', header: 'Platform' },
              { key: 'duration', header: 'Duration' },
              { key: 'earnings', header: 'Earnings' },
              {
                key: 'payroll_state', header: 'Payroll State',
                render: (r) => {
                  const mapping = PAYROLL_STATE_BADGE[r.payroll_state as string]
                    ?? { status: r.payroll_state as string, label: r.payroll_state as string };
                  return <StatusBadge status={mapping.status} label={mapping.label} />;
                },
              },
            ]}
            data={rows as unknown as Record<string, unknown>[]}
            emptyMessage="No external sessions logged yet."
          />
        )}
      </section>
    </div>
  );
}
