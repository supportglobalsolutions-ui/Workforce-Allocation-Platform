'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, Briefcase, CheckCircle, ChevronDown, Eye, Search, ShieldCheck, User, UserPlus, X, XCircle,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  ManagedUser,
  apiApproveUser,
  apiBanUser,
  apiCreateUser,
  apiListUsers,
  apiRejectUser,
  apiUnbanUser,
  apiUpdateUserRole,
} from '@/lib/auth/firebase-auth';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AuthRole, ROLE_DISPLAY, assignableRoles } from '@/lib/auth/config';

type AccountsTab = 'ops_lead' | 'executive' | 'partner' | 'pending';

interface PartnerOption { id: string; name: string; }
interface CountryOption { id: string; name: string; currency_code: string; is_active: boolean; }

interface ApproveBody {
  worker_type?: string;
  partner_entity_id?: string | null;
  country?: string | null;
}

const ROLE_BADGE: Record<AuthRole, string> = {
  super_admin: 'bg-gold-accent/20 text-gold-accent border border-gold-accent/30',
  admin: 'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30',
  partner: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  user: 'bg-white/10 text-theme-muted border border-white/10',
};

const ROLE_HINT: Record<AuthRole, string> = {
  user: 'Worker portal access — sessions, shifts, wallet.',
  partner: 'External partner person — same worker portal; listed under Partners on Accounts.',
  admin: 'Admin portal — ops, payroll, machines, accounts.',
  super_admin: 'Full executive access across leadership and admin.',
};

function RoleBadge({ role }: { role: AuthRole }) {
  const Icon = role === 'partner' ? Briefcase : (role === 'super_admin' || role === 'admin') ? ShieldCheck : User;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
      <Icon size={10} />
      {ROLE_DISPLAY[role]}
    </span>
  );
}

type PromoteModalTab = 'promote' | 'promoted';

/** Promote workers or demote elevated accounts. */
function PromoteAccountModal({
  accounts,
  actorRole,
  actorUid,
  actingOn,
  onClose,
  onPromote,
}: {
  accounts: ManagedUser[];
  actorRole: AuthRole;
  actorUid: string | null;
  actingOn: string | null;
  onClose: () => void;
  onPromote: (uid: string, role: AuthRole) => void;
}) {
  const roles = assignableRoles(actorRole);
  const elevateRoles = roles.filter((r) => r === 'admin' || r === 'super_admin');
  const canDemote = roles.includes('user');
  const [tab, setTab] = useState<PromoteModalTab>('promote');
  const [query, setQuery] = useState('');
  const [targetRole, setTargetRole] = useState<AuthRole>(
    elevateRoles[0] ?? roles[0] ?? 'admin',
  );

  const toPromote = useMemo(() => {
    return accounts.filter((u) => {
      if (u.status !== 'approved' || u.role !== 'user') return false;
      if (actorUid && u.uid === actorUid) return false;
      return true;
    });
  }, [accounts, actorUid]);

  const promoted = useMemo(() => {
    return accounts.filter((u) => {
      if (u.status !== 'approved') return false;
      if (u.role !== 'admin' && u.role !== 'super_admin') return false;
      if (actorUid && u.uid === actorUid) return false;
      if (actorRole === 'admin' && u.role === 'super_admin') return false;
      return true;
    });
  }, [accounts, actorRole, actorUid]);

  const list = tab === 'promote' ? toPromote : promoted;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter(
      (u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [list, query]);

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400" />
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[15px] font-bold text-gray-900">Promote</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Raise access for workers, or demote Operations Leads / Executives anytime.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 pt-3 pb-3 space-y-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setTab('promote')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'promote' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Promote
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">
                {toPromote.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setTab('promoted')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'promoted' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Promoted
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">
                {promoted.length}
              </span>
            </button>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-emerald-400"
              autoFocus
            />
          </div>

          {tab === 'promote' && elevateRoles.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Promote to</p>
              <div className="relative">
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as AuthRole)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 appearance-none pr-8 focus:outline-none focus:border-emerald-400"
                >
                  {elevateRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_DISPLAY[r]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">{ROLE_HINT[targetRole]}</p>
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12 px-6">
              {list.length === 0
                ? tab === 'promote'
                  ? 'No worker accounts available to promote.'
                  : 'No promoted accounts to manage.'
                : 'No accounts match your search.'}
            </p>
          ) : tab === 'promote' ? (
            <ul className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const busy = actingOn === u.uid;
                return (
                  <li key={u.uid} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50/80">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.displayName || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      <div className="mt-1"><RoleBadge role={u.role} /></div>
                    </div>
                    <button
                      type="button"
                      disabled={busy || elevateRoles.length === 0}
                      onClick={() => onPromote(u.uid, targetRole)}
                      className="shrink-0 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {busy ? <SpinningDots size="sm" /> : <ShieldCheck size={12} />}
                      Promote
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const busy = actingOn === u.uid;
                return (
                  <li key={u.uid} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50/80">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{u.displayName || '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      <div className="mt-1"><RoleBadge role={u.role} /></div>
                    </div>
                    <div className="shrink-0 flex flex-col sm:flex-row gap-1.5">
                      {u.role === 'super_admin' && elevateRoles.includes('admin') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPromote(u.uid, 'admin')}
                          className="px-2.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                        >
                          {busy ? <SpinningDots size="sm" /> : 'To Ops Lead'}
                        </button>
                      )}
                      {u.role === 'admin' && elevateRoles.includes('super_admin') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPromote(u.uid, 'super_admin')}
                          className="px-2.5 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40"
                        >
                          {busy ? <SpinningDots size="sm" /> : 'To Executive'}
                        </button>
                      )}
                      {canDemote && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPromote(u.uid, 'user')}
                          className="px-2.5 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center gap-1"
                        >
                          {busy ? <SpinningDots size="sm" /> : 'Demote'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
          {filtered.length} of {list.length} on {tab === 'promote' ? 'Promote' : 'Promoted'}
        </div>
      </div>
    </div>
  );
}

type PartnerModalMode = 'create' | 'promote';

/** Create a partner person or promote an existing account to partner. */
function PartnerAccountModal({
  accounts,
  actorUid,
  actingOn,
  creating,
  onClose,
  onCreate,
  onPromote,
}: {
  accounts: ManagedUser[];
  actorUid: string | null;
  actingOn: string | null;
  creating: boolean;
  onClose: () => void;
  onCreate: (data: {
    email: string;
    password: string;
    displayName: string;
    partnerEntityId: string | null;
  }) => void;
  onPromote: (uid: string, partnerEntityId: string | null) => void;
}) {
  const [mode, setMode] = useState<PartnerModalMode>('create');
  const [query, setQuery] = useState('');
  const [partnerEntityId, setPartnerEntityId] = useState('');
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.get<PartnerOption[]>('/partners')
      .then(setPartners)
      .catch(() => setPartners([]));
  }, []);

  const candidates = useMemo(() => {
    return accounts.filter((u) => {
      if (u.status !== 'approved') return false;
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

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }
    onCreate({
      email: form.email,
      password: form.password,
      displayName: form.displayName,
      partnerEntityId: partnerEntityId || null,
    });
  }

  return (
    <div
      className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-emerald-400" />
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[15px] font-bold text-gray-900">Partner account</p>
            <p className="text-xs text-gray-400 mt-0.5">
              A partner is a person (external work). Same worker portal; optional company link.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-6 pt-3 pb-3 space-y-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'create' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Create new
            </button>
            <button
              type="button"
              onClick={() => setMode('promote')}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'promote' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Promote existing
            </button>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
              Company <span className="normal-case tracking-normal font-medium">(optional)</span>
            </p>
            <div className="relative">
              <select
                value={partnerEntityId}
                onChange={(e) => setPartnerEntityId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 appearance-none pr-8 focus:outline-none focus:border-sky-400"
              >
                <option value="">No company</option>
                {(partners ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateSubmit} className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Display name</label>
              <input
                required
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-sky-400"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-sky-400"
                placeholder="partner@example.com"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-sky-400"
                placeholder="Min 8 characters"
              />
            </div>
            {formError && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle size={14} /> {formError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? <SpinningDots size="sm" /> : <UserPlus size={14} />}
                Create Partner
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="px-6 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or email…"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-sky-400"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12 px-6">
                  {candidates.length === 0 ? 'No accounts available to promote.' : 'No accounts match your search.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {filtered.map((u) => {
                    const busy = actingOn === u.uid;
                    return (
                      <li key={u.uid} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50/80">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{u.displayName || '—'}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                          <div className="mt-1"><RoleBadge role={u.role} /></div>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onPromote(u.uid, partnerEntityId || null)}
                          className="shrink-0 px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center gap-1.5"
                        >
                          {busy ? <SpinningDots size="sm" /> : <Briefcase size={12} />}
                          Make partner
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="px-6 py-3 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
              {filtered.length} of {candidates.length} account{candidates.length !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface AccountModalProps {
  user: ManagedUser;
  actorRole: AuthRole;
  onClose: () => void;
  onApprove: (uid: string, body?: ApproveBody) => void;
  onReject: (uid: string) => void;
  onBan: (uid: string) => void;
  onUnban: (uid: string) => void;
  onRoleChange: (uid: string, role: AuthRole, partnerEntityId?: string | null) => void;
  actingOn: string | null;
}

function AccountDetailModal({
  user, actorRole, onClose, onApprove, onReject, onBan, onUnban, onRoleChange, actingOn,
}: AccountModalProps) {
  const isActing = actingOn === user.uid;
  // Only admins/executives can ban; only executives can ban other executives.
  const canBan =
    actorRole === 'super_admin' ||
    (actorRole === 'admin' && user.role !== 'super_admin');
  const isPendingWorker = user.status === 'pending' && user.role === 'user';
  const roleOptions = assignableRoles(actorRole).filter((r) => r !== 'partner');
  // Admins may promote workers ↔ ops lead; they cannot touch Executive accounts.
  // Partner role is assigned via Partner account modal.
  const canChangeRole =
    user.status === 'approved' &&
    roleOptions.length > 0 &&
    (actorRole === 'super_admin' || user.role !== 'super_admin');

  const [workerType, setWorkerType] = useState<'gs_registered' | 'partner_worker'>('gs_registered');
  const [partnerId, setPartnerId] = useState('');
  const [country, setCountry] = useState('');
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [nextRole, setNextRole] = useState<AuthRole>(
    roleOptions.includes(user.role) ? user.role : (roleOptions[0] ?? user.role),
  );

  // Reset approval form + role picker whenever a different account is opened.
  useEffect(() => {
    setWorkerType('gs_registered');
    setPartnerId('');
    setCountry('');
    setPartners(null);
    setCountries(null);
    const opts = assignableRoles(actorRole).filter((r) => r !== 'partner');
    setNextRole(opts.includes(user.role) ? user.role : (opts[0] ?? user.role));
  }, [user.uid, user.role, actorRole]);

  useEffect(() => {
    if (!isPendingWorker || countries !== null) return;
    api.get<CountryOption[]>('/currencies/countries').then(setCountries).catch(() => setCountries([]));
  }, [isPendingWorker, countries]);

  useEffect(() => {
    if (workerType !== 'partner_worker' || partners !== null) return;
    api.get<PartnerOption[]>('/partners').then(setPartners).catch(() => setPartners([]));
  }, [workerType, partners]);

  const approveDisabled = workerType === 'partner_worker' && !partnerId;

  function handleApproveClick() {
    if (!isPendingWorker) { onApprove(user.uid); return; }
    onApprove(user.uid, {
      worker_type: workerType,
      partner_entity_id: workerType === 'partner_worker' ? partnerId : null,
      country: country || null,
    });
  }

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-400" />
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0 flex-1 pr-4">
            <p className="text-[15px] font-bold text-gray-900 truncate">{user.displayName || '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
            <div className="mt-2.5"><RoleBadge role={user.role} /></div>
          </div>
          <button type="button" onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Account Info</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Status</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  user.status === 'banned'   ? 'bg-red-100 text-red-700 border border-red-300' :
                  user.disabled              ? 'bg-gray-100 text-gray-500 border border-gray-200' :
                  user.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                  user.status === 'pending'  ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                               'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {user.status === 'banned' ? <><Ban size={9} /> Banned</> :
                   user.disabled            ? 'Disabled' :
                   user.status === 'approved' ? <><CheckCircle size={9} /> Active</> :
                   user.status === 'pending'  ? <><AlertCircle size={9} /> Pending</> :
                                               <><XCircle size={9} /> Rejected</>}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</p>
                <RoleBadge role={user.role} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Created</p>
                <p className="text-sm text-gray-800 font-medium">
                  {new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Login</p>
                <p className="text-sm text-gray-800 font-medium">{user.disabled ? 'Disabled' : 'Enabled'}</p>
              </div>
              {user.role === 'partner' && (
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Company link</p>
                  <p className="text-sm text-gray-800 font-medium">
                    {user.partnerEntityId ? 'Linked to a partner company' : 'No company (person only)'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {canChangeRole && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Change role</p>
              <p className="text-[11px] text-gray-500 mb-3">
                Promote to Operations Lead / Executive, or reduce to Worker.
              </p>
              {isActing ? (
                <div className="flex justify-center py-3"><SpinningDots size="sm" className="text-emerald-500" /></div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={nextRole}
                        onChange={(e) => setNextRole(e.target.value as AuthRole)}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 appearance-none pr-8 focus:outline-none focus:border-emerald-400"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>{ROLE_DISPLAY[r]}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                      type="button"
                      disabled={nextRole === user.role}
                      onClick={() => onRoleChange(user.uid, nextRole)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">{ROLE_HINT[nextRole]}</p>
                  {actorRole === 'admin' && (
                    <p className="text-[10px] text-gray-400">
                      Only Executives can grant or change Executive access.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {user.status === 'pending' && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Approval</p>
              {isActing ? (
                <div className="flex justify-center py-3"><SpinningDots size="sm" className="text-emerald-500" /></div>
              ) : (
                <div className="space-y-3">
                  {isPendingWorker && (
                    <>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Worker Designation</p>
                        <div className="flex gap-4">
                          {([
                            ['gs_registered', 'GS Member'],
                            ['partner_worker', 'Partner worker'],
                          ] as const).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                              <input type="radio" name="worker_type" value={value}
                                checked={workerType === value}
                                onChange={() => { setWorkerType(value); if (value === 'gs_registered') setPartnerId(''); }}
                                className="accent-emerald-500" />
                              <span className="text-sm text-gray-800">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      {workerType === 'partner_worker' && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Partner Company *</p>
                          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-emerald-400">
                            <option value="">Select partner…</option>
                            {(partners ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Country</p>
                        <select value={country} onChange={(e) => setCountry(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:border-emerald-400">
                          <option value="">Unassigned</option>
                          {(countries ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="flex gap-3">
                    <button type="button" onClick={handleApproveClick} disabled={isPendingWorker && approveDisabled}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      <CheckCircle size={13} /> Approve
                    </button>
                    <button type="button" onClick={() => onReject(user.uid)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider transition-colors">
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canBan && (user.status === 'approved' || user.status === 'banned') && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Account Access</p>
              {isActing ? (
                <div className="flex justify-center py-3"><SpinningDots size="sm" className="text-red-500" /></div>
              ) : user.status === 'banned' ? (
                <button type="button" onClick={() => onUnban(user.uid)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider transition-colors">
                  Unban Account
                </button>
              ) : (
                <button type="button" onClick={() => onBan(user.uid)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider transition-colors">
                  <Ban size={13} /> Lock / Ban Account
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const { session } = useAuth();
  const actorRole = (session?.authRole ?? 'user') as AuthRole;
  const actorUid = session?.uid ?? null;
  const allAssignable = assignableRoles(actorRole);
  const createRoleOptions = allAssignable.filter((r) => r !== 'partner');
  const canCreate = createRoleOptions.length > 0;
  const canPromote = allAssignable.some((r) => r === 'admin' || r === 'super_admin');
  const canPartner = allAssignable.includes('partner');

  const [activeTab, setActiveTab] = useState<AccountsTab>('ops_lead');
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [showPartner, setShowPartner] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: (createRoleOptions.includes('admin') ? 'admin' : createRoleOptions[0] ?? 'admin') as AuthRole,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  async function loadUsers() {
    setLoading(true); setError('');
    try {
      setAllUsers(await apiListUsers());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  const opsLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => u.role === 'admin' && u.status !== 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, search]);

  const executives = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => u.role === 'super_admin' && u.status !== 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, search]);

  const partners = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => u.role === 'partner' && u.status !== 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, search]);

  const pendingUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => u.status === 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, search]);

  const tabUsers =
    activeTab === 'ops_lead' ? opsLeads
      : activeTab === 'executive' ? executives
        : activeTab === 'partner' ? partners
          : pendingUsers;

  const TABS: { key: AccountsTab; label: string; count: number }[] = [
    { key: 'ops_lead', label: 'Operations Lead', count: opsLeads.length },
    { key: 'executive', label: 'Executive', count: executives.length },
    { key: 'partner', label: 'Partners', count: partners.length },
    { key: 'pending', label: 'Pending Approval', count: pendingUsers.length },
  ];

  function defaultRoleForTab(tab: AccountsTab): AuthRole {
    if (tab === 'executive' && createRoleOptions.includes('super_admin')) return 'super_admin';
    if (createRoleOptions.includes('admin')) return 'admin';
    return createRoleOptions[0] ?? 'admin';
  }

  function openCreate() {
    setShowCreate((v) => !v);
    setShowPromote(false);
    setShowPartner(false);
    setCreateError('');
    setCreateSuccess('');
    setForm((f) => ({ ...f, role: defaultRoleForTab(activeTab === 'partner' ? 'ops_lead' : activeTab) }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createRoleOptions.includes(form.role)) {
      setCreateError('You are not allowed to create that role.');
      return;
    }
    setCreating(true); setCreateError(''); setCreateSuccess('');
    const role = form.role;
    try {
      const created = await apiCreateUser(form.email, form.password, form.displayName, role);
      setCreateSuccess(`${ROLE_DISPLAY[role]} account created for ${created.email}`);
      setForm({
        email: '',
        password: '',
        displayName: '',
        role: defaultRoleForTab(activeTab === 'partner' ? 'ops_lead' : activeTab),
      });
      setShowCreate(false);
      if (role === 'admin') setActiveTab('ops_lead');
      else if (role === 'super_admin') setActiveTab('executive');
      await loadUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally { setCreating(false); }
  }

  async function handleCreatePartner(data: {
    email: string;
    password: string;
    displayName: string;
    partnerEntityId: string | null;
  }) {
    setCreating(true); setActionError(''); setCreateSuccess('');
    try {
      const created = await apiCreateUser(
        data.email,
        data.password,
        data.displayName,
        'partner',
        data.partnerEntityId,
      );
      setCreateSuccess(`Partner account created for ${created.email}`);
      setShowPartner(false);
      setActiveTab('partner');
      await loadUsers();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to create partner.');
    } finally { setCreating(false); }
  }

  async function handleApprove(uid: string, body?: ApproveBody) {
    setActingOn(uid); setActionError('');
    try {
      await apiApproveUser(uid, body);
      await loadUsers();
      setSelectedUser(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to approve.');
    } finally { setActingOn(null); }
  }

  async function handleReject(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiRejectUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (err: unknown) { setActionError(err instanceof Error ? err.message : 'Failed to reject.'); }
    finally { setActingOn(null); }
  }

  async function handleBan(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiBanUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (err: unknown) { setActionError(err instanceof Error ? err.message : 'Failed to ban account.'); }
    finally { setActingOn(null); }
  }

  async function handleUnban(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiUnbanUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (err: unknown) { setActionError(err instanceof Error ? err.message : 'Failed to unban account.'); }
    finally { setActingOn(null); }
  }

  async function handleRoleChange(uid: string, role: AuthRole, partnerEntityId?: string | null) {
    setActingOn(uid); setActionError('');
    try {
      await apiUpdateUserRole(uid, role, partnerEntityId);
      const promoted = allUsers.find((u) => u.uid === uid);
      await loadUsers();
      setSelectedUser(null);
      if (role === 'user') {
        setCreateSuccess(promoted
          ? `${promoted.displayName || promoted.email} reduced to Worker.`
          : 'Role updated to Worker.');
      } else if (role === 'partner') {
        setActiveTab('partner');
        setShowPartner(false);
        setCreateSuccess(promoted
          ? `${promoted.displayName || promoted.email} set as Partner.`
          : 'Promoted to Partner.');
      } else if (role === 'admin') {
        setActiveTab('ops_lead');
        setCreateSuccess(promoted
          ? `${promoted.displayName || promoted.email} promoted to Operations Lead.`
          : 'Promoted to Operations Lead.');
      } else {
        setActiveTab('executive');
        setCreateSuccess(promoted
          ? `${promoted.displayName || promoted.email} promoted to Executive.`
          : 'Promoted to Executive.');
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally { setActingOn(null); }
  }

  const emptyLabel =
    activeTab === 'pending' ? 'No pending approval requests.'
      : activeTab === 'ops_lead' ? 'No Operations Lead accounts found.'
        : activeTab === 'partner' ? 'No Partner accounts found.'
          : 'No Executive accounts found.';

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Create accounts with a role claim, manage Partners, approve signups, and promote or demote."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1 overflow-x-auto">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveTab(key); setShowCreate(false); setCreateError(''); setSearch(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'bg-emerald-accent/20 text-emerald-400'
                  : 'text-theme-muted hover:text-white'
              }`}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === key
                  ? key === 'pending' && count > 0
                    ? 'bg-gold-accent/20 text-gold-accent'
                    : 'bg-emerald-accent/20 text-emerald-400'
                  : key === 'pending' && count > 0
                    ? 'bg-gold-accent/15 text-gold-accent'
                    : 'bg-white/10 text-theme-muted'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canPartner && (
            <button
              type="button"
              onClick={() => {
                setShowPartner(true);
                setShowCreate(false);
                setShowPromote(false);
                setActionError('');
              }}
              className="btn-secondary flex items-center gap-2 text-sm py-2 px-4"
            >
              <Briefcase size={15} />
              Partner account
            </button>
          )}
          {canPromote && (
            <button
              type="button"
              onClick={() => { setShowPromote(true); setShowCreate(false); setShowPartner(false); setActionError(''); }}
              className="btn-secondary flex items-center gap-2 text-sm py-2 px-4"
            >
              <ShieldCheck size={15} />
              Promote
            </button>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openCreate}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            >
              <UserPlus size={15} />
              New account
            </button>
          )}
        </div>
      </div>

      {showCreate && canCreate && (
        <div className="glass-panel p-6 mb-5">
          <h2 className="text-sm font-bold text-white mb-1">New account</h2>
          <p className="text-xs text-theme-muted mb-4">
            Choose a role — it is written as a Firebase custom claim on create so portal access matches immediately.
            To change an existing account, use Promote.
          </p>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Display Name</label>
              <input required value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} placeholder="Full Name" className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="user@globalsolutions.com" className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Password</label>
              <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" className="input-field" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">
                Role <span className="text-emerald-accent normal-case tracking-normal">(required — sets custom claims)</span>
              </label>
              <div className="relative">
                <select
                  required
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AuthRole }))}
                  className="input-field appearance-none pr-8"
                >
                  {createRoleOptions.map((r) => (
                    <option key={r} value={r}>{ROLE_DISPLAY[r]}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
              </div>
              <p className="text-[10px] text-theme-muted mt-1.5">{ROLE_HINT[form.role]}</p>
            </div>
            {createError && (
              <div className="sm:col-span-2 flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                <AlertCircle size={14} /> {createError}
              </div>
            )}
            <div className="sm:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm py-2 px-4">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                {creating ? <SpinningDots size="sm" className="text-emerald-accent" /> : <UserPlus size={14} />}
                Create {ROLE_DISPLAY[form.role]}
              </button>
            </div>
          </form>
        </div>
      )}

      {createSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-4">
          <CheckCircle size={14} /> {createSuccess}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs mb-4">
          <AlertCircle size={14} /> {actionError}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-3 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-56"
          />
        </div>
        <span className="text-xs text-theme-muted ml-1">
          {tabUsers.length} account{tabUsers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  {activeTab === 'pending' ? 'Applicant' : 'Account'}
                </th>
                {activeTab !== 'pending' && (
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Role</th>
                )}
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">
                  {activeTab === 'pending' ? 'Applied' : 'Status'}
                </th>
                {activeTab !== 'pending' && (
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Created</th>
                )}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tabUsers.map((u) => (
                <tr key={u.uid} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{u.displayName || '—'}</p>
                    <p className="text-xs text-theme-muted">{u.email}</p>
                  </td>
                  {activeTab !== 'pending' && (
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  )}
                  <td className="px-4 py-3">
                    {activeTab === 'pending' ? (
                      <span className="text-xs text-theme-muted">
                        {new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    ) : (
                      <span className={`text-xs font-medium ${
                        u.status === 'banned' ? 'text-red-400' :
                        u.disabled ? 'text-theme-muted' :
                        u.status === 'approved' ? 'text-emerald-accent' : 'text-danger'
                      }`}>
                        {u.status === 'banned' ? 'Banned' : u.disabled ? 'Disabled' : u.status === 'approved' ? 'Active' : u.status}
                      </span>
                    )}
                  </td>
                  {activeTab !== 'pending' && (
                    <td className="px-4 py-3 text-xs text-theme-muted">
                      {new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setSelectedUser(u)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {tabUsers.length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'pending' ? 3 : 5} className="px-4 py-12 text-center text-theme-muted text-sm">
                    {search ? 'No accounts match your search.' : emptyLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <AccountDetailModal
          key={selectedUser.uid}
          user={selectedUser}
          actorRole={actorRole}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onBan={handleBan}
          onUnban={handleUnban}
          onRoleChange={handleRoleChange}
          actingOn={actingOn}
        />
      )}

      {showPromote && (
        <PromoteAccountModal
          accounts={allUsers}
          actorRole={actorRole}
          actorUid={actorUid}
          actingOn={actingOn}
          onClose={() => setShowPromote(false)}
          onPromote={handleRoleChange}
        />
      )}

      {showPartner && (
        <PartnerAccountModal
          accounts={allUsers}
          actorUid={actorUid}
          actingOn={actingOn}
          creating={creating}
          onClose={() => setShowPartner(false)}
          onCreate={handleCreatePartner}
          onPromote={(uid, partnerEntityId) => handleRoleChange(uid, 'partner', partnerEntityId)}
        />
      )}
    </div>
  );
}
