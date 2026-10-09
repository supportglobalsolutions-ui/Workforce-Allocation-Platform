'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  Clock,
  LifeBuoy,
  Monitor,
  Pencil,
  Play,
  Save,
  Timer,
  Trash2,
} from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { useAuth } from '@/lib/auth/AuthProvider';
import { reportError, reportWarning } from '@/lib/errors';
import { formatDurationShort } from '@/lib/hours';
import { api } from '@/lib/api';
import {
  cancelRdpReservation,
  createRdpReservation,
  getMyActiveRdp,
  listRdpReservations,
  updateRdpResource,
  type MyActiveRdp,
  type RdpClaimReservation,
  type RdpPortal,
  type RdpResource,
} from '@/lib/rdp';
import {
  RDP_EDITOR_ROLES,
  STAFF_ROLES,
  canClaimRdp,
  formatCountdown,
  formatEat,
  isGreenRdp,
  toLocalInputValue,
  unclaimableReason,
  useNow,
  useRdpClaim,
} from './claimShared';

interface RdpDesktopSettingsProps {
  rdpId: string;
  /** Portal that owns session links (see RdpClaimBoard). */
  basePath?: RdpPortal;
  /** Claim board this page was opened from. */
  backHref: string;
}

function defaultWindow(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return { start: toLocalInputValue(start), end: toLocalInputValue(end) };
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/[0.06] last:border-0">
      <span className="text-xs text-theme-muted">{label}</span>
      <span className="text-sm font-semibold text-white text-right truncate">{value || '—'}</span>
    </div>
  );
}

export default function RdpDesktopSettings({ rdpId, basePath = '/worker', backHref }: RdpDesktopSettingsProps) {
  const { session } = useAuth();
  const now = useNow(1000);
  const [machine, setMachine] = useState<RdpResource | null>(null);
  const [myActive, setMyActive] = useState<MyActiveRdp | null>(null);
  const [myWorkerId, setMyWorkerId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<RdpClaimReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [schedStart, setSchedStart] = useState(() => defaultWindow().start);
  const [schedEnd, setSchedEnd] = useState(() => defaultWindow().end);
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedMsg, setSchedMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const { claim, claiming, error: claimError, info: claimInfo, failedAttempts } = useRdpClaim(basePath);

  const isStaff = STAFF_ROLES.includes(session?.authRole ?? '');
  const canEdit = RDP_EDITOR_ROLES.includes(session?.authRole ?? '');

  const load = useCallback(async () => {
    try {
      const [m, active, worker, res] = await Promise.all([
        api.get<RdpResource>(`/rdp/${rdpId}`),
        getMyActiveRdp().catch(() => null),
        api.get<{ id: string }>('/workers/me').catch(() => null),
        listRdpReservations(rdpId).catch(() => [] as RdpClaimReservation[]),
      ]);
      setMachine(m);
      setMyActive(active);
      setMyWorkerId(worker?.id ?? null);
      setReservations(res);
      setLoadError(null);
    } catch (e) {
      reportWarning('Load desktop settings', e);
      setLoadError(e instanceof Error ? e.message : 'Could not load this desktop.');
    } finally {
      setLoading(false);
    }
  }, [rdpId]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (machine && !editing) {
      setName(machine.nickname);
      setHost(machine.monitor_host ?? '');
      setPort(machine.monitor_port != null ? String(machine.monitor_port) : '');
    }
  }, [machine, editing]);

  const ctx = useMemo(() => ({ myActive, myWorkerId, isStaff }), [myActive, myWorkerId, isStaff]);

  if (loading) {
    return (
      <div className="max-w-5xl space-y-4">
        <div className="glass-panel h-10 w-48 animate-pulse" />
        <div className="glass-panel h-56 animate-pulse" />
      </div>
    );
  }

  if (loadError || !machine) {
    return (
      <div className="max-w-5xl">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted hover:text-emerald-accent mb-4">
          <ArrowLeft size={14} /> Claim board
        </Link>
        <div className="glass-panel p-8 text-center">
          <p className="text-sm text-theme-muted">{loadError ?? 'This desktop is no longer available.'}</p>
        </div>
      </div>
    );
  }

  const isMine = myActive?.rdp_resource_id === machine.id;
  const claimable = canClaimRdp(machine, ctx);
  const green = isGreenRdp(machine, ctx);
  const limitMin = Math.round(Number(machine.daily_limit_hours ?? 12) * 60);
  const used = machine.used_minutes_today ?? 0;
  const windowOpen = machine.window_open !== false;
  const windowEndMs = machine.window_ends_at ? new Date(machine.window_ends_at).getTime() : null;
  const windowStartMs = machine.window_starts_at ? new Date(machine.window_starts_at).getTime() : null;
  // Time left = min(unused hours, real time until the window closes), ticking with `now`.
  const remaining = !windowOpen
    ? 0
    : windowEndMs != null
      ? Math.max(0, Math.min(limitMin - used, Math.floor((windowEndMs - now) / 60_000)))
      : machine.remaining_minutes_today ?? limitMin;
  const usedPct = limitMin > 0 ? Math.min(100, Math.round((used / limitMin) * 100)) : 0;
  // Counts to the window closing, or — when closed — to it opening.
  const windowMs = windowOpen
    ? (windowEndMs != null ? windowEndMs - now : null)
    : (windowStartMs != null ? windowStartMs - now : null);
  const reservedElsewhere =
    !isStaff && machine.reserved_for_worker_id && myWorkerId && machine.reserved_for_worker_id !== myWorkerId;

  const submitSchedule = async () => {
    if (!myWorkerId) return;
    setSchedSaving(true);
    setSchedMsg(null);
    try {
      await createRdpReservation(machine.id, {
        worker_id: myWorkerId,
        starts_at: new Date(schedStart).toISOString(),
        ends_at: new Date(schedEnd).toISOString(),
      });
      setSchedMsg({ kind: 'ok', text: 'Claim schedule saved.' });
      const w = defaultWindow();
      setSchedStart(w.start);
      setSchedEnd(w.end);
      await load();
    } catch (e) {
      setSchedMsg({ kind: 'error', text: reportError('Create claim schedule', e) });
    } finally {
      setSchedSaving(false);
    }
  };

  const cancelSchedule = async (r: RdpClaimReservation) => {
    try {
      await cancelRdpReservation(machine.id, r.id);
      await load();
    } catch (e) {
      setSchedMsg({ kind: 'error', text: reportError('Cancel claim schedule', e) });
    }
  };

  const saveDetails = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSaveMsg({ kind: 'error', text: 'Name cannot be empty.' });
      return;
    }
    const portNum = port.trim() ? Number(port) : null;
    if (portNum != null && (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)) {
      setSaveMsg({ kind: 'error', text: 'Port must be a whole number between 1 and 65535.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateRdpResource(machine.id, {
        nickname: trimmed,
        monitor_host: host.trim() || null,
        monitor_port: portNum,
      });
      setMachine(updated);
      setEditing(false);
      setSaveMsg({ kind: 'ok', text: 'Desktop details saved.' });
    } catch (e) {
      setSaveMsg({ kind: 'error', text: reportError('Update desktop details', e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-muted hover:text-emerald-accent mb-3">
        <ArrowLeft size={14} /> Claim board
      </Link>
      <PageHeader title={machine.nickname} besideTitle={<StatusBadge status={machine.status} />} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Time + claim */}
          <section className={`rdp-card ${green ? 'rdp-card--green' : 'rdp-card--gold'} on-dark-surface p-6`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  {windowOpen ? 'Time left today' : 'Window closed'}
                </p>
                <p className="mt-1 text-4xl font-black tracking-tight tabular-nums">{formatDurationShort(remaining)}</p>
                <p className="text-xs text-white/70 mt-1">
                  {formatDurationShort(used)} of {formatDurationShort(limitMin)} used
                </p>
              </div>
              <span className="rdp-card__icon w-12 h-12">
                <Monitor size={22} />
              </span>
            </div>

            <div className="rdp-card__track mt-4">
              <div className="rdp-card__fill" style={{ width: `${usedPct}%` }} />
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-black/15 border border-white/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 flex items-center gap-1.5">
                  <Timer size={12} /> {windowOpen ? 'Window closes in' : 'Opens in'}
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {windowMs != null ? formatCountdown(Math.max(0, windowMs)) : '—'}
                </p>
                {(windowOpen ? machine.window_ends_at : machine.window_starts_at) && (
                  <p className="text-[11px] text-white/60">
                    {formatEat((windowOpen ? machine.window_ends_at : machine.window_starts_at) as string)}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-black/15 border border-white/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 flex items-center gap-1.5">
                  <Clock size={12} /> Reservation
                </p>
                {machine.reservation_ends_at ? (
                  <>
                    <p className="mt-1 text-xl font-bold tabular-nums">
                      {formatCountdown(new Date(machine.reservation_ends_at).getTime() - now)}
                    </p>
                    <p className="text-[11px] text-white/60">
                      {reservedElsewhere
                        ? `Reserved for someone else until ${formatEat(machine.reservation_ends_at)}`
                        : `Reserved for you until ${formatEat(machine.reservation_ends_at)}`}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-white/80">Not reserved</p>
                )}
              </div>
            </div>

            <div className="mt-5">
              {isMine ? (
                <Link href={`${basePath}/rdp-session/${machine.id}`} className="rdp-card__cta w-full py-3 text-sm">
                  <Play size={15} /> Open session
                </Link>
              ) : claimable ? (
                <button
                  type="button"
                  onClick={() => void claim(machine.id)}
                  disabled={claiming === machine.id}
                  className="rdp-card__cta w-full py-3 text-sm"
                >
                  <Play size={15} />
                  {claiming === machine.id
                    ? 'Testing connection…'
                    : machine.status === 'assigned' ? 'Claim shift machine' : 'Claim desktop'}
                </button>
              ) : (
                <p className="text-sm text-center text-white/80 rounded-xl bg-black/15 border border-white/10 py-3 px-4">
                  {unclaimableReason(machine, ctx)}
                </p>
              )}
              {claimError && <p className="mt-3 text-sm text-red-200">{claimError}</p>}
              {claimInfo && <p className="mt-3 text-sm text-white/85">{claimInfo}</p>}
              {failedAttempts >= 3 && (
                <p className="mt-3 flex items-start gap-2 text-xs text-white/80">
                  <LifeBuoy size={14} className="mt-0.5 shrink-0" />
                  <span>
                    That has failed {failedAttempts} times.{' '}
                    <Link href={`${basePath}/chat`} className="font-semibold underline">Message an administrator</Link>
                    {' '}and we will look at the machine.
                  </span>
                </p>
              )}
            </div>
          </section>

          {/* Schedules */}
          <section className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock size={16} className="text-gold-accent" />
              <h2 className="text-sm font-bold text-theme-heading">Claim schedule</h2>
            </div>

            {reservations.length === 0 ? (
              <p className="text-xs text-theme-muted mb-4">No upcoming schedules on this desktop.</p>
            ) : (
              <div className="space-y-2 mb-5">
                {reservations.map((r) => {
                  const startMs = new Date(r.starts_at).getTime();
                  const endMs = new Date(r.ends_at).getTime();
                  const live = now >= startMs;
                  const own = r.worker_id === myWorkerId;
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${
                        live ? 'border-emerald-accent/40 bg-emerald-accent/10' : 'border-gold-accent/30 bg-gold-accent/[0.07]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-theme-heading">
                          {formatEat(r.starts_at)} → {formatEat(r.ends_at)}
                        </p>
                        <p className="text-xs text-theme-muted">
                          {own ? 'Your schedule' : r.worker_name ?? 'Another worker'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-bold tabular-nums ${live ? 'text-emerald-accent' : 'text-gold-accent'}`}>
                          {live ? `Ends in ${formatCountdown(endMs - now)}` : `Starts in ${formatCountdown(startMs - now)}`}
                        </span>
                        {(own || isStaff) && (
                          <button
                            type="button"
                            onClick={() => void cancelSchedule(r)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-danger hover:bg-white/5"
                            title="Cancel schedule"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {myWorkerId ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-theme-muted mb-3">
                  During a scheduled window only you can claim this desktop. Max length is its daily limit
                  ({machine.daily_limit_hours ?? 12}h).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Starts</span>
                    <input type="datetime-local" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} className="input-field" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Ends</span>
                    <input type="datetime-local" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} className="input-field" />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                  <span className={`text-xs ${schedMsg?.kind === 'error' ? 'text-danger' : 'text-emerald-accent'}`}>
                    {schedMsg?.text}
                  </span>
                  <button
                    type="button"
                    disabled={schedSaving || !schedStart || !schedEnd}
                    onClick={() => void submitSchedule()}
                    className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
                  >
                    <CalendarClock size={14} />
                    {schedSaving ? 'Saving…' : 'Schedule claim'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-theme-muted">
                Scheduling needs a worker profile. Admins can schedule workers from RDP Resources.
              </p>
            )}
          </section>
        </div>

        {/* Details */}
        <section className="glass-panel p-5 h-fit">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-theme-heading">Desktop details</h2>
            {canEdit && !editing && (
              <button
                type="button"
                onClick={() => { setEditing(true); setSaveMsg(null); }}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} className="input-field" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Host / IP</span>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="e.g. 203.0.113.10" className="input-field font-mono" />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">RDP port</span>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder="3389"
                  className="input-field font-mono"
                />
              </label>
              <div className="flex gap-2 justify-end pt-1">
                <button type="button" onClick={() => { setEditing(false); setSaveMsg(null); }} className="btn-secondary text-sm py-2 px-3">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveDetails()}
                  disabled={saving}
                  className="btn-primary text-sm py-2 px-3 flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Save size={13} /> {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <DetailRow label="Name" value={machine.nickname} />
              {isStaff && (
                <>
                  <DetailRow label="Host / IP" value={machine.monitor_host && <span className="font-mono">{machine.monitor_host}</span>} />
                  <DetailRow label="RDP port" value={<span className="font-mono">{machine.monitor_port ?? 3389}</span>} />
                </>
              )}
              <DetailRow label="Country" value={machine.country} />
              <DetailRow label="Pool" value={machine.client_group} />
              <DetailRow label="Daily limit" value={`${machine.daily_limit_hours ?? 12}h`} />
              {isStaff && <DetailRow label="Assigned to" value={machine.assigned_worker_name} />}
            </div>
          )}
          {saveMsg && (
            <p className={`mt-3 text-xs ${saveMsg.kind === 'error' ? 'text-danger' : 'text-emerald-accent'}`}>{saveMsg.text}</p>
          )}
          {canEdit && (
            <Link href="/admin/rdp" className="mt-4 block text-xs font-semibold text-emerald-accent hover:underline">
              More settings in RDP Resources →
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}
