'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Monitor, Plus } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';
import {
  cancelRdpReservation,
  listMyRdpReservations,
  type RdpClaimReservation,
} from '@/lib/rdp';

interface ClaimShift {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  rdp_resource_id: string | null;
  rdp_nickname?: string | null;
  pending_request?: { kind: string } | null;
}

function formatEat(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Africa/Nairobi',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' EAT';
  } catch {
    return iso;
  }
}

/**
 * RDP claim shifts: desktop bookings made on My Schedule ("RDP claim shift").
 * Admins approve them like any shift; once approved the desktop is held for
 * the worker during those hours. Older claim-board reservations are listed
 * underneath until they run out.
 */
export default function ClaimSchedulesPage() {
  const [shifts, setShifts] = useState<ClaimShift[]>([]);
  const [reservations, setReservations] = useState<RdpClaimReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    Promise.all([
      api.get<ClaimShift[]>('/shifts?kind=rdp_claim&upcoming=true').then(setShifts),
      listMyRdpReservations().then(setReservations).catch(() => setReservations([])),
    ]).catch((e) => setError(reportError('Load claim shifts', e)));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelShift = async (s: ClaimShift) => {
    setBusyId(s.id);
    setError(null);
    try {
      await api.delete(`/shifts/${s.id}`);
      setShifts((prev) => prev.filter((row) => row.id !== s.id));
    } catch (e) {
      setError(reportError('Cancel claim shift', e));
    } finally {
      setBusyId(null);
    }
  };

  const cancelReservation = async (r: RdpClaimReservation) => {
    setBusyId(r.id);
    setError(null);
    try {
      await cancelRdpReservation(r.rdp_resource_id, r.id);
      setReservations((prev) => prev.filter((row) => row.id !== r.id));
    } catch (e) {
      setError(reportError('Cancel desktop reservation', e));
    } finally {
      setBusyId(null);
    }
  };

  const live = shifts.filter((s) => s.status === 'pending' || s.status === 'approved');

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="Claim shifts"
        description="Desktops you booked on My Schedule. Once an admin approves, the desktop is held for you during those hours — admins can still override."
        actions={
          <Link
            href="/worker/my-schedule"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gold-accent px-3.5 py-2 text-xs font-bold text-brand-background transition-colors hover:bg-gold-accent/90 active:scale-[0.98]"
          >
            <Plus size={15} />
            Book on My Schedule
          </Link>
        }
      />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : live.length === 0 && reservations.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
          <Monitor size={22} className="mx-auto mb-3 text-theme-muted" />
          <p className="text-sm text-theme-muted">
            No claim shifts yet. Open{' '}
            <Link href="/worker/my-schedule" className="font-semibold underline hover:no-underline">
              My Schedule
            </Link>
            , switch to <strong>RDP claim shift</strong>, and pick a desktop for each day.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {live.map((s) => (
              <li
                key={s.id}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-accent/25 bg-emerald-accent/10 text-emerald-accent">
                    <Monitor size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                      {s.rdp_nickname ?? 'Desktop'}
                      <StatusBadge status={s.status} />
                    </p>
                    <p className="mt-0.5 text-xs text-theme-muted">
                      {formatEat(s.scheduled_start)} → {formatEat(s.scheduled_end)}
                    </p>
                    {s.pending_request && (
                      <p className="mt-0.5 text-[11px] text-amber-400">
                        {s.pending_request.kind === 'delete' ? 'Delete' : 'Change'} request waiting for an admin
                      </p>
                    )}
                  </div>
                </div>
                {s.status === 'pending' ? (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => void cancelShift(s)}
                    className="shrink-0 text-xs font-semibold text-theme-muted transition-colors hover:text-danger disabled:opacity-50"
                  >
                    {busyId === s.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                ) : (
                  <Link
                    href="/worker/my-shifts"
                    className="shrink-0 text-xs font-semibold text-theme-muted transition-colors hover:text-emerald-accent"
                  >
                    Change or delete in My shifts
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {reservations.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                Earlier desktop reservations
              </h2>
              <ul className="space-y-2">
                {reservations.map((r) => (
                  <li
                    key={r.id}
                    className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 px-4 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{r.rdp_nickname ?? 'Desktop'}</p>
                      <p className="mt-0.5 text-xs text-theme-muted">
                        {formatEat(r.starts_at)} → {formatEat(r.ends_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => void cancelReservation(r)}
                      className="shrink-0 text-xs font-semibold text-theme-muted transition-colors hover:text-danger disabled:opacity-50"
                    >
                      {busyId === r.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
