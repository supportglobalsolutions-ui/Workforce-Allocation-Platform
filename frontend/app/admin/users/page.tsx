'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  UserPlus, ShieldCheck, User, ChevronDown, AlertCircle,
  CheckCircle, XCircle, LayoutDashboard, Users, Eye,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AuthRole, ROLE_DISPLAY, assignableRoles } from '@/lib/auth/config';
import {
  ManagedUser,
  apiApproveUser,
  apiCreateUser,
  apiListUsers,
  apiRejectUser,
} from '@/lib/auth/firebase-auth';

// ── Role badge ─────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<AuthRole, string> = {
  super_admin: 'bg-gold-accent/20 text-gold-accent border border-gold-accent/30',
  admin:       'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30',
  user:        'bg-white/10 text-theme-muted border border-white/10',
};

function RoleBadge({ role }: { role: AuthRole }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
      {(role === 'super_admin' || role === 'admin') ? <ShieldCheck size={10} /> : <User size={10} />}
      {ROLE_DISPLAY[role]}
    </span>
  );
}

// ── Create form ────────────────────────────────────────────────────────────────

interface CreateForm { email: string; password: string; displayName: string; role: AuthRole; }
const EMPTY_FORM: CreateForm = { email: '', password: '', displayName: '', role: 'user' };

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  approved: 'text-emerald-accent',
  pending:  'text-gold-accent',
  rejected: 'text-danger',
};
const STATUS_LABEL: Record<string, string> = {
  approved: 'Active',
  pending:  'Pending approval',
  rejected: 'Rejected',
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function UserManagementPage() {
  const { session } = useAuth();
  const actorRole   = session?.authRole ?? 'user';
  const allowedCreate = assignableRoles(actorRole);

  const [users, setUsers]             = useState<ManagedUser[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState('');

  const [showCreate, setShowCreate]       = useState(false);
  const [form, setForm]                   = useState<CreateForm>({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [actingOn, setActingOn]       = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const otherUsers   = users.filter((u) => u.status !== 'pending');

  async function load() {
    setLoading(true); setLoadError('');
    try { setUsers(await apiListUsers()); }
    catch (e: unknown) { setLoadError(e instanceof Error ? e.message : 'Failed to load users.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError(''); setCreateSuccess('');
    try {
      const created = await apiCreateUser(form.email, form.password, form.displayName, form.role);
      setCreateSuccess(`Account created for ${created.email}`);
      setForm({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
      setShowCreate(false);
      await load();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create account.');
    } finally { setCreating(false); }
  }

  async function handleApprove(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiApproveUser(uid); await load(); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to approve.'); }
    finally { setActingOn(null); }
  }

  async function handleReject(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiRejectUser(uid); await load(); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to reject.'); }
    finally { setActingOn(null); }
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Review account requests, approve access, and preview portal views."
      />

      {/* Portal previews */}
      <div className="glass-panel p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Eye size={14} className="text-emerald-accent" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-theme-muted">Portal Previews</h2>
        </div>
        <p className="text-xs text-theme-muted mb-4">
          Switch into another portal view without changing your account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/worker/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent text-xs font-bold uppercase tracking-wider hover:bg-emerald-accent/20 transition-colors"
          >
            <LayoutDashboard size={13} />
            View User Dashboard
          </Link>
          {actorRole === 'super_admin' && (
            <Link
              href="/admin/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gold-accent/30 bg-gold-accent/10 text-gold-accent text-xs font-bold uppercase tracking-wider hover:bg-gold-accent/20 transition-colors"
            >
              <Users size={13} />
              View Admin Dashboard
            </Link>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-theme-muted">
          {users.length} account{users.length !== 1 ? 's' : ''}
          {pendingUsers.length > 0 && (
            <span className="ml-2 text-gold-accent">· {pendingUsers.length} pending</span>
          )}
        </p>
        {allowedCreate.length > 0 && (
          <button
            onClick={() => { setShowCreate((v) => !v); setCreateError(''); setCreateSuccess(''); }}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          >
            <UserPlus size={15} />
            Create account
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-sm font-bold text-white mb-4">New account (immediate access)</h2>
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
              <div className="relative">
                <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AuthRole }))} className="input-field appearance-none pr-8">
                  {allowedCreate.map((r) => <option key={r} value={r}>{ROLE_DISPLAY[r]}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
              </div>
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

      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {loadError}
        </div>
      ) : (
        <>
          {/* Pending approvals */}
          {pendingUsers.length > 0 && (
            <div className="glass-panel overflow-hidden mb-6">
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <h2 className="text-sm font-bold text-white">Pending approval</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Applicant</th>
                    <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{u.displayName || '—'}</p>
                        <p className="text-xs text-theme-muted">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {actingOn === u.uid ? (
                          <SpinningDots size="sm" className="text-emerald-accent inline-block" />
                        ) : (
                          <div className="inline-flex gap-2">
                            <button onClick={() => handleApprove(u.uid)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1">
                              <CheckCircle size={12} /> Approve
                            </button>
                            <button onClick={() => handleReject(u.uid)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
                              <XCircle size={12} /> Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* All accounts */}
          <div className="glass-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">User</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Role</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {otherUsers.map((u) => (
                  <tr key={u.uid} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{u.displayName || '—'}</p>
                      <p className="text-xs text-theme-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${STATUS_COLOR[u.status] ?? 'text-theme-muted'}`}>
                        {STATUS_LABEL[u.status] ?? (u.disabled ? 'Disabled' : 'Active')}
                      </span>
                    </td>
                  </tr>
                ))}
                {otherUsers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-12 text-center text-theme-muted text-sm">
                      No active accounts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
