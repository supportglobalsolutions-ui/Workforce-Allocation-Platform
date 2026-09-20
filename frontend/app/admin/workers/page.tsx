'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle, ChevronDown, Eye, Settings2, Star,
  Search, ShieldOff, Trash2, X,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import DataTable from '@/components/platform/DataTable';
import StatusBadge from '@/components/platform/StatusBadge';
import SessionDetailPanel from '@/components/rdp/SessionDetailPanel';
import RateWorkerModal from '@/components/quality/RateWorkerModal';
import BulkDeleteModal from '@/components/admin/BulkDeleteModal';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { enteredPayMinutes, rdpConnectedMinutes } from '@/lib/hours';
import { fetchAllSessions } from '@/lib/fetchSessions';
import {
  AccountStatus,
  apiBanWorker,
  apiGetAccountStatus,
  apiUnbanWorker,
} from '@/lib/auth/supabase-auth';
import {
  PHONE_DIAL_CODES,
  composeE164,
  dialCodeForCountryName,
  filterNationalNumber,
  formatPhoneE164,
  parseE164,
  validateE164Phone,
} from '@/lib/phone-country-codes';
import { RESIDENCE_MAX, filterResidence, validateResidence } from '@/lib/auth/signup-fields';
import {
  MM_NAME_MAX,
  MM_PROVIDER_MAX,
  filterMobileMoneyName,
  filterMobileMoneyProvider,
  validateMobileMoneyName,
  validateMobileMoneyProvider,
} from '@/lib/mobile-money-fields';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Worker {
  id: string;
  public_code?: string | null;
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
  phone?: string | null;
  residence?: string | null;
  mobile_money_name?: string | null;
  mobile_money_provider?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  account_banned?: boolean;
  account_protected?: boolean;
  account_status?: string | null;
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
  image_urls?: string[] | null;
  end_image_url: string | null;
  image_start_at?: string | null;
  image_end_at?: string | null;
  suspicious?: boolean;
}

interface RDPResource {
  id: string;
  nickname: string;
  status?: string;
  assigned_worker_id?: string | null;
  owner_name?: string | null;
  client_name?: string | null;
}

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
  if (minutes == null) return '—';
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
  phoneDial: string;
  phoneNational: string;
  residence: string;
  mobile_money_name: string;
  mobile_money_provider: string;
  pay_tier: string;
  pay_amount: string;
  pay_frequency: '' | 'per_month' | 'per_task';
  status: string;
  start_date: string;
  work_ready: boolean;
  assigned_rdp_id: string;
}

function adminFormFromWorker(w: Worker): WorkerAdminForm {
  const parsedPhone = parseE164(w.phone ?? '');
  return {
    display_name: w.display_name ?? '',
    username: w.username ?? '',
    country: w.country ?? '',
    phoneDial: parsedPhone?.dial || dialCodeForCountryName(w.country ?? ''),
    phoneNational: parsedPhone?.national ?? '',
    residence: w.residence ?? '',
    mobile_money_name: w.mobile_money_name ?? '',
    mobile_money_provider: w.mobile_money_provider ?? '',
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

function WorkerDetailModal({
  worker,
  onClose,
  onUpdated,
  onRequestDelete,
}: {
  worker: Worker;
  onClose: () => void;
  onUpdated: (w: Worker) => void;
  onRequestDelete: (w: Worker) => void;
}) {
  const [tab, setTab] = useState<WorkerModalTab>('profile');
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RDPResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [banStatus, setBanStatus] = useState<AccountStatus | 'not_found' | 'unknown' | null>(
    worker.account_banned ? 'banned' : null,
  );
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
      const phone = editForm.phoneNational.trim()
        ? composeE164(editForm.phoneDial, editForm.phoneNational)
        : '';
      const residence = editForm.residence.trim();
      const mmName = editForm.mobile_money_name.trim();
      const mmProvider = editForm.mobile_money_provider.trim();
      const fieldError = (phone && validateE164Phone(phone))
        || (residence && validateResidence(residence))
        || (mmName && validateMobileMoneyName(mmName, { required: false }))
        || (mmProvider && validateMobileMoneyProvider(mmProvider, { required: false }))
        || '';
      if (fieldError) { setEditError(fieldError); return; }
      const body = {
        display_name: editForm.display_name.trim(),
        username: editForm.username.trim() || null,
        country: editForm.country.trim() || 'Unassigned',
        // Left blank means "leave as is" — the API rejects an empty phone.
        ...(phone ? { phone } : {}),
        ...(residence ? { residence } : {}),
        mobile_money_name: mmName || null,
        mobile_money_provider: mmProvider || null,
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
      fetchAllSessions<WorkSession>({ workerId: worker.id, includeImages: true }),
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

  const sessionRows = sessions.map((s) => {
    const rdpMins = rdpConnectedMinutes(s);
    const workMins = enteredPayMinutes(s);
    return {
      id: s.id,
      date: new Date(s.start_time).toLocaleString(),
      start_time: s.start_time,
      end_time: s.end_time,
      machine: machineName(s.rdp_resource_id),
      duration: formatDuration(rdpMins),
      rdp_time: formatDuration(rdpMins),
      work_time: s.image_start_at && s.image_end_at ? formatDuration(workMins) : 'Not entered',
      rdp_minutes: rdpMins,
      type: TYPE_LABELS[s.session_type] ?? s.session_type,
      status: s.close_status ?? (s.end_time ? 'completed' : 'active'),
      start_image_url: s.start_image_url,
      image_urls: s.image_urls,
      end_image_url: s.end_image_url,
      image_start_at: s.image_start_at,
      image_end_at: s.image_end_at,
      duration_minutes: s.duration_minutes,
      suspicious: Boolean(s.suspicious),
    };
  });

  const selectedSession = selectedSessionId
    ? sessionRows.find((r) => r.id === selectedSessionId) ?? null
    : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-5xl max-h-[85vh] flex flex-col">
          <div className="flex items-start justify-between px-6 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
            <div className="min-w-0 flex-1 pr-3">
              <h2 className="text-[15px] font-bold text-white truncate">{worker.display_name}</h2>
              <p className="text-xs text-theme-muted mt-0.5 truncate">
                {worker.public_code ? (
                  <>
                    <span className="font-mono text-emerald-accent/90">{worker.public_code}</span>
                    {' · '}
                  </>
                ) : null}
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

          <div className="flex border-b border-white/[0.06] px-6 shrink-0">
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
              <div className="px-6 py-5 space-y-5">
                <div>
                  <SectionLabel>Identity</SectionLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
                    <DetailField
                      label="Worker ID"
                      value={
                        worker.public_code
                          ? <span className="font-mono tracking-wide">{worker.public_code}</span>
                          : <span className="text-theme-muted">— (staff)</span>
                      }
                    />
                    <DetailField label="Display Name" value={worker.display_name} />
                    <DetailField
                      label="Legal name"
                      value={
                        [worker.first_name, worker.last_name].filter(Boolean).join(' ')
                          || '—'
                      }
                    />
                    <DetailField label="Username" value={worker.username || '—'} />
                    <DetailField label="Email" value={worker.email || '—'} />
                    <DetailField
                      label="Phone"
                      value={
                        worker.phone
                          ? <span className="font-mono tracking-wide">{formatPhoneE164(worker.phone, worker.country)}</span>
                          : '—'
                      }
                    />
                    <DetailField label="Country" value={worker.country || '—'} />
                    <DetailField label="Place of residence" value={worker.residence || '—'} />
                    <DetailField label="Mobile money name" value={worker.mobile_money_name || '—'} />
                    <DetailField label="Provider" value={worker.mobile_money_provider || '—'} />
                    <DetailField label="Worker Type" value={<WorkerTypeBadge worker={worker} />} />
                    <DetailField label="Status" value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />} />
                    <DetailField label="Work Ready" value={<WorkReadyBadge ready={worker.work_ready} />} />
                    {(worker.account_banned || banStatus === 'banned') && (
                      <DetailField
                        label="Account"
                        value={
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                            Banned / locked
                          </span>
                        }
                      />
                    )}
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Payment & assignment</SectionLabel>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-4">
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
                    {worker.account_protected ? (
                      <p className="text-xs text-theme-muted leading-relaxed">
                        This is a protected account. It cannot be banned or deleted.
                      </p>
                    ) : (
                      <>
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
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                            {banStatus === 'banned' ? (
                              <button type="button" onClick={handleUnban}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-accent/15 hover:bg-emerald-accent/25 text-emerald-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-emerald-accent/25">
                                <ShieldOff size={13} /> Unban Account
                              </button>
                            ) : (
                              <button type="button" onClick={handleBan}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/15 text-red-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-red-500/25">
                                <Ban size={13} /> Lock / Ban Account
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onRequestDelete(worker)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-red-500/30"
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {worker.admin_user_id && (banStatus === null || banStatus === 'not_found') && !worker.account_protected && (
                  <div className="border-t border-white/[0.06] pt-4">
                    <SectionLabel>Account Access</SectionLabel>
                    <button
                      type="button"
                      onClick={() => onRequestDelete(worker)}
                      className="w-full max-w-xl flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-red-500/30"
                    >
                      <Trash2 size={13} /> Delete Worker
                    </button>
                  </div>
                )}
                {!worker.admin_user_id && !worker.account_protected && (
                  <div className="border-t border-white/[0.06] pt-4">
                    <SectionLabel>Danger zone</SectionLabel>
                    <button
                      type="button"
                      onClick={() => onRequestDelete(worker)}
                      className="w-full max-w-xl flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[11px] font-bold uppercase tracking-wider transition-colors border border-red-500/30"
                    >
                      <Trash2 size={13} /> Delete Worker
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === 'profile' && editing && (
              <div className="px-6 py-5 space-y-5">
                <SectionLabel>Personal details</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 lg:col-span-1">
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
                      onChange={(e) => {
                        const next = e.target.value;
                        setEditForm((f) => ({
                          ...f,
                          country: next,
                          // Only pre-fill the dial code while no number has been entered,
                          // so fixing a country never rewrites a known-good phone.
                          phoneDial: f.phoneNational.trim()
                            ? f.phoneDial
                            : dialCodeForCountryName(next) || f.phoneDial,
                        }));
                      }}
                      className="input-field" />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Phone</label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.phoneDial}
                        onChange={(e) => setEditForm((f) => ({ ...f, phoneDial: e.target.value }))}
                        className="input-field w-[11rem] shrink-0"
                        aria-label="Country calling code"
                      >
                        {PHONE_DIAL_CODES.map((c) => (
                          <option key={`${c.iso}-${c.dial}`} value={c.dial}>
                            {c.name} (+{c.dial})
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        inputMode="tel"
                        value={editForm.phoneNational}
                        onChange={(e) => setEditForm((f) => ({ ...f, phoneNational: filterNationalNumber(e.target.value) }))}
                        placeholder="712345678"
                        className="input-field flex-1" />
                    </div>
                    <p className="text-[11px] text-theme-muted mt-1">Include the country code. Example: +254712345678</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Place of residence</label>
                    <input value={editForm.residence}
                      maxLength={RESIDENCE_MAX}
                      onChange={(e) => setEditForm((f) => ({ ...f, residence: filterResidence(e.target.value) }))}
                      placeholder="City or town"
                      className="input-field" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Mobile money name</label>
                    <input
                      value={editForm.mobile_money_name}
                      maxLength={MM_NAME_MAX}
                      onChange={(e) => setEditForm((f) => ({ ...f, mobile_money_name: filterMobileMoneyName(e.target.value) }))}
                      placeholder="Name on the wallet"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Provider</label>
                    <input
                      value={editForm.mobile_money_provider}
                      maxLength={MM_PROVIDER_MAX}
                      onChange={(e) => setEditForm((f) => ({ ...f, mobile_money_provider: filterMobileMoneyProvider(e.target.value) }))}
                      placeholder="e.g. Mpesa, MTN"
                      className="input-field"
                      list="admin-mm-provider"
                    />
                    <datalist id="admin-mm-provider">
                      <option value="Mpesa" />
                      <option value="MTN" />
                      <option value="Airtel" />
                    </datalist>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Email</label>
                    <p className="text-[13px] font-medium text-white leading-snug break-words">{worker.email || '—'}</p>
                    <p className="text-[11px] text-theme-muted mt-1">Sign-in email — read only. Changing it is not supported here.</p>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Payment</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                          {m.client_name ? ` · ${m.client_name}` : ''}
                          {m.owner_name ? ` · owner ${m.owner_name}` : ''}
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
                        { key: 'rdp_time', header: 'RDP uptime' },
                        { key: 'work_time', header: 'Work hours' },
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
        onImagesChanged={(sessionId: string, paths: string[]) => {
          setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, image_urls: paths } : s));
        }}
        onSuspiciousChanged={(sessionId, suspicious) => {
          setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, suspicious } : s));
        }}
        allowUpload={false}
        allowEvidenceEdit={false}
        allowSuspiciousFlag
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
  const [accountFilter, setAccountFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState<string | null>(null);

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

  useEffect(() => {
    // One-shot nudge: notify workers whose phones lack a country code.
    api.post<{ notified: number }>('/workers/phone-format-nudge', {})
      .then((r) => {
        if (r.notified > 0) {
          setActionNote(`Sent phone-format update prompts to ${r.notified} worker${r.notified === 1 ? '' : 's'}.`);
        }
      })
      .catch(() => { /* non-blocking */ });
  }, []);

  const filteredWorkers = useMemo(() => {
    const q = workerSearch.trim().toLowerCase();
    return workers.filter((w) => {
      if (typeFilter && (WORKER_TYPE_LABELS[w.worker_type] ?? w.worker_type) !== typeFilter) return false;
      if (statusFilter && w.status !== statusFilter.toLowerCase()) return false;
      if (accountFilter === 'banned' && !w.account_banned) return false;
      if (accountFilter === 'active' && w.account_banned) return false;
      if (!q) return true;
      return (
        w.public_code?.toLowerCase().includes(q) ||
        w.display_name.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        w.pay_tier.toLowerCase().includes(q) ||
        (w.email || '').toLowerCase().includes(q) ||
        (w.phone || '').toLowerCase().includes(q) ||
        (w.residence || '').toLowerCase().includes(q) ||
        `${w.first_name || ''} ${w.last_name || ''}`.toLowerCase().includes(q)
      );
    });
  }, [workers, workerSearch, typeFilter, statusFilter, accountFilter]);

  const workerRows = filteredWorkers.map((w) => ({
    id: w.id,
    public_code: w.public_code || '—',
    name: w.display_name,
    email: w.email || '—',
    country: w.country,
    type: WORKER_TYPE_LABELS[w.worker_type] ?? w.worker_type,
    pay_tier: w.pay_tier,
    start_date: new Date(w.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    status: w.status,
    account_banned: Boolean(w.account_banned),
    _worker: w,
  }));

  const deletableVisible = filteredWorkers.filter((w) => !w.account_protected);
  const allVisibleSelected = deletableVisible.length > 0 && deletableVisible.every((w) => selectedIds.has(w.id));
  const deleteTargets = deleteIds.length
    ? workers.filter((w) => deleteIds.includes(w.id) && !w.account_protected)
    : workers.filter((w) => selectedIds.has(w.id) && !w.account_protected);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) deletableVisible.forEach((w) => next.delete(w.id));
      else deletableVisible.forEach((w) => next.add(w.id));
      return next;
    });
  }

  function handleWorkerUpdated(updated: Worker) {
    setWorkers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
    setSelectedWorker((prev) => (prev && prev.id === updated.id ? updated : prev));
  }

  function openBulkDelete() {
    const ids = Array.from(selectedIds).filter((id) => {
      const w = workers.find((row) => row.id === id);
      return w && !w.account_protected;
    });
    if (!ids.length) {
      setActionNote('Protected accounts cannot be deleted.');
      return;
    }
    setDeleteIds(ids);
    setDeleteOpen(true);
  }

  function openSingleDelete(w: Worker) {
    if (w.account_protected) {
      setActionNote('Protected accounts cannot be deleted.');
      return;
    }
    setDeleteIds([w.id]);
    setDeleteOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Workers"
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={openBulkDelete}
                className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 text-danger border-danger/30 hover:bg-danger/10"
              >
                <Trash2 size={13} /> Delete ({selectedIds.size})
              </button>
            )}
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-accent/20 text-emerald-400 border border-emerald-accent/30">
              {workers.length} worker{workers.length !== 1 ? 's' : ''}
            </span>
          </div>
        }
      />

      {actionNote && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-xl border border-emerald-accent/30 bg-emerald-accent/10 text-emerald-accent text-xs">
          <CheckCircle size={13} />
          <span className="flex-1">{actionNote}</span>
          <button type="button" onClick={() => setActionNote(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative w-full sm:w-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-on-surface-variant" />
          <input
            type="text"
            placeholder="Search name, email, phone, country…"
            value={workerSearch}
            onChange={(e) => setWorkerSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white placeholder:text-theme-muted/60 focus:outline-none focus:border-emerald-accent/40 transition-colors w-full sm:w-64"
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
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value as 'all' | 'active' | 'banned')}
          className="px-3 py-2 bg-brand-surface-container/60 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-accent/40 w-full sm:w-auto"
        >
          <option value="all">Account: All</option>
          <option value="active">Account: Active</option>
          <option value="banned">Account: Banned / deleted</option>
        </select>
        <span className="text-xs text-theme-muted ml-1">{filteredWorkers.length} worker{filteredWorkers.length !== 1 ? 's' : ''}</span>
        {selectedIds.size > 0 && (
          <span className="text-xs text-theme-muted">· {selectedIds.size} selected</span>
        )}
      </div>

      {!workersLoading && !workersError && filteredWorkers.length > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-theme-muted">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-emerald-400" />
            Select all visible ({filteredWorkers.length})
          </label>
          {selectedIds.size > 0 && (
            <button type="button" onClick={() => setSelectedIds(new Set())} className="underline hover:text-theme-heading">
              Clear
            </button>
          )}
        </div>
      )}

      {workersLoading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : workersError ? (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle size={16} /> {workersError}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'select',
              header: '',
              render: (r) => {
                const row = r as typeof workerRows[number];
                const protectedAccount = Boolean(row._worker.account_protected);
                return (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(String(r.id))}
                    disabled={protectedAccount}
                    onChange={() => toggleRow(String(r.id))}
                    aria-label={protectedAccount ? `${row.name} is protected` : `Select ${row.name}`}
                    title={protectedAccount ? 'Protected account — cannot delete' : undefined}
                    className="accent-emerald-400 disabled:opacity-40"
                  />
                );
              },
            },
            { key: 'public_code', header: 'Worker ID', render: (r) => (
              <span className={`font-mono text-xs tracking-wide ${(r.public_code as string) !== '—' ? 'text-emerald-accent' : 'text-theme-muted'}`}>
                {r.public_code as string}
              </span>
            ) },
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            { key: 'country', header: 'Country' },
            {
              key: 'type', header: 'Type',
              render: (r) => <WorkerTypeBadge worker={(r as typeof workerRows[number])._worker} />,
            },
            { key: 'pay_tier', header: 'Pay Tier' },
            {
              key: 'status', header: 'Status',
              render: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <StatusBadge status={r.status === 'active' ? 'approved' : 'offline'} label={r.status as string} />
                  {Boolean(r.account_banned) && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                      Banned
                    </span>
                  )}
                </span>
              ),
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
          onRequestDelete={openSingleDelete}
        />
      )}

      {deleteOpen && deleteTargets.length > 0 && (
        <BulkDeleteModal
          kind="workers"
          ids={deleteTargets.map((w) => w.id)}
          labels={deleteTargets.map((w) => w.display_name)}
          onClose={() => { setDeleteOpen(false); setDeleteIds([]); }}
          onDeleted={(result) => {
            setDeleteOpen(false);
            setDeleteIds([]);
            setSelectedIds(new Set());
            setSelectedWorker(null);
            setActionNote(`Deleted ${result.deleted_count} worker${result.deleted_count === 1 ? '' : 's'}.`);
            void loadWorkers();
          }}
        />
      )}
    </div>
  );
}
