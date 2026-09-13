'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Maximize2, Power } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionImageUpload from '@/components/rdp/SessionImageUpload';
import { api } from '@/lib/api';
import { endRdpConnection, getMyActiveRdp, openRdpDesktopTab } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
}

type EndStep = 'idle' | 'upload-end-image' | 'confirm';

export default function RdpSessionPage({ params }: { params: { rdpId: string } }) {
  const router = useRouter();
  const rdpId = params.rdpId;
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [endStep, setEndStep] = useState<EndStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then(setMachine)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load machine'))
      .finally(() => setLoading(false));
  }, [rdpId]);

  useEffect(() => {
    if (loading || !machine) return;
    getMyActiveRdp()
      .then((active) => { if (active?.session_id) setSessionId(active.session_id); })
      .catch(() => { /* non-critical */ });
  }, [loading, machine]);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

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
          const dest = e.data?.evidenceUrl as string | undefined;
          if (dest) window.location.replace(dest);
        }
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [rdpId, router, sessionId]);

  const handleEndConnection = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    setEndStep('idle');
    let sid = sessionId;
    if (!sid) {
      try {
        sid = (await getMyActiveRdp())?.session_id ?? null;
      } catch {
        sid = null;
      }
    }
    const q = new URLSearchParams({ evidence: '1', rdp: rdpId });
    if (sid) q.set('session', sid);
    const dest = `/worker/session-history?${q.toString()}`;
    const tab = window.open(dest, '_blank');
    try {
      const ch = new BroadcastChannel('rdp-events');
      ch.postMessage({ type: 'session-ended', rdpId, sessionId: sid, evidenceUrl: dest, openedBy: 'control' });
      ch.close();
    } catch { /* ignore */ }
    if (!tab) router.push(dest);
    void endRdpConnection(rdpId).catch(() => { /* already left session page */ });
  }, [ending, rdpId, router, sessionId]);

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
            {/* Always reachable without scrolling — this is the control workers
                need most and it used to sit below the fold. */}
            <button
              type="button"
              onClick={() => setEndStep('confirm')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-300 bg-red-500/12 hover:bg-red-500/20 border border-red-500/30 transition-colors"
            >
              <Power size={13} />
              End session
            </button>
          </div>
        }
      />

      {error && <p className="text-danger text-sm">{error}</p>}

      {/* The desktop runs in its own tab so it gets the whole screen. */}
      <div className="glass-panel p-5 space-y-3">
        <p className="text-sm text-theme-muted">
          Your remote desktop runs in a <strong className="text-white">separate tab</strong> at full
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

      {endStep === 'upload-end-image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEndStep('idle')}
        >
        <div
          className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-white/10"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-[3px] bg-gradient-to-r from-blue-800 via-blue-500 to-blue-800" />
          <div className="bg-[#080d14] px-6 pt-5 pb-6 space-y-4">
            <p className="text-[15px] font-bold text-white">Upload end session image</p>
            <p className="text-sm text-white/55">
              Upload a screenshot taken just before you disconnected. You can skip this step.
            </p>
            {sessionId && (
              <SessionImageUpload
                sessionId={sessionId}
                imageType="end"
                label="End session screenshot"
              />
            )}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setEndStep('idle')}
                className="px-4 py-2.5 text-sm rounded-xl font-medium text-white/60 bg-white/6 hover:bg-white/10 hover:text-white border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setEndStep('confirm')}
                className="px-4 py-2.5 text-sm rounded-xl font-medium text-white/70 bg-white/8 hover:bg-white/12 border border-white/10 transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => setEndStep('confirm')}
                className="px-4 py-2.5 text-sm rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-900/60 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      {endStep === 'confirm' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEndStep('idle')}
        >
        <div
          className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-red-900/40"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-[3px] bg-gradient-to-r from-red-800 via-red-500 to-red-800" />
          <div className="bg-[#0f0808] px-6 pt-5 pb-6 space-y-5">
            <div className="flex items-start gap-4">
              <div className="shrink-0 mt-0.5 w-10 h-10 rounded-full bg-red-500/10 ring-1 ring-red-500/40 flex items-center justify-center">
                <Power size={18} className="text-red-500" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white leading-snug">End this session?</p>
                <p className="mt-1 text-sm text-white/55 leading-relaxed">
                  <span className="text-white/80 font-medium">{machine?.nickname}</span>
                  {' '}will be disconnected and released back to the pool.
                </p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setEndStep('idle')}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl font-medium text-white/60 bg-white/6 hover:bg-white/10 hover:text-white border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEndConnection}
                disabled={ending}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 shadow-md shadow-red-900/60 disabled:opacity-50 transition-colors"
              >
                {ending ? 'Ending…' : 'Yes, end session'}
              </button>
            </div>
          </div>
        </div>
        </div>
      )}

      <div>
        <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm">
          Claim board
        </Link>
      </div>
    </div>
  );
}
