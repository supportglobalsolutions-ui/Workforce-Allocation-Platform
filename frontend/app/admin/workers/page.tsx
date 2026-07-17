'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle, ChevronDown, Eye, Pencil, Plus,
  Search, ShieldCheck, ShieldOff, User, UserPlus, X, XCircle,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import AdminSectionTabs, { PEOPLE_TABS } from '@/components/platform/AdminSectionTabs';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  ManagedUser,
  AccountStatus,
  apiApproveUser,
  apiBanUser,
  apiBanWorker,
  apiCreateUser,
  apiGetAccountStatus,
  apiListUsers,
  apiRejectUser,
  apiUnbanUser,
  apiUnbanWorker,
} from '@/lib/auth/firebase-auth';
import { useAuth } from '@/lib/auth/AuthProvider';
import { AuthRole, ROLE_DISPLAY, assignableRoles } from '@/lib/auth/config';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Worker {
  id: string;
  display_name: string;
  username: string | null;
  country: string;
  worker_type: string;
  partner_entity_id: string | null;
  partner_entity_name: string | null;
  work_ready: boolean;
  admin_user_id: string | null;
  pay_tier: string;
  status: string;
  start_date: string;
  created_at: string;
  updated_at: string;
  email: string | null;
}

interface PartnerOption { id: string; name: string; }
interface CountryOption { id: string; name: string; currency_code: string; is_active: boolean; }

interface WorkSession {
  id: string;
  session_type: string;
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  close_status: string | null;
  rdp_resource_id: string | null;
  start_image_url: string | null;
  end_image_url: string | null;
}

interface RDPResource { id: string; nickname: string; }

type PeopleTab = 'workers' | 'admins' | 'super_admins';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Session-type labels (for work sessions only)
const TYPE_LABELS: Record<string, string> = {
  gs_rdp: 'GS RDP',
  partner_multilog: 'Partner Multilog',
  third_party_platform: 'Third Party',
};

// Worker designation labels
const WORKER_TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Member',
  partner_worker: 'Partner',
};

function WorkerTypeBadge({ worker }: { worker: Pick<Worker, 'worker_type' | 'partner_entity_name'> }) {
  if (worker.worker_type === 'partner_worker') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gold-accent/20 text-gold-accent border border-gold-accent/30">
          Partner
        </span>
        {worker.partner_entity_name && (
          <span className="text-xs text-theme-muted">{worker.partner_entity_name}</span>
        )}
      </span>
    );
  }
  return <span className="text-sm">{WORKER_TYPE_LABELS[worker.worker_type] ?? worker.worker_type}</span>;
}

function WorkReadyBadge({ ready }: { ready: boolean }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
      ready
        ? 'bg-emerald-accent/20 text-emerald-accent border-emerald-accent/30'
        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    }`}>
      {ready ? 'Cleared' : 'Training'}
    </span>
  );
}

function formatDuration(minutes: number | null) {
  if (!minutes) return '—';
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

const ROLE_BADGE: Record<AuthRole, string> = {
  super_admin: 'bg-gold-accent/20 text-gold-accent border border-gold-accent/30',
  admin:       'bg-emerald-accent/20 text-emerald-accent border border-emerald-accent/30',
  user:        'bg-white/10 text-theme-muted border border-white/10',
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

// ── Worker Detail Modal ────────────────────────────────────────────────────────

type WorkerModalTab = 'profile' | 'sessions';

interface WorkerEditForm {
  display_name: string;
  username: string;
  country: string;
  pay_tier: string;
  status: string;
  start_date: string;
  worker_type: string;
  partner_entity_id: string;
  work_ready: boolean;
}

function editFormFromWorker(w: Worker): WorkerEditForm {
  return {
    display_name: w.display_name,
    username: w.username ?? '',
    country: w.country ?? '',
    pay_tier: w.pay_tier ?? '',
    status: w.status,
    start_date: (w.start_date ?? '').slice(0, 10),
    worker_type: w.worker_type,
    partner_entity_id: w.partner_entity_id ?? '',
    work_ready: w.work_ready,
  };
}

function WorkerDetailModal({ worker, onClose, onUpdated }: { worker: Worker; onClose: () => void; onUpdated: (w: Worker) => void }) {
  const [tab, setTab] = useState<WorkerModalTab>('profile');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [banStatus, setBanStatus] = useState<AccountStatus | 'not_found' | null>(null);
  const [banLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<WorkerEditForm>(() => editFormFromWorker(worker));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [countries, setCountries] = useState<CountryOption[] | null>(null);
  const [partnerOptions, setPartnerOptions] = useState<PartnerOption[] | null>(null);

  useEffect(() => {
    if (!editing) return;
    if (countries === null) {
      api.get<CountryOption[]>('/currencies/countries').then(setCountries).catch(() => setCountries([]));
    }
    if (partnerOptions === null) {
      api.get<PartnerOption[]>('/partners').then(setPartnerOptions).catch(() => setPartnerOptions([]));
    }
  }, [editing, countries, partnerOptions]);

  const editValid =
    editForm.display_name.trim().length > 0 &&
    (editForm.worker_type !== 'partner_worker' || editForm.partner_entity_id !== '');

  async function handleSaveEdit() {
    if (!editValid) return;
    setEditSaving(true); setEditError(null);
    try {
      const body = {
        display_name: editForm.display_name.trim(),
        username: editForm.username.trim() || null,
        country: editForm.country,
        pay_tier: editForm.pay_tier,
        status: editForm.status,
        start_date: editForm.start_date,
        worker_type: editForm.worker_type,
        partner_entity_id: editForm.worker_type === 'partner_worker' ? editForm.partner_entity_id : null,
        work_ready: editForm.work_ready,
      };
      const resp = await api.patch<Partial<Worker>>(`/workers/${worker.id}`, body);
      const partnerName = editForm.worker_type === 'partner_worker'
        ? (partnerOptions?.find((p) => p.id === editForm.partner_entity_id)?.name ?? worker.partner_entity_name)
        : null;
      onUpdated({ ...worker, ...body, ...resp, partner_entity_name: partnerName } as Worker);
      setEditing(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save worker.');
    } finally { setEditSaving(false); }
  }

  useEffect(() => {
    if (!worker.admin_user_id || !worker.email) return;
    apiGetAccountStatus(worker.email)
      .then((r) => setBanStatus(r.status))
      .catch(() => setBanStatus(null));
  }, [worker.admin_user_id, worker.email]);

  async function handleBan() {
    setBanLoading(true); setBanError(null);
    try { await apiBanWorker(worker.id); setBanStatus('banned'); }
    catch (e: unknown) { setBanError(e instanceof Error ? e.message : 'Failed to ban.'); }
    finally { setBanLoading(false); }
  }

  async function handleUnban() {
    setBanLoading(true); setBanError(null);
    try { await apiUnbanWorker(worker.id); setBanStatus('approved'); }
    catch (e: unknown) { setBanError(e instanceof Error ? e.message : 'Failed to unban.'); }
    finally { setBanLoading(false); }
  }

  useEffect(() => {
    if (tab !== 'sessions' || sessions.length > 0) return;
    setSessionsLoading(true);
    setSessionsError(null);
    Promise.all([
      api.get<WorkSession[]>(`/sessions?worker_id=${worker.id}&limit=200`),
      api.get<RDPResource[]>('/rdp'),
    ])
      .then(([s, m]) => { setSessions(s); setMachines(m); })
      .catch((e) => setSessionsError(e instanceof Error ? e.message : 'Failed to load sessions'))
      .finally(() => setSessionsLoading(false));
  }, [tab, worker.id, sessions.length]);

  const machineName = (id: string | null) => {
    if (!id) return '—';
    return machines.find((m) => m.id === id)?.nickname ?? id.slice(0, 8) + '…';
  };

  const sessionRows = sessions.map((s) => ({
    id: s.id,
    date: new Date(s.start_time).toLocaleString(),
    machine: machineName(s.rdp_resource_id),
    duration: formatDuration(s.duration_minutes),
    type: TYPE_LABELS[s.session_type] ?? s.session_type,
    status: s.close_status ?? (s.end_time ? 'completed' : 'active'),
    start_image_url: s.start_image_url,
    end_image_url: s.end_image_url,
  }));

  const selectedSession = selectedSessionId
    ? sessionRows.find((r) => r.id === selectedSessionId) ?? null
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-white/[0.06] shrink-0">
            <div>
              <h2 className="text-base font-bold text-white">{worker.display_name}</h2>
              <p className="text-xs text-theme-muted mt-0.5">
                {WORKER_TYPE_LABELS[worker.worker_type] ?? worker.worker_type}
                {worker.worker_type === 'partner_worker' && worker.partner_entity_name ? ` · ${worker.partner_entity_name}` : ''}
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
              <X size={16} />
            </button>
          </div>

          <div className="flex border-b border-white/[0.06] px-5 shrink-0">
            {(['profile', 'sessions'] as WorkerModalTab[]).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                  tab === t ? 'text-emerald-400 border-emerald-400' : 'text-theme-muted border-transparent hover:text-white'
                }`}>
                {t === 'profile' ? 'Profile' : 'Sessions & Images'}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex-1">
            {tab === 'profile' && !editing && (
              <div className="p-5 space-y-5">
                <div className="flex justify-end">
                  <button type="button"
                    onClick={() => { setEditForm(editFormFromWorker(worker)); setEditError(null); setEditing(true); }}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                    <Pencil size={12} /> Edit
                  </button>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Identity</p>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Display Name" value={worker.display_name} />
                    <DetailField label="Username" value={worker.username || '—'} />
                    <DetailField label="Country" value={worker.country || '—'} />
                    <DetailField label="Worker Type" value={<WorkerTypeBadge worker={worker} />} />
                    {worker.worker_type === 'partner_worker' && worker.partner_entity_name && (
                      <DetailField label="Partner Company" value={worker.partner_entity_name} />
                    )}
                    <DetailField label="Status" value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />} />
                    <DetailField label="Work Ready" value={<WorkReadyBadge ready={worker.work_ready} />} />
                  </div>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Employment</p>
                  <div className="grid grid-cols-2 gap-4">
                    <DetailField label="Pay Tier" value={worker.pay_tier} />
                    <DetailField label="Start Date" value={new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} />
                    <DetailField label="Created" value={new Date(worker.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                    <DetailField label="Last Updated" value={new Date(worker.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                  </div>
                </div>
                <div className="border-t border-white/[0.06]" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Reference IDs</p>
                  <div className="space-y-3">
                    <DetailField label="Worker ID" value={<span className="font-mono text-xs break-all">{worker.id}</span>} />
                    {worker.admin_user_id && (
                      <DetailField label="Admin User ID" value={<span className="font-mono text-xs break-all">{worker.admin_user_id}</span>} />
                    )}
                    {worker.partner_entity_id && (
                      <DetailField label="Partner Entity ID" value={<span className="font-mono text-xs break-all">{worker.partner_entity_id}</span>} />
                    )}
                  </div>
                </div>

                {worker.admin_user_id && banStatus !== null && banStatus !== 'not_found' && (
                  <>
                    <div className="border-t border-white/[0.06]" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent mb-3">Account Access</p>
                      {banError && <p className="text-xs text-red-400 mb-3">{banError}</p>}
                      {banStatus === 'banned' && (
                        <p className="text-xs text-red-400 mb-3">This account is banned. The worker cannot log in.</p>
                      )}
                      {banLoading ? (
                        <div className="flex items-center gap-2 text-theme-muted text-xs">
                          <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin block" />
                          Processing…
                        </div>
                      ) : banStatus === 'banned' ? (
                        <button type="button" onClick={handleUnban}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-accent/20 hover:bg-emerald-accent/30 text-emerald-400 text-xs font-bold uppercase tracking-wider transition-colors border border-emerald-accent/30">
                          <ShieldOff size={13} /> Unban Account
                        </button>
                      ) : (
                        <button type="button" onClick={handleBan}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider transition-colors border border-red-500/30">
                          <Ban size={13} /> Lock / Ban Account
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'profile' && editing && (
              <div className="p-5 space-y-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gold-accent">Edit Worker Profile</p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Display Name</label>
                    <input value={editForm.display_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Username</label>
                    <input value={editForm.username}
                      onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="username" className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Country</label>
                    <div className="relative">
                      <select value={editForm.country}
                        onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                        className="input-field appearance-none pr-8">
                        <option value="">Unassigned</option>
                        {editForm.country && !(countries ?? []).some((c) => c.name === editForm.country) && (
                          <option value={editForm.country}>{editForm.country}</option>
                        )}
                        {(countries ?? []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Pay Tier</label>
                    <input value={editForm.pay_tier}
                      onChange={(e) => setEditForm((f) => ({ ...f, pay_tier: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Status</label>
                    <div className="relative">
                      <select value={editForm.status}
                        onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                        className="input-field appearance-none pr-8 capitalize">
                        {['active', 'inactive', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Start Date</label>
                    <input type="date" value={editForm.start_date}
                      onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Worker Type</label>
                    <div className="relative">
                      <select value={editForm.worker_type}
                        onChange={(e) => setEditForm((f) => ({ ...f, worker_type: e.target.value }))}
                        className="input-field appearance-none pr-8">
                        <option value="gs_registered">GS Member</option>
                        <option value="partner_worker">Partner</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                    </div>
                  </div>
                  {editForm.worker_type === 'partner_worker' && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-theme-muted mb-1 block">Partner Company *</label>
                      <div className="relative">
                        <select value={editForm.partner_entity_id}
                          onChange={(e) => setEditForm((f) => ({ ...f, partner_entity_id: e.target.value }))}
                          className="input-field appearance-none pr-8">
                          <option value="">Select partner…</option>
                          {(partnerOptions ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                      </div>
                      {partnerOptions === null && <p className="text-[10px] text-theme-muted mt-1">Loading partners…</p>}
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={editForm.work_ready}
                    onChange={(e) => setEditForm((f) => ({ ...f, work_ready: e.target.checked }))}
                    className="accent-emerald-400" />
                  <span className="text-sm text-white">Cleared to work</span>
                  <WorkReadyBadge ready={editForm.work_ready} />
                </label>

                {editError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                    <AlertCircle size={14} /> {editError}
                  </div>
                )}

                <div className="flex gap-3 justify-end border-t border-white/[0.06] pt-4">
                  <button type="button" onClick={() => { setEditing(false); setEditError(null); }}
                    className="btn-secondary text-sm py-2 px-4">Cancel</button>
                  <button type="button" onClick={handleSaveEdit} disabled={editSaving || !editValid}
                    className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60">
                    {editSaving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={14} />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {tab === 'sessions' && (
              <div className="p-5">
                {sessionsLoading ? (
                  <p className="text-theme-muted text-sm">Loading sessions…</p>
                ) : sessionsError ? (
                  <p className="text-danger text-sm">{sessionsError}</p>
                ) : sessions.length === 0 ? (
                  <p className="text-theme-muted text-sm">No sessions found for this worker.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-theme-muted mb-3">{sessions.length} session{sessions.length !== 1 ? 's' : ''} — click the eye icon to view images</p>
                    <DataTable
                      columns={[
                        { key: 'date', header: 'Date' },
                        { key: 'machine', header: 'Machine' },
                        { key: 'duration', header: 'Duration' },
                        { key: 'type', header: 'Type' },
                        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status as string} /> },
                        {
                          key: 'id', header: '',
                          render: (r) => (
                            <button type="button" onClick={() => setSelectedSessionId(r.id as string)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                              style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                              <Eye size={14} />
                            </button>
                          ),
                        },
                      ]}
                      data={sessionRows as unknown as Record<string, unknown>[]}
                      emptyMessage="No sessions."
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <SessionDetailPanel
        session={selectedSession}
        onClose={() => setSelectedSessionId(null)}
        onImageUploaded={(sessionId, type, url) => {
          setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, [`${type}_image_url`]: url } : s));
        }}
      />
    </>
  );
}

// ── Account Detail Modal (for Admins / Super Admins) ──────────────────────────

interface ApproveBody {
  worker_type?: string;
  partner_entity_id?: string | null;
  country?: string | null;
}

interface AccountModalProps {
  user: ManagedUser;
  actorRole: string;
  onClose: () => void;
  onApprove: (uid: string, body?: ApproveBody) => void;
  onReject: (uid: string) => void;
  onBan: (uid: string) => void;
  onUnban: (uid: string) => void;
  actingOn: string | null;
}

function AccountDetailModal({ user, actorRole, onClose, onApprove, onReject, onBan, onUnban, actingOn }: AccountModalProps) {
  const isActing = actingOn === user.uid;
  const canBan = actorRole === 'super_admin' || user.role !== 'super_admin';
  const isPendingWorker = user.status === 'pending' && user.role === 'user';

  // Approval designation (worker accounts only)
  const [workerType, setWorkerType] = useState<'gs_registered' | 'partner_worker'>('gs_registered');
  const [partnerId, setPartnerId] = useState('');
  const [country, setCountry] = useState('');
  const [partners, setPartners] = useState<PartnerOption[] | null>(null);
  const [countries, setCountries] = useState<CountryOption[] | null>(null);

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
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Firebase UID</p>
            <p className="text-[11px] font-mono text-gray-500 break-all bg-gray-50 px-3 py-2.5 rounded-xl border border-gray-100 select-all">
              {user.uid}
            </p>
          </div>

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
                          {partners === null && <p className="text-[10px] text-gray-400 mt-1">Loading partners…</p>}
                          {partners !== null && partners.length === 0 && (
                            <p className="text-[10px] text-red-500 mt-1">No partner companies found. Create one in Partner Management first.</p>
                          )}
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
                      <p className="text-[10px] text-gray-400">
                        New workers must complete onboarding training before they can start work.
                      </p>
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
                <>
                  <p className="text-[10px] text-red-500 mb-2">This account is banned. The user cannot log in.</p>
                  <button type="button" onClick={() => onUnban(user.uid)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider transition-colors">
                    <ShieldOff size={13} /> Unban Account
                  </button>
                </>
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

// ── Create Account Form ────────────────────────────────────────────────────────

interface CreateForm { email: string; password: string; displayName: string; role: AuthRole; }
const EMPTY_FORM: CreateForm = { email: '', password: '', displayName: '', role: 'user' };

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PeopleManagementPage() {
  const { session } = useAuth();
  const actorRole     = session?.authRole ?? 'user';
  const allowedCreate = assignableRoles(actorRole);

  const [activeTab, setActiveTab] = useState<PeopleTab>('workers');

  // Workers
  const [workers, setWorkers]           = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  // Auth accounts
  const [allUsers, setAllUsers]         = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError]     = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [actingOn, setActingOn]         = useState<string | null>(null);
  const [actionError, setActionError]   = useState('');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  // Create account
  const [showCreate, setShowCreate]       = useState(false);
  const [form, setForm]                   = useState<CreateForm>({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
  const [creating, setCreating]           = useState(false);
  const [createError, setCreateError]     = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  async function loadWorkers() {
    setWorkersLoading(true); setWorkersError(null);
    try { setWorkers(await api.get<Worker[]>('/workers')); }
    catch (e: unknown) { setWorkersError(e instanceof Error ? e.message : 'Failed to load workers.'); }
    finally { setWorkersLoading(false); }
  }

  async function loadUsers() {
    setUsersLoading(true); setUsersError('');
    try { setAllUsers(await apiListUsers()); }
    catch (e: unknown) { setUsersError(e instanceof Error ? e.message : 'Failed to load accounts.'); }
    finally { setUsersLoading(false); }
  }

  useEffect(() => { loadWorkers(); loadUsers(); }, []);

  // ── Workers filtering
  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    return workers.filter((w) => {
      if (typeFilter && (WORKER_TYPE_LABELS[w.worker_type] ?? w.worker_type) !== typeFilter) return false;
      if (statusFilter && w.status !== statusFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        w.display_name.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        w.pay_tier.toLowerCase().includes(q)
      );
    });
  }, [workers, workerSearch, typeFilter, statusFilter]);

  // ── Account filtering by tab
  const adminUsers = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    const role: AuthRole = activeTab === 'admins' ? 'admin' : 'super_admin';
    return allUsers
      .filter((u) => u.role === role && u.status !== 'pending')
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [allUsers, activeTab, accountSearch]);

  const pendingUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'pending'),
    [allUsers],
  );

  // ── Create account
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true); setCreateError(''); setCreateSuccess('');
    try {
      const created = await apiCreateUser(form.email, form.password, form.displayName, form.role);
      setCreateSuccess(`Account created for ${created.email}`);
      setForm({ ...EMPTY_FORM, role: allowedCreate[0] ?? 'user' });
      setShowCreate(false);
      await loadUsers();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create account.');
    } finally { setCreating(false); }
  }

  // ── Account actions
  async function handleApprove(uid: string, body?: ApproveBody) {
    setActingOn(uid); setActionError('');
    try {
      await apiApproveUser(uid, body);
      await loadUsers();
      await loadWorkers(); // approval may provision a new worker profile
      setSelectedUser(null);
    }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to approve.'); }
    finally { setActingOn(null); }
  }

  async function handleReject(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiRejectUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to reject.'); }
    finally { setActingOn(null); }
  }

  async function handleBan(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiBanUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to ban account.'); }
    finally { setActingOn(null); }
  }

  async function handleUnban(uid: string) {
    setActingOn(uid); setActionError('');
    try { await apiUnbanUser(uid); await loadUsers(); setSelectedUser(null); }
    catch (e: unknown) { setActionError(e instanceof Error ? e.message : 'Failed to unban account.'); }
    finally { setActingOn(null); }
  }

  const TABS: { key: PeopleTab; label: string; count?: number }[] = [
    { key: 'workers',     label: 'Workers',     count: workers.length },
    { key: 'admins',      label: 'Admins',      count: allUsers.filter((u) => u.role === 'admin').length },
    { key: 'super_admins',label: 'Super Admins', count: allUsers.filter((u) => u.role === 'super_admin').length },
  ];

  const workerRows = filteredWorkers.map((w) => ({
    id: w.id,
    name: w.display_name,
    country: w.country,
    type: WORKER_TYPE_LABELS[w.worker_type] ?? w.worker_type,
    work_ready: w.work_ready,
    pay_tier: w.pay_tier,
    start_date: new Date(w.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    status: w.status,
    _worker: w,
  }));

  function handleWorkerUpdated(updated: Worker) {
    setWorkers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setSelectedWorker((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  return (
    <div>
      <PageHeader
        title="People Management"
        description="Manage worker profiles, admin accounts, and system access."
      />
      <AdminSectionTabs tabs={PEOPLE_TABS} />

      {/* Tab bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveTab(key); setShowCreate(false); setCreateError(''); setCreateSuccess(''); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === key
                  ? 'bg-emerald-accent/20 text-emerald-400'
                  : 'text-theme-muted hover:text-white'
              }`}
            >
              {label}
              {count !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === key ? 'bg-emerald-accent/20 text-emerald-400' : 'bg-white/10 text-theme-muted'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contextual actions */}
        {activeTab === 'workers' && (
          <button className="btn-primary flex items-center gap-2 text-sm py-2 px-4">
            <Plus size={15} /> Create Worker
          </button>
        )}
        {(activeTab === 'admins' || activeTab === 'super_admins') && allowedCreate.length > 0 && (
          <button
            onClick={() => { setShowCreate((v) => !v); setCreateError(''); setCreateSuccess(''); }}
            className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
          >
            <UserPlus size={15} /> Create Account
          </button>
        )}
      </div>

      {/* Pending approvals (show in admins/super_admins tabs if any) */}
      {(activeTab === 'admins' || activeTab === 'super_admins') && pendingUsers.length > 0 && (
        <div className="glass-panel overflow-hidden mb-5">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
            <AlertCircle size={13} className="text-gold-accent" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-gold-accent">
              Pending Approval ({pendingUsers.length})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Applicant</th>
                <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Applied</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.uid} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{u.displayName || '—'}</p>
                    <p className="text-xs text-theme-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-theme-muted">
                    {new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setSelectedUser(u)}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create account form */}
      {showCreate && (activeTab === 'admins' || activeTab === 'super_admins') && (
        <div className="glass-panel p-6 mb-5">
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

      {/* ── Workers tab ── */}
      {activeTab === 'workers' && (
        <>
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
              <input
                type="text"
                placeholder="Search name, country, pay tier…"
                value={workerSearch}
                onChange={(e) => setWorkerSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-56"
              />
              {workerSearch && (
                <button type="button" onClick={() => setWorkerSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
            {[
              { label: 'Type', options: ['GS Member', 'Partner'], setter: setTypeFilter, value: typeFilter },
              { label: 'Status', options: ['active', 'inactive', 'suspended'], setter: setStatusFilter, value: statusFilter },
            ].map(({ label, options, setter, value }) => (
              <select key={label} value={value} onChange={(e) => setter(e.target.value)}
                className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 capitalize">
                <option value="">{label}: All</option>
                {options.map((o) => <option key={o} value={o} className="capitalize">{o}</option>)}
              </select>
            ))}
            <span className="text-xs text-theme-muted ml-1">{filteredWorkers.length} worker{filteredWorkers.length !== 1 ? 's' : ''}</span>
          </div>

          {workersLoading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : workersError ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
              <AlertCircle size={16} /> {workersError}
            </div>
          ) : (
            <DataTable
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'country', header: 'Country' },
                {
                  key: 'type', header: 'Type',
                  render: (r) => <WorkerTypeBadge worker={(r as typeof workerRows[number])._worker} />,
                },
                {
                  key: 'work_ready', header: 'Work Ready',
                  render: (r) => <WorkReadyBadge ready={Boolean(r.work_ready)} />,
                },
                { key: 'pay_tier', header: 'Pay Tier' },
                { key: 'start_date', header: 'Start Date' },
                {
                  key: 'status', header: 'Status',
                  render: (r) => <StatusBadge status={r.status === 'active' ? 'approved' : 'offline'} label={r.status as string} />,
                },
                {
                  key: 'actions', header: '',
                  render: (r) => (
                    <button type="button"
                      onClick={() => setSelectedWorker((r as typeof workerRows[number])._worker)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                      style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                      <Eye size={14} />
                    </button>
                  ),
                },
              ]}
              data={workerRows as unknown as Record<string, unknown>[]}
              emptyMessage="No workers found."
            />
          )}
        </>
      )}

      {/* ── Admins / Super Admins tab ── */}
      {(activeTab === 'admins' || activeTab === 'super_admins') && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
              <input
                type="text"
                placeholder="Search name or email…"
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-56"
              />
              {accountSearch && (
                <button type="button" onClick={() => setAccountSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
            <span className="text-xs text-theme-muted ml-1">{adminUsers.length} account{adminUsers.length !== 1 ? 's' : ''}</span>
          </div>

          {usersLoading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : usersError ? (
            <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
              <AlertCircle size={16} /> {usersError}
            </div>
          ) : (
            <div className="glass-panel overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Account</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Role</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Status</th>
                    <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-theme-muted">Created</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {adminUsers.map((u) => (
                    <tr key={u.uid} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{u.displayName || '—'}</p>
                        <p className="text-xs text-theme-muted">{u.email}</p>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${
                          u.status === 'banned' ? 'text-red-400' :
                          u.disabled ? 'text-theme-muted' :
                          u.status === 'approved' ? 'text-emerald-accent' : 'text-danger'
                        }`}>
                          {u.status === 'banned' ? 'Banned' : u.disabled ? 'Disabled' : u.status === 'approved' ? 'Active' : u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-theme-muted">
                        {new Date(u.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => setSelectedUser(u)}
                          className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-theme-muted hover:text-theme-heading transition-colors"
                          style={{ background: 'var(--surface-container)', border: '1px solid var(--glass-border)' }}>
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {adminUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-theme-muted text-sm">
                        {accountSearch ? 'No accounts match your search.' : `No ${activeTab === 'admins' ? 'admin' : 'super admin'} accounts found.`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {selectedWorker && (
        <WorkerDetailModal
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          onUpdated={handleWorkerUpdated}
        />
      )}
      {selectedUser && (
        <AccountDetailModal
          user={selectedUser}
          actorRole={actorRole}
          onClose={() => setSelectedUser(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onBan={handleBan}
          onUnban={handleUnban}
          actingOn={actingOn}
        />
      )}
    </div>
  );
}
