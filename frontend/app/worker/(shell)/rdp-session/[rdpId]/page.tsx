'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, Power } from 'lucide-react';

import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';
import { endRdpConnection, openRdpDesktopTab } from '@/lib/rdp';

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
  status: string;
}

export default function RdpSessionPage({ params }: { params: { rdpId: string } }) {
  const router = useRouter();
  const rdpId = params.rdpId;
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [desktopOpened, setDesktopOpened] = useState(false);
  const desktopTabRef = useRef<Window | null>(null);

  useEffect(() => {
    api.get<RDPResource>(`/rdp/${rdpId}`)
      .then(setMachine)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load machine'))
      .finally(() => setLoading(false));
  }, [rdpId]);

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  // Open the remote desktop in a separate tab once.
  useEffect(() => {
    if (loading || !machine) return;
    const key = `rdp-desktop-auto-${rdpId}`;
    if (sessionStorage.getItem(key)) return;
    const tab = openRdpDesktopTab(rdpId);
    if (tab) {
      desktopTabRef.current = tab;
      sessionStorage.setItem(key, '1');
      setDesktopOpened(true);
    }
  }, [loading, machine, rdpId]);

  // Listen for disconnect broadcast from the desktop tab.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('rdp-events');
      ch.onmessage = (e) => {
        if (e.data?.type === 'session-ended' && e.data?.rdpId === rdpId) {
          sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
          router.push('/worker/rdp-claim-board');
        }
      };
    } catch { /* ignore */ }
    return () => { try { ch?.close(); } catch { /* ignore */ } };
  }, [rdpId, router]);

  const handleOpenDesktop = useCallback(() => {
    const tab = openRdpDesktopTab(rdpId);
    if (tab) {
      desktopTabRef.current = tab;
      setDesktopOpened(true);
    } else {
      setError('Pop-up blocked — allow pop-ups for this site, then click Open desktop again.');
    }
  }, [rdpId]);

  const handleEndConnection = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    try {
      await endRdpConnection(rdpId);
      try {
        const ch = new BroadcastChannel('rdp-events');
        ch.postMessage({ type: 'session-ended', rdpId });
        ch.close();
      } catch { /* ignore */ }
      sessionStorage.removeItem(`rdp-desktop-auto-${rdpId}`);
      try { desktopTabRef.current?.close(); } catch { /* ignore */ }
      router.push('/worker/rdp-claim-board');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end connection');
      setEnding(false);
    }
  }, [ending, rdpId, router]);

  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');

  if (loading) {
    return <p className="text-theme-muted text-sm mt-4">Loading session…</p>;
  }

  if (error && !machine) {
    return (
      <div className="max-w-3xl">
        <p className="text-danger text-sm">{error}</p>
        <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm mt-4 inline-block">
          Back to claim board
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={machine?.nickname ?? 'Remote session'}
        description={`${machine?.country ?? ''} · ${machine?.client_group ?? ''}`.trim()}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status="active" label="Live" />
            <span className="font-mono text-emerald-accent text-sm">{h}:{m}:{s}</span>
          </div>
        }
      />

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      <div className="glass-panel p-6 mb-6 space-y-4">
        <p className="text-sm text-white">
          Your remote desktop opens in a <strong>separate tab</strong> so you get the full screen.
          Keep this page open to end the session when you are finished.
        </p>
        <button
          type="button"
          onClick={handleOpenDesktop}
          className="btn-primary text-sm inline-flex items-center gap-2"
        >
          <ExternalLink size={16} />
          {desktopOpened ? 'Re-open desktop tab' : 'Open desktop tab'}
        </button>
        <p className="text-xs text-theme-muted">
          The desktop tab opens in full screen. Use the red button at the top to disconnect when done.
        </p>
      </div>

      {confirmEnd ? (
        /* ── Confirmation card ── */
        <div className="rounded-2xl overflow-hidden shadow-2xl shadow-black/60 border border-red-900/40">
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
                onClick={() => setConfirmEnd(false)}
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm">
            Claim board
          </Link>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="btn-primary text-sm border-danger/40 bg-danger/20 hover:bg-danger/30"
          >
            End Connection
          </button>
        </div>
      )}
    </div>
  );
}
