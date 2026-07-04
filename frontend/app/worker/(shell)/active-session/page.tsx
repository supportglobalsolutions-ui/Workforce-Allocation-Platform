'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/platform/PageHeader';
import StatusBadge from '@/components/platform/StatusBadge';
import { Wifi, Heart, Monitor } from 'lucide-react';
import { api } from '@/lib/api';
import { endRdpConnection } from '@/lib/rdp';

interface WorkSession {
  id: string;
  session_type: string;
  rdp_resource_id: string | null;
  start_time: string;
  end_time: string | null;
  type_specific_fields: Record<string, unknown>;
}

interface RDPResource {
  id: string;
  nickname: string;
  country: string;
  client_group: string;
}

const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

export default function ActiveSessionPage() {
  const router = useRouter();
  const [session, setSession] = useState<WorkSession | null>(null);
  const [machine, setMachine] = useState<RDPResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    api.get<WorkSession[]>('/sessions?limit=50')
      .then(async (sessions) => {
        const active = sessions.find((s) => !s.end_time) ?? null;
        setSession(active);
        if (active?.rdp_resource_id) {
          try {
            const rdp = await api.get<RDPResource>(`/rdp/${active.rdp_resource_id}`);
            setMachine(rdp);
          } catch {
            setMachine(null);
          }
        }
        if (active) {
          const elapsed = Math.floor((Date.now() - new Date(active.start_time).getTime()) / 1000);
          setSeconds(Math.max(0, elapsed));
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load session'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [session]);

  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');

  const heartbeat = session?.type_specific_fields?.last_heartbeat_at ? 'Active' : '—';

  const handleEndSession = async () => {
    if (!session?.rdp_resource_id || ending) return;
    setEnding(true);
    setError(null);
    try {
      await endRdpConnection(session.rdp_resource_id);
      router.push('/worker/rdp-claim-board');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end session');
      setEnding(false);
    }
  };

  if (loading) return <p className="text-theme-muted text-sm mt-4">Loading session...</p>;
  if (error) return <p className="text-danger text-sm mt-4">{error}</p>;

  if (!session) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          title="Active session"
          description="Current RDP work session."
        />
        <div className="glass-panel p-8 text-center">
          <p className="text-brand-on-surface-variant mb-4">You don&apos;t have an active session.</p>
          <Link href="/worker/rdp-claim-board" className="btn-primary text-sm">Claim an RDP machine</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Active session"
        description="Current RDP work session."
        actions={<StatusBadge status="active" label="Live" />}
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-panel p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-on-surface-variant mb-4">Session Timer</p>
          <p className="text-5xl md:text-6xl font-black font-mono text-emerald-accent text-glow-emerald">{h}:{m}:{s}</p>
          {session.rdp_resource_id ? (
            <div className="mt-8 space-y-2 max-w-xs mx-auto">
              <Link
                href={`/worker/rdp-session/${session.rdp_resource_id}`}
                className="btn-primary w-full text-sm block text-center"
              >
                Open remote desktop
              </Link>
              <button
                type="button"
                onClick={handleEndSession}
                disabled={ending}
                className="btn-secondary w-full border-danger/30 text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {ending ? 'Ending…' : 'End Session'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleEndSession}
              disabled={ending || !session.rdp_resource_id}
              className="btn-secondary mt-8 w-full max-w-xs mx-auto border-danger/30 text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {ending ? 'Ending…' : 'End Session'}
            </button>
          )}
        </div>
        <div className="space-y-4">
          <div className="glass-panel p-6">
            <div className="flex items-center gap-2 mb-4"><Monitor size={18} className="text-emerald-accent" /><h2 className="font-bold text-white">Machine Details</h2></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-brand-on-surface-variant text-xs">Machine</span><p className="text-white font-medium">{machine?.nickname ?? '—'}</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">ID</span><p className="text-white font-mono">{session.rdp_resource_id?.slice(0, 8) ?? '—'}…</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Country</span><p className="text-white">{machine?.country ?? '—'}</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Client</span><p className="text-white">{machine?.client_group ?? '—'}</p></div>
            </div>
          </div>
          <div className="glass-panel p-6">
            <h2 className="font-bold text-white mb-4">Session Details</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-brand-on-surface-variant text-xs">Session ID</span><p className="text-white font-mono">{session.id.slice(0, 8)}…</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Type</span><p className="text-white">{TYPE_LABELS[session.session_type] ?? session.session_type}</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Started</span><p className="text-white">{new Date(session.start_time).toLocaleString()}</p></div>
              <div><span className="text-brand-on-surface-variant text-xs">Guacamole</span><p className="text-emerald-accent">{machine ? 'Connected' : '—'}</p></div>
            </div>
          </div>
          <div className="glass-panel p-6 flex gap-6">
            <div className="flex items-center gap-2"><Wifi size={16} className="text-success" /><span className="text-sm text-white">Connection: <span className="text-success">—</span></span></div>
            <div className="flex items-center gap-2"><Heart size={16} className="text-emerald-accent animate-pulse" /><span className="text-sm text-white">Heartbeat: <span className="text-emerald-accent">{heartbeat}</span></span></div>
          </div>
        </div>
      </div>
      <p className="text-xs text-brand-on-surface-variant mt-6 text-center">
        RDP credentials are managed server-side via Apache Guacamole and never exposed to your browser.
      </p>
    </div>
  );
}
