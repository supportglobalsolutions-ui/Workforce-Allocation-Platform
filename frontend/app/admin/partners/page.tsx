'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Briefcase, CheckCircle, Eye, Search } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import AddPartnerModal from '@/components/admin/AddPartnerModal';
import WorkerProfileModal, { AdminWorker } from '@/components/admin/WorkerProfileModal';
import StatusBadge from '@/components/platform/StatusBadge';
import { api } from '@/lib/api';
import {
  ManagedUser,
  apiListUsers,
  apiUpdateUserRole,
} from '@/lib/auth/firebase-auth';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AuthRole, assignableRoles } from '@/lib/auth/config';

export default function PartnerManagementPage() {
  const { session } = useAuth();
  const actorRole = (session?.authRole ?? 'user') as AuthRole;
  const actorUid = session?.uid ?? null;
  const canPartner = assignableRoles(actorRole).includes('partner');

  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [accounts, setAccounts] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<AdminWorker | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const [allWorkers, users] = await Promise.all([
        api.get<AdminWorker[]>('/workers'),
        apiListUsers().catch(() => [] as ManagedUser[]),
      ]);
      setWorkers(allWorkers.filter((w) => w.worker_type === 'partner_worker'));
      setAccounts(users);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load partners.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers.filter((w) =>
      !q
      || w.display_name.toLowerCase().includes(q)
      || (w.email ?? '').toLowerCase().includes(q)
      || (w.partner_entity_name ?? '').toLowerCase().includes(q)
      || (w.username ?? '').toLowerCase().includes(q),
    );
  }, [workers, search]);

  async function handlePromote(uid: string, partnerEntityId: string) {
    setActingOn(uid);
    try {
      const updated = await apiUpdateUserRole(uid, 'partner', partnerEntityId);
      setSuccess(`${updated.displayName || updated.email} is now a Partner.`);
      setShowAdd(false);
      await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Partners"
        description="Partners are workers with a Partner designation. View and edit personal details, payment, RDP, and company (or Self)."
        actions={
          canPartner ? (
            <button type="button" onClick={() => { setShowAdd(true); setSuccess(''); }}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
              <Briefcase size={15} /> Add Partner
            </button>
          ) : undefined
        }
      />

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-4">
          <CheckCircle size={14} /> {success}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search partners…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-full sm:w-56"
          />
        </div>
        <span className="text-xs text-theme-muted ml-1">
          {filtered.length} partner{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : (
        <div className="glass-panel overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Partner</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Company</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Pay</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">RDP</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{w.display_name}</p>
                    <p className="text-xs text-theme-muted">{w.email || w.username || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted">
                    {w.partner_entity_is_self ? 'Self' : (w.partner_entity_name || '—')}
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted">
                    {w.pay_amount != null
                      ? `${w.pay_amount}${w.pay_frequency === 'per_month' ? '/mo' : w.pay_frequency === 'per_task' ? '/task' : ''}`
                      : (w.pay_tier || '—')}
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted">{w.assigned_rdp_nickname || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={w.status === 'active' ? 'approved' : 'offline'} label={w.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setSelected(w)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-theme-muted text-sm">
                    {search ? 'No partners match your search.' : 'No partners yet. Use Add Partner to create or promote someone.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && canPartner && (
        <AddPartnerModal
          accounts={accounts}
          actorUid={actorUid}
          actingOn={actingOn}
          onClose={() => setShowAdd(false)}
          onPromote={handlePromote}
          onCreated={async () => {
            setShowAdd(false);
            setSuccess('Partner account created.');
            await load();
          }}
        />
      )}

      {selected && (
        <WorkerProfileModal
          worker={selected}
          showCompany
          onClose={() => setSelected(null)}
          onUpdated={(w) => {
            setWorkers((prev) => prev.map((x) => (x.id === w.id ? w : x)));
            setSelected(w);
          }}
        />
      )}
    </div>
  );
}
