'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Briefcase, Search, UserPlus, X } from 'lucide-react';
import SpinningDots from '@/components/shared/SpinningDots';
import {
  ManagedUser,
  apiApproveUser,
  apiCreateUser,
} from '@/lib/auth/firebase-auth';
import { ROLE_DISPLAY, AuthRole } from '@/lib/auth/config';
import { ensurePartnerEntity } from '@/lib/partners';

type PartnerModalTab = 'create' | 'promote';

const ROLE_BADGE: Record<AuthRole, string> = {
  super_admin: 'bg-gold-accent/20 text-gold-accent border border-gold-accent/30',
  admin: 'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30',
  partner: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  user: 'bg-white/10 text-theme-muted border border-white/10',
};

function MiniRoleBadge({ role }: { role: AuthRole }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
      {ROLE_DISPLAY[role]}
    </span>
  );
}

export default function AddPartnerModal({
  accounts,
  actorUid,
  actingOn,
  onClose,
  onPromote,
  onCreated,
}: {
  accounts: ManagedUser[];
  actorUid: string | null;
  actingOn: string | null;
  onClose: () => void;
  onPromote: (uid: string, partnerEntityId: string) => void | Promise<void>;
  onCreated: () => void | Promise<void>;
}) {
  const [tab, setTab] = useState<PartnerModalTab>('create');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [creating, setCreating] = useState(false);
  const [promotingUid, setPromotingUid] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');
  const [promoteError, setPromoteError] = useState('');

  const candidates = useMemo(() => {
    return accounts.filter((u) => {
      if (u.status !== 'approved' && u.status !== 'pending') return false;
      if (u.role === 'partner' || u.role === 'super_admin') return false;
      if (actorUid && u.uid === actorUid) return false;
      return true;
    });
  }, [accounts, actorUid]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter(
      (u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [candidates, query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const entityId = await ensurePartnerEntity(form.displayName);
      await apiCreateUser(form.email, form.password, form.displayName, 'partner', entityId);
      await onCreated();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create partner account.');
    } finally {
      setCreating(false);
    }
  }

  async function handlePromote(u: ManagedUser) {
    setPromotingUid(u.uid);
    setPromoteError('');
    try {
      if (u.status === 'pending') {
        await apiApproveUser(u.uid);
      }
      const entityId = await ensurePartnerEntity(u.displayName || u.email);
      await onPromote(u.uid, entityId);
    } catch (err: unknown) {
      setPromoteError(err instanceof Error ? err.message : 'Failed to promote to partner.');
    } finally {
      setPromotingUid(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between p-5 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Add Partner</h2>
            <p className="text-xs text-theme-muted mt-0.5">
              Create a Partner login or promote an existing worker. A company record is attached automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-3 pb-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setTab('create')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'create'
                  ? 'bg-emerald-accent/20 text-emerald-accent'
                  : 'text-theme-muted hover:text-white'
              }`}
            >
              <UserPlus size={12} />
              New account
            </button>
            <button
              type="button"
              onClick={() => setTab('promote')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'promote'
                  ? 'bg-emerald-accent/20 text-emerald-accent'
                  : 'text-theme-muted hover:text-white'
              }`}
            >
              <Briefcase size={12} />
              Promote / approve
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                tab === 'promote'
                  ? 'bg-emerald-accent/20 text-emerald-accent'
                  : 'bg-white/10 text-theme-muted'
              }`}>
                {candidates.length}
              </span>
            </button>
          </div>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="p-5 space-y-4 overflow-y-auto flex-1">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Display Name *</label>
              <input
                required
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Full name"
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="partner@example.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Min 8 characters"
                className="input-field"
              />
            </div>
            {createError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                <AlertCircle size={14} /> {createError}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-1">
              <button type="button" onClick={onClose} className="btn-secondary text-sm py-2 px-4">
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
              >
                {creating ? <SpinningDots size="sm" className="text-emerald-accent" /> : <UserPlus size={14} />}
                Create Partner
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="px-5 pt-3 pb-3 border-b border-white/[0.06] shrink-0 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or email…"
                  className="input-field pl-9"
                  autoFocus
                />
              </div>
              {promoteError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {promoteError}
                </div>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-theme-muted text-center py-12 px-6">
                  {candidates.length === 0 ? 'No accounts available to promote.' : 'No accounts match your search.'}
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {filtered.map((u) => {
                    const busy = actingOn === u.uid || promotingUid === u.uid;
                    return (
                      <li key={u.uid} className="px-5 py-3.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{u.displayName || '—'}</p>
                          <p className="text-xs text-theme-muted truncate">{u.email}</p>
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <MiniRoleBadge role={u.role} />
                            {u.status === 'pending' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handlePromote(u)}
                          className="shrink-0 btn-primary text-[11px] py-2 px-3 flex items-center gap-1.5 disabled:opacity-40"
                        >
                          {busy ? <SpinningDots size="sm" className="text-emerald-accent" /> : <Briefcase size={12} />}
                          {u.status === 'pending' ? 'Approve as partner' : 'Make partner'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] text-[11px] text-theme-muted shrink-0">
              {filtered.length} of {candidates.length} account{candidates.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
