'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Maximize2, Power } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import ConfirmModal from '@/components/platform/ConfirmModal';
import SessionImageUpload from '@/components/rdp/SessionImageUpload';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';
import {
  broadcastRdpSessionEnded,
  endRdpConnectionSafe,
  getMyActiveRdp,
  openRdpDesktopTab,
  sessionEvidenceUrl,
} from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
}

export default function RdpSessionPage({ params }: { params: { rdpId: string } }) {
  const rdpId = params.rdpId;
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then(setMachine)
      .catch((e) => setError(reportError('Load RDP machine', e, { rdpId })))
      .finally(() => setLoading(false));
  }, [rdpId]);

  useEffect(() => {
    if (loading || !machine) return;
    getMyActiveRdp()
      .then((active) => {
        if (active?.session_id) setSessionId(active.session_id);
        // Prefer server start time so a refresh does not reset the timer.
        if (active?.session_id) {
          api.get<{ start_time?: string }>(`/sessions/${active.session_id}`)
            .then((s) => {
              if (s.start_time) {
                const ms = new Date(s.start_time).getTime();
                if (Number.isFinite(ms)) setStartedAtMs(ms);
              }
            })
            .catch(() => { /* keep local clock */ });
        }
      })
      .catch(() => { /* non-critical */ });
  }, [loading, machine]);

  useEffect(() => {
    if (startedAtMs == null) setStartedAtMs(Date.now());
  }, [startedAtMs]);

  useEffect(() => {
    if (startedAtMs == null) return;
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAtMs]);

  useEffect(() => {
    if (loading || !machine) return;
    const ping = async () => {
      try {
        const sid = sessionId ?? (await getMyActiveRdp())?.session_id ?? null;
        if (sid) await api.post(`/sessions/${sid}/heartbeat`, {});
      } catch {
        /* ignore */
      }
    };
    ping();
    const hb = setInterval(ping, 5 * 60 * 1000);
    return () => clearInterval(hb);
  }, [loading, machine, sessionId]);

  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = (e) => {
        if (e.data?.type === 'session-ended' && e.data?.rdpId === rdpId) {
          const dest =
            (e.data?.evidenceUrl as string | undefined) ||
            sessionEvidenceUrl(rdpId);
          window.location.replace(dest);
        }
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [rdpId]);

  const handleEndConnection = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    let sid = sessionId;
    if (!sid) {
      try {
        sid = (await getMyActiveRdp())?.session_id ?? null;
      } catch {
        sid = null;
      }
    }
    const dest = sessionEvidenceUrl(rdpId, sid);

    // Close the desktop tab first so Guacamole release is fast and the
    // claim board clears immediately — do not wait for the API.
    broadcastRdpSessionEnded({
      rdpId,
      sessionId: sid,
      evidenceUrl: dest,
      openedBy: 'control',
    });

    const result = await endRdpConnectionSafe(rdpId);
    if (!result.ok) {
      const msg = reportError('End RDP connection', result.error, { rdpId });
      setError(msg);
      setEnding(false);
      return;
    }

    setConfirmEnd(false);
    window.location.assign(dest);
  }, [ending, rdpId, sessionId]);

  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');

  if (loading) {
    return <p className="text-theme-muted text-sm mt-4">Loading session…</p>;
  }

  if (error && !machine) {
    return (
      <div className="max-w-6xl">
        <p className="text-danger text-sm">{error}</p>
        <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm mt-4 inline-block">
          Back to claim board
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-4">
      <PageHeader
        title={machine?.nickname ?? 'Remote session'}
        description={`${machine?.country ?? ''} · ${machine?.client_group ?? ''}`.trim()}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status="active" label="Live" />
            <span className="font-mono text-emerald-accent text-sm">{h}:{m}:{s}</span>
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              disabled={ending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-900/40 border border-red-500/80 disabled:opacity-50 transition-colors"
            >
              <Power size={14} />
              {ending ? 'Ending…' : 'End session'}
            </button>
          </div>
        }
      />

      {error && <p className="text-danger text-sm">{error}</p>}

      {/* The desktop runs in its own tab so it gets the whole screen. */}
      <div className="glass-panel p-5 space-y-3">
        <p className="text-sm text-theme-muted">
          Your remote desktop runs in a <strong className="text-theme-heading">separate tab</strong> at full
          screen. Keep this page open — it tracks your session time and is where you end the session.
        </p>
        <button
          type="button"
          onClick={() => openRdpDesktopTab(rdpId)}
          className="btn-primary inline-flex items-center gap-2 text-sm py-2 px-4"
        >
          <Maximize2 size={15} />
          Open desktop tab
        </button>
        <p className="text-xs text-theme-muted">
          Already open? This focuses the existing tab instead of starting a second session. If
          nothing happens, allow pop-ups for this site.
        </p>
      </div>

      {sessionId && (
        <div className="glass-panel p-5">
          <p className="text-xs text-theme-muted uppercase tracking-wide mb-3">Session start</p>
          <SessionImageUpload
            sessionId={sessionId}
            imageType="start"
            label="Upload a screenshot taken at session start"
          />
        </div>
      )}

      <ConfirmModal
        open={confirmEnd}
        title="End this session?"
        body={
          <>
            <span className="font-medium text-theme-heading">{machine?.nickname}</span>
            {' '}will be disconnected and released back to the pool.
          </>
        }
        tone="danger"
        icon={Power}
        confirmLabel={ending ? 'Ending…' : 'Yes, end session'}
        busy={ending}
        onConfirm={() => { void handleEndConnection(); }}
        onCancel={() => { if (!ending) setConfirmEnd(false); }}
      />

      <div>
        <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm">
          Claim board
        </Link>
      </div>
    </div>
  );
}
