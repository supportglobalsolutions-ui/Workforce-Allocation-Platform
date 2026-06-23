'use client';

import { useEffect, useState } from 'react';
import { UserPlus, ShieldCheck, User, ChevronDown, AlertCircle, CheckCircle } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import SpinningDots from '@/components/shared/SpinningDots';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  AuthRole,
  ROLE_DISPLAY,
  assignableRoles,
} from '@/lib/auth/config';
import {
  ManagedUser,
  apiCreateUser,
  apiListUsers,
  apiUpdateUserRole,
} from '@/lib/auth/firebase-auth';

const ROLE_BADGE: Record<AuthRole, string> = {
  super_admin: 'bg-gold-accent/20 text-gold-accent border border-gold-accent/30',
  admin: 'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30',
  user: 'bg-white/10 text-theme-muted border border-white/10',
};

function RoleBadge({ role }: { role: AuthRole }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_BADGE[role]}`}>
      {role === 'super_admin' && <ShieldCheck size={10} />}
      {role === 'admin' && <ShieldCheck size={10} />}
      {role === 'user' && <User size={10} />}
      {ROLE_DISPLAY[role]}
    </span>
  );
}

interface CreateForm {
  email: string;
  password: string;
  displayName: string;
  role: AuthRole;
}

const EMPTY_FORM: CreateForm = { email: '', password: '', displayName: '', role: 'user' };

export default function UserManagementPage() {
  const { session } = useAuth();
  const actorRole = session?.authRole ?? 'user';
  const allowedCreate = assignableRoles(actorRole);
  const canElevate = actorRole === 'super_admin';

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [elevating, setElevating] = useState<string | null>(null);
  const [elevateError, setElevateError] = useState('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      setUsers(await apiListUsers());
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setCreateSuccess('');
    try {
      const created = await apiCreateUser(form.email, form.password, form.displayName, form.role);
      setCreateSuccess(`Account created for ${created.email}`);
      setForm({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
      setShowCreate(false);
      await load();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create account.');
    } finally {
      setCreating(false);
    }
  }

  async function handleElevate(uid: string, newRole: AuthRole) {
    setElevating(uid);
    setElevateError('');
    try {
      await apiUpdateUserRole(uid, newRole);
      await load();
    } catch (e: unknown) {
      setElevateError(e instanceof Error ? e.message : 'Failed to update role.');
    } finally {
      setElevating(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Create and manage platform accounts. Role assignment is governed by your own permission level."
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-theme-muted">{users.length} account{users.length !== 1 ? 's' : ''}</p>
        {allowedCreate.length > 0 && (
          <button
            onClick={() => { setShowCreate((v) => !v); setCreateError(''); setCreateSuccess(''); }}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          >
            <UserPlus size={15} />
            Create Account
          </button>
        )}
      </div>

      {/* Create account form */}
      {showCreate && (
        <div className="glass-panel p-6 mb-6">
          <h2 className="text-sm font-bold text-white mb-4">New Account</h2>
          <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Display Name</label>
              <input
                required
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Full Name"
                className="input-field"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@globalsolutions.com"
                className="input-field"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Password</label>
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
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Role</label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AuthRole }))}
                  className="input-field appearance-none pr-8"
                >
                  {allowedCreate.map((r) => (
                    <option key={r} value={r}>{ROLE_DISPLAY[r]}</option>
                  ))}
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
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm py-2 px-4">
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                {creating ? <SpinningDots size="sm" className="text-emerald-accent" /> : <UserPlus size={14} />}
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Success toast */}
      {createSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-accent/10 border border-emerald-accent/30 text-emerald-accent text-xs mb-4">
          <CheckCircle size={14} /> {createSuccess}
        </div>
      )}

      {/* Elevation error */}
      {elevateError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs mb-4">
          <AlertCircle size={14} /> {elevateError}
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <SpinningDots size="lg" className="text-emerald-accent" />
        </div>
      ) : loadError ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {loadError}
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">User</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Role</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                {canElevate && (
                  <th className="text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Change Role</th>
                )}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.uid} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{u.displayName || '—'}</p>
                    <p className="text-xs text-theme-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${u.disabled ? 'text-danger' : 'text-emerald-accent'}`}>
                      {u.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  {canElevate && (
                    <td className="px-4 py-3 text-right">
                      {elevating === u.uid ? (
                        <SpinningDots size="sm" className="text-emerald-accent inline-block" />
                      ) : (
                        <div className="inline-flex gap-1">
                          {(['user', 'admin', 'super_admin'] as AuthRole[])
                            .filter((r) => r !== u.role)
                            .map((r) => (
                              <button
                                key={r}
                                onClick={() => handleElevate(u.uid, r)}
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border border-white/10 text-theme-muted hover:text-white hover:border-white/30 transition-colors"
                              >
                                → {ROLE_DISPLAY[r]}
                              </button>
                            ))}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={canElevate ? 4 : 3} className="px-4 py-12 text-center text-theme-muted text-sm">
                    No accounts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
