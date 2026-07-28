'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle, ChevronDown, Eye, Settings2, Star,
  Search, ShieldOff, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import RateWorkerModal from '@/components/quality/RateWorkerModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  AccountStatus,
  apiBanWorker,
  apiGetAccountStatus,
  apiUnbanWorker,
} from '@/lib/auth/firebase-auth';

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
  pay_amount?: number | string | null;
  pay_frequency?: string | null;
  status: string;
  start_date: string;
  created_at: string;
  updated_at: string;
  email: string | null;
  assigned_rdp_id?: string | null;
  assigned_rdp_nickname?: string | null;
}

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

interface RDPResource { id: string; nickname: string; status?: string; assigned_worker_id?: string | null; }

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
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1">{label}</p>
      <div className="text-[13px] font-medium text-white leading-snug break-words">{value}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-theme-muted mb-2.5">{children}</p>
  );
}

// ── Worker Detail Modal ────────────────────────────────────────────────────────

type WorkerModalTab = 'profile' | 'sessions';

/** Admin editable fields — personal, payment, assignment (no company for GS members). */
interface WorkerAdminForm {
  display_name: string;
  username: string;
  country: string;
  pay_tier: string;
  pay_amount: string;
  pay_frequency: '' | 'per_month' | 'per_task';
  status: string;
  start_date: string;
  work_ready: boolean;
  assigned_rdp_id: string;
}

function adminFormFromWorker(w: Worker): WorkerAdminForm {
  return {
    display_name: w.display_name ?? '',
    username: w.username ?? '',
    country: w.country ?? '',
    pay_tier: w.pay_tier ?? '',
    pay_amount: w.pay_amount != null ? String(w.pay_amount) : '',
    pay_frequency: (w.pay_frequency === 'per_month' || w.pay_frequency === 'per_task')
      ? w.pay_frequency
      : '',
    status: w.status,
    start_date: (w.start_date ?? '').slice(0, 10),
    work_ready: w.work_ready,
    assigned_rdp_id: w.assigned_rdp_id ?? '',
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

  // Admin controls
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<WorkerAdminForm>(() => adminFormFromWorker(worker));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [showRate, setShowRate] = useState(false);
  const [rdpOptions, setRdpOptions] = useState<RDPResource[] | null>(null);
  const [paymentTiers, setPaymentTiers] = useState<{ name: string }[] | null>(null);

  async function handleSaveEdit() {
    setEditSaving(true); setEditError(null);
    try {
      const body = {
        display_name: editForm.display_name.trim(),
        username: editForm.username.trim() || null,
        country: editForm.country.trim() || 'Unassigned',
        pay_tier: editForm.pay_tier.trim() || 'unassigned',
        pay_amount: editForm.pay_amount === '' ? null : Number(editForm.pay_amount),
        pay_frequency: editForm.pay_frequency || null,
        status: editForm.status,
        start_date: editForm.start_date,
        work_ready: editForm.work_ready,
        assigned_rdp_id: editForm.assigned_rdp_id || null,
      };
      const resp = await api.patch<Partial<Worker>>(`/workers/${worker.id}`, body);
      onUpdated({ ...worker, ...body, ...resp } as Worker);
      setEditing(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save worker.');
    } finally { setEditSaving(false); }
  }

  useEffect(() => {
    if (!editing || rdpOptions !== null) return;
    api.get<RDPResource[]>('/rdp').then(setRdpOptions).catch(() => setRdpOptions([]));
  }, [editing, rdpOptions]);

  useEffect(() => {
    if (!editing || paymentTiers !== null) return;
    api.get<{ name: string; is_active: boolean }[]>('/payment-tiers?active_only=true')
      .then((t) => setPaymentTiers(t.map((x) => ({ name: x.name }))))
      .catch(() => setPaymentTiers([]));
  }, [editing, paymentTiers]);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`glass-panel rounded-2xl border border-white/10 w-full max-h-[85vh] flex flex-col ${
          tab === 'sessions' ? 'max-w-2xl' : 'max-w-md'
        }`}>
          <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
            <div className="min-w-0 flex-1 pr-3">
              <h2 className="text-[15px] font-bold text-white truncate">{worker.display_name}</h2>
              <p className="text-xs text-theme-muted mt-0.5 truncate">
                {WORKER_TYPE_LABELS[worker.worker_type] ?? worker.worker_type}
                {worker.worker_type === 'partner_worker' && worker.partner_entity_name ? ` · ${worker.partner_entity_name}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {tab === 'profile' && !editing && (
                <>
                  <button type="button"
                    onClick={() => setShowRate(true)}
                    className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center gap-1.5">
                    <Star size={11} /> Rate
                  </button>
                  <button type="button"
                    onClick={() => { setEditForm(adminFormFromWorker(worker)); setEditError(null); setEditing(true); }}
                    className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center gap-1.5">
                    <Settings2 size={11} /> Manage
                  </button>
                </>
              )}
              <button type="button" onClick={onClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="flex border-b border-white/[0.06] px-5 shrink-0">
            {(['profile', 'sessions'] as WorkerModalTab[]).map((t) => (
              <button key={t} type="button" onClick={() => { setTab(t); setEditing(false); }}
                className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                  tab === t ? 'text-emerald-400 border-emerald-400' : 'text-theme-muted border-transparent hover:text-white'
                }`}>
                {t === 'profile' ? 'Profile' : 'Sessions & Images'}
              </button>
            ))}
          </div>

          <div className="overflow-y-auto flex-1">
            {tab === 'profile' && !editing && (
              <div className="px-5 py-4 space-y-4">
                <div>
                  <SectionLabel>Identity</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                    <DetailField label="Display Name" value={worker.display_name} />
                    <DetailField label="Username" value={worker.username || '—'} />
                    <DetailField label="Country" value={worker.country || '—'} />
                    <DetailField label="Worker Type" value={<WorkerTypeBadge worker={worker} />} />
                    <DetailField label="Status" value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />} />
                    <DetailField label="Work Ready" value={<WorkReadyBadge ready={worker.work_ready} />} />
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Payment & assignment</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                    <DetailField label="Pay Tier" value={worker.pay_tier || '—'} />
                    <DetailField
                      label="Pay amount"
                      value={
                        worker.pay_amount != null
                          ? `${worker.pay_amount}${worker.pay_frequency === 'per_month' ? ' / month' : worker.pay_frequency === 'per_task' ? ' / task' : ''}`
                          : '—'
                      }
                    />
                    <DetailField label="Assigned RDP" value={worker.assigned_rdp_nickname || '—'} />
                    <DetailField label="Start Date" value={new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} />
                  </div>
                </div>

                {worker.admin_user_id && banStatus !== null && banStatus !== 'not_found' && (
                  <div className="border-t border-white/[0.06] pt-4">
                    <SectionLabel>Account Access</SectionLabel>
                    {banError && <p className="text-xs text-red-400 mb-2">{banError}</p>}
                    {banStatus === 'banned' && (
                      <p className="text-xs text-red-400/90 mb-2.5 leading-relaxed">
                        This account is banned. The worker cannot log in.
                      </p>
                    )}
                    {banLoading ? (
                      <div className="flex items-center gap-2 text-theme-muted text-xs py-1">
                        <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin block" />
                        Processing…
                      </div>
                    ) : banStatus === 'banned' ? (
                      <button type="button" onClick={handleUnban}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-accent/15 hover:bg-emerald-accent/25 text-emerald-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-emerald-accent/25">
                        <ShieldOff size={13} /> Unban Account
                      </button>
                    ) : (
                      <button type="button" onClick={handleBan}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-red-500/25">
                        <Ban size={13} /> Lock / Ban Account
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'profile' && editing && (
              <div className="px-5 py-4 space-y-4">
                <SectionLabel>Personal details</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Display Name</label>
                    <input value={editForm.display_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Username</label>
                    <input value={editForm.username}
                      onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
                      className="input-field" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Country</label>
                    <input value={editForm.country}
                      onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                      className="input-field" />
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Payment</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Amount</label>
                      <input type="number" min="0" step="0.01" value={editForm.pay_amount}
                        onChange={(e) => setEditForm((f) => ({ ...f, pay_amount: e.target.value }))}
                        className="input-field" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Frequency</label>
                      <div className="relative">
                        <select value={editForm.pay_frequency}
                          onChange={(e) => setEditForm((f) => ({
                            ...f,
                            pay_frequency: e.target.value as WorkerAdminForm['pay_frequency'],
                          }))}
                          className="input-field appearance-none pr-8">
                          <option value="">Unset</option>
                          <option value="per_month">Per month</option>
                          <option value="per_task">Per task</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Pay Tier</label>
                      <div className="relative">
                        <select
                          value={editForm.pay_tier}
                          onChange={(e) => setEditForm((f) => ({ ...f, pay_tier: e.target.value }))}
                          className="input-field appearance-none pr-8"
                        >
                          <option value="unassigned">unassigned</option>
                          {(paymentTiers ?? []).map((t) => (
                            <option key={t.name} value={t.name}>{t.name}</option>
                          ))}
                          {editForm.pay_tier &&
                            editForm.pay_tier !== 'unassigned' &&
                            !(paymentTiers ?? []).some((t) => t.name === editForm.pay_tier) && (
                              <option value={editForm.pay_tier}>{editForm.pay_tier} (current)</option>
                            )}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Status</label>
                      <div className="relative">
                        <select value={editForm.status}
                          onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                          className="input-field appearance-none pr-8 capitalize">
                          {['active', 'inactive', 'suspended'].map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Start Date</label>
                      <input type="date" value={editForm.start_date}
                        onChange={(e) => setEditForm((f) => ({ ...f, start_date: e.target.value }))}
                        className="input-field" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Assigned RDP</SectionLabel>
                  <div className="relative">
                    <select value={editForm.assigned_rdp_id}
                      onChange={(e) => setEditForm((f) => ({ ...f, assigned_rdp_id: e.target.value }))}
                      className="input-field appearance-none pr-8">
                      <option value="">None</option>
                      {(rdpOptions ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nickname}
                          {m.assigned_worker_id && m.assigned_worker_id !== worker.id ? ' (assigned)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" checked={editForm.work_ready}
                      onChange={(e) => setEditForm((f) => ({ ...f, work_ready: e.target.checked }))}
                      className="accent-emerald-400" />
                    <span className="text-[13px] text-white">Cleared to work</span>
                    <WorkReadyBadge ready={editForm.work_ready} />
                  </label>
                </div>

                {editError && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                    <AlertCircle size={14} /> {editError}
                  </div>
                )}

                <div className="flex gap-2 justify-end border-t border-white/[0.06] pt-3">
                  <button type="button" onClick={() => { setEditing(false); setEditError(null); }}
                    className="btn-secondary text-xs py-2 px-3.5">Cancel</button>
                  <button type="button" onClick={handleSaveEdit} disabled={editSaving || !editForm.display_name.trim()}
                    className="btn-primary text-xs py-2 px-3.5 flex items-center gap-2 disabled:opacity-60">
                    {editSaving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={13} />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {tab === 'sessions' && (
              <div className="px-5 py-4">
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
      {showRate && (
        <RateWorkerModal
          workers={[{ id: worker.id, display_name: worker.display_name, country: worker.country }]}
          lockedWorkerId={worker.id}
          onClose={() => setShowRate(false)}
          onSaved={() => setShowRate(false)}
        />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [workersError, setWorkersError] = useState<string | null>(null);
  const [workerSearch, setWorkerSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  async function loadWorkers() {
    setWorkersLoading(true);
    setWorkersError(null);
    try {
      setWorkers(await api.get<Worker[]>('/workers'));
    } catch (e: unknown) {
      setWorkersError(e instanceof Error ? e.message : 'Failed to load workers.');
    } finally {
      setWorkersLoading(false);
    }
  }

  useEffect(() => { loadWorkers(); }, []);

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
        title="Workers"
        description="View and manage worker profiles, employment details, and session history."
        actions={
          <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-accent/20 text-emerald-400 border border-emerald-accent/30">
            {workers.length} worker{workers.length !== 1 ? 's' : ''}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search name, country, pay tier…"
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-full sm:w-56"
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
            className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 capitalize w-full sm:w-auto">
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

      {selectedWorker && (
        <WorkerDetailModal
          worker={selectedWorker}
          onClose={() => setSelectedWorker(null)}
          onUpdated={handleWorkerUpdated}
        />
      )}
    </div>
  );
}
