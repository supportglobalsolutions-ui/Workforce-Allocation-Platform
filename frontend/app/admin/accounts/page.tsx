'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle, ChevronDown, Eye, ShieldCheck, User, UserPlus, X, XCircle,
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

type AccountsTab = 'ops_lead' | 'executive' | 'pending';

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
  user: 'bg-white/10 text-theme-muted border border-white/10',
};

function RoleBadge({ role }: { role: AuthRole }) {
  const isPrivileged = role === 'super_admin' || role === 'admin';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
      {isPrivileged ? <ShieldCheck size={10} /> : <User size={10} />}
      {ROLE_DISPLAY[role]}
    </span>
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
  onRoleChange: (uid: string, role: AuthRole) => void;
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
  const canChangeRole = user.status === 'approved' && assignableRoles(actorRole).length > 0;

  const [workerType, setWorkerType] = useState<'gs_registered' | 'partner_worker'>('gs_registered');
  const [partnerId, setPartnerId] = useState('');
  const [country, setCountry] = useState('');
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [nextRole, setNextRole] = useState<AuthRole>(user.role);

  // Reset approval form + role picker whenever a different account is opened.
  useEffect(() => {
    setWorkerType('gs_registered');
    setPartnerId('');
    setCountry('');
    setPartners(null);
    setCountries(null);
    setNextRole(user.role);
  }, [user.uid, user.role]);

  useEffect(() => {
    if (!isPendingWorker || countries !== null) return;
    api.get<CountryOption[]>('/currencies/countries').then(setCountries).catch(() => setCountries([]));
  }, [isPendingWorker, countries]);

  useEffect(() => {
    if (workerType !== 'partner_worker' || partners !== null) return;
    api.get<PartnerOption[]>('/partners').then(setPartners).catch(() => setPartners([]));
  }, [workerType, partners]);

  const approveDisabled = workerType === 'partner_worker' && !partnerId;
  const roleOptions = assignableRoles(actorRole);

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
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Firebase UID</p>
            <p className="text-[11px] font-mono text-gray-500 break-all bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100 select-all">
              {user.uid}
            </p>
          </div>

          {canChangeRole && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Change Role</p>
              {isActing ? (
                <div className="flex justify-center py-3"><SpinningDots size="sm" className="text-emerald-500" /></div>
              ) : (
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
              )}
              {actorRole === 'admin' && (
                <p className="text-[10px] text-gray-400 mt-2">
                  Only Executives can grant Executive access.
                </p>
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
  const isExecutive = actorRole === 'super_admin';
  const canCreateOpsLead = assignableRoles(actorRole).includes('admin');

  const [activeTab, setActiveTab] = useState<AccountsTab>('ops_lead');
  const [allUsers, setAllUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  async function loadUsers() {
    setLoading(true); setError('');
    try { setAllUsers(await apiListUsers()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed to load accounts.'); }
    finally { setLoading(false); }
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

  const pendingUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers
      .filter((u) => u.status === 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, search]);

  const tabUsers =
    activeTab === 'ops_lead' ? opsLeads
      : activeTab === 'executive' ? executives
        : pendingUsers;

  const TABS: { key: AccountsTab; label: string; count: number }[] = [
    { key: 'ops_lead', label: 'Operations Lead', count: opsLeads.length },
    { key: 'executive', label: 'Executive', count: executives.length },
    { key: 'pending', label: 'Pending Approval', count: pendingUsers.length },
  ];

  const canCreateOnTab =
    (activeTab === 'ops_lead' && canCreateOpsLead) ||
    (activeTab === 'executive' && isExecutive);

  const createRole: AuthRole = activeTab === 'executive' ? 'super_admin' : 'admin';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError(''); setCreateSuccess('');
    try {
      const created = await apiCreateUser(form.email, form.password, form.displayName, createRole);
      setCreateSuccess(`${ROLE_DISPLAY[createRole]} account created for ${created.email}`);
      setForm({ email: '', password: '', displayName: '' });
      setShowCreate(false);
      await loadUsers();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create account.');
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

  async function handleRoleChange(uid: string, role: AuthRole) {
    setActingOn(uid); setActionError('');
    try {
      await apiUpdateUserRole(uid, role);
      await loadUsers();
      setSelectedUser(null);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally { setActingOn(null); }
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Manage Operations Lead and Executive access, approve new signups, and change roles."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveTab(key); setShowCreate(false); setCreateError(''); setSearch(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
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

        {canCreateOnTab && (
          <button
            type="button"
            onClick={() => { setShowCreate((v) => !v); setCreateError(''); setCreateSuccess(''); }}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          >
            <UserPlus size={15} />
            {activeTab === 'executive' ? 'Add Executive' : 'Add Operations Lead'}
          </button>
        )}
      </div>

      {showCreate && canCreateOnTab && (
        <div className="glass-panel p-6 mb-5">
          <h2 className="text-sm font-bold text-white mb-1">
            New {ROLE_DISPLAY[createRole]} account
          </h2>
          <p className="text-xs text-theme-muted mb-4">
            {createRole === 'super_admin'
              ? 'Executives can only be created by an Executive. Access is granted immediately.'
              : 'Creates an Operations Lead with immediate access to the admin portal.'}
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Role</label>
              <input disabled value={ROLE_DISPLAY[createRole]} className="input-field opacity-80" />
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
                Create
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
                    {activeTab === 'pending'
                      ? 'No pending approval requests.'
                      : search
                        ? 'No accounts match your search.'
                        : `No ${activeTab === 'ops_lead' ? 'Operations Lead' : 'Executive'} accounts found.`}
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
    </div>
  );
}
