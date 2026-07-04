'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import RdpViewer from '@/components/rdp/RdpViewer';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';
import { endRdpConnection } from '@/lib/rdp';

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
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [startedAt] = useState(() => Date.now());

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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const handleEndConnection = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    try {
      await endRdpConnection(rdpId);
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
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-7xl">
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

      {error && <p className="text-danger text-sm mb-3">{error}</p>}

      <div className="flex-1 min-h-0 rounded-lg border border-white/10 overflow-hidden mb-4">
        <RdpViewer rdpId={rdpId} className="h-full min-h-[480px]" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <p className="text-xs text-theme-muted max-w-xl">
          Use the remote desktop below. When finished, click End Connection — this releases the
          machine and disconnects your session. Do not use browser back without ending the session.
        </p>
        <div className="flex gap-2">
          <Link href="/worker/rdp-claim-board" className="btn-secondary text-sm">
            Claim board
          </Link>
          <button
            type="button"
            onClick={handleEndConnection}
            disabled={ending}
            className="btn-primary text-sm border-danger/40 bg-danger/20 hover:bg-danger/30 disabled:opacity-50"
          >
            {ending ? 'Ending…' : 'End Connection'}
          </button>
        </div>
      </div>
    </div>
  );
}
