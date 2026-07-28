'use client';

import { useEffect, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle, ChevronDown, Settings2, ShieldOff, X,
} from 'lucide-react';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import {
  AccountStatus,
  apiBanWorker,
  apiGetAccountStatus,
  apiUnbanWorker,
} from '@/lib/auth/firebase-auth';
import { ensurePartnerEntity, PartnerEntity } from '@/lib/partners';

export interface AdminWorker {
  id: string;
  display_name: string;
  username: string | null;
  country: string;
  worker_type: string;
  partner_entity_id: string | null;
  partner_entity_name: string | null;
  partner_entity_is_self?: boolean | null;
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

interface RDPResource {
  id: string;
  nickname: string;
  status: string;
  assigned_worker_id: string | null;
}

interface EditForm {
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
  companyMode: 'self' | 'company';
  partner_entity_id: string;
}

const WORKER_TYPE_LABELS: Record<string, string> = {
  gs_registered: 'GS Member',
  partner_worker: 'Partner',
};

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

function formFromWorker(w: AdminWorker): EditForm {
  const isSelf = !!w.partner_entity_is_self || !w.partner_entity_id;
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
    companyMode: isSelf ? 'self' : 'company',
    partner_entity_id: w.partner_entity_id ?? '',
  };
}

function payLabel(w: AdminWorker) {
  if (w.pay_amount == null || w.pay_amount === '') return w.pay_tier || '—';
  const freq = w.pay_frequency === 'per_month' ? '/ month' : w.pay_frequency === 'per_task' ? '/ task' : '';
  return `${w.pay_amount} ${freq}`.trim() + (w.pay_tier ? ` · ${w.pay_tier}` : '');
}

export default function WorkerProfileModal({
  worker,
  showCompany = false,
  onClose,
  onUpdated,
}: {
  worker: AdminWorker;
  /** Partners: show company / Self affiliation. GS members: hide. */
  showCompany?: boolean;
  onClose: () => void;
  onUpdated: (w: AdminWorker) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(() => formFromWorker(worker));
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [machines, setMachines] = useState<RDPResource[] | null>(null);
  const [companies, setCompanies] = useState<PartnerEntity[] | null>(null);
  const [paymentTiers, setPaymentTiers] = useState<{ name: string }[] | null>(null);

  const [banStatus, setBanStatus] = useState<AccountStatus | 'not_found' | null>(null);
  const [banLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);

  useEffect(() => {
    if (!worker.admin_user_id || !worker.email) return;
    apiGetAccountStatus(worker.email)
      .then((r) => setBanStatus(r.status))
      .catch(() => setBanStatus(null));
  }, [worker.admin_user_id, worker.email]);

  useEffect(() => {
    if (!editing) return;
    if (machines === null) {
      api.get<RDPResource[]>('/rdp').then(setMachines).catch(() => setMachines([]));
    }
    if (showCompany && companies === null) {
      api.get<PartnerEntity[]>('/partners').then(setCompanies).catch(() => setCompanies([]));
    }
    if (paymentTiers === null) {
      api.get<{ name: string; is_active: boolean }[]>('/payment-tiers?active_only=true')
        .then((t) => setPaymentTiers(t.map((x) => ({ name: x.name }))))
        .catch(() => setPaymentTiers([]));
    }
  }, [editing, machines, companies, showCompany, paymentTiers]);

  async function handleSave() {
    setEditSaving(true);
    setEditError(null);
    try {
      let partnerEntityId: string | null = null;
      let workerType = worker.worker_type;

      if (showCompany) {
        workerType = 'partner_worker';
        if (editForm.companyMode === 'self') {
          partnerEntityId = await ensurePartnerEntity(editForm.display_name || worker.display_name);
        } else {
          if (!editForm.partner_entity_id) {
            setEditError('Select a company, or choose Self.');
            setEditSaving(false);
            return;
          }
          partnerEntityId = editForm.partner_entity_id;
        }
      }

      const body: Record<string, unknown> = {
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

      if (showCompany) {
        body.worker_type = workerType;
        body.partner_entity_id = partnerEntityId;
      }

      const resp = await api.patch<AdminWorker>(`/workers/${worker.id}`, body);
      onUpdated({ ...worker, ...body, ...resp } as AdminWorker);
      setEditing(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setEditSaving(false);
    }
  }

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

  const companyLabel = worker.partner_entity_is_self
    ? 'Self'
    : (worker.partner_entity_name || '—');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <h2 className="text-[15px] font-bold text-white truncate">{worker.display_name}</h2>
            <p className="text-xs text-theme-muted mt-0.5 truncate">
              {WORKER_TYPE_LABELS[worker.worker_type] ?? worker.worker_type}
              {showCompany && worker.partner_entity_name ? ` · ${worker.partner_entity_name}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!editing && (
              <button
                type="button"
                onClick={() => { setEditForm(formFromWorker(worker)); setEditError(null); setEditing(true); }}
                className="btn-secondary text-[11px] py-1.5 px-2.5 flex items-center gap-1.5"
              >
                <Settings2 size={11} /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-theme-muted hover:text-white hover:bg-white/5 transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {!editing ? (
            <div className="px-5 py-4 space-y-4">
              <div>
                <SectionLabel>Personal</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                  <DetailField label="Display Name" value={worker.display_name} />
                  <DetailField label="Username" value={worker.username || '—'} />
                  <DetailField label="Country" value={worker.country || '—'} />
                  <DetailField label="Email" value={worker.email || '—'} />
                  <DetailField
                    label="Status"
                    value={<StatusBadge status={worker.status === 'active' ? 'approved' : 'offline'} label={worker.status} />}
                  />
                  <DetailField
                    label="Work Ready"
                    value={worker.work_ready ? 'Cleared' : 'Training'}
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <SectionLabel>Payment</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                  <DetailField label="Pay" value={payLabel(worker)} />
                  <DetailField label="Pay Tier" value={worker.pay_tier || '—'} />
                  <DetailField
                    label="Frequency"
                    value={
                      worker.pay_frequency === 'per_month' ? 'Per month'
                        : worker.pay_frequency === 'per_task' ? 'Per task'
                          : '—'
                    }
                  />
                  <DetailField
                    label="Start Date"
                    value={new Date(worker.start_date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  />
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <SectionLabel>Assignment</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3.5">
                  <DetailField label="Assigned RDP" value={worker.assigned_rdp_nickname || '—'} />
                  {showCompany && (
                    <DetailField label="Company" value={companyLabel} />
                  )}
                </div>
              </div>

              {worker.admin_user_id && banStatus !== null && banStatus !== 'not_found' && (
                <div className="border-t border-white/[0.06] pt-4">
                  <SectionLabel>Account Access</SectionLabel>
                  {banError && <p className="text-xs text-red-400 mb-2">{banError}</p>}
                  {banLoading ? (
                    <div className="flex justify-center py-2"><SpinningDots size="sm" className="text-emerald-accent" /></div>
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
          ) : (
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
                          pay_frequency: e.target.value as EditForm['pay_frequency'],
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
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4">
                <SectionLabel>Assignment</SectionLabel>
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Assigned RDP</label>
                    <div className="relative">
                      <select value={editForm.assigned_rdp_id}
                        onChange={(e) => setEditForm((f) => ({ ...f, assigned_rdp_id: e.target.value }))}
                        className="input-field appearance-none pr-8">
                        <option value="">None</option>
                        {(machines ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nickname}
                            {m.assigned_worker_id && m.assigned_worker_id !== worker.id ? ' (assigned)' : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                    </div>
                  </div>

                  {showCompany && (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-theme-muted mb-1 block">Company</label>
                        <div className="flex gap-4 mb-2">
                          {([
                            ['self', 'Self'],
                            ['company', 'Affiliated company'],
                          ] as const).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="radio"
                                name="company_mode"
                                checked={editForm.companyMode === value}
                                onChange={() => setEditForm((f) => ({ ...f, companyMode: value }))}
                                className="accent-emerald-400"
                              />
                              <span className="text-sm text-white">{label}</span>
                            </label>
                          ))}
                        </div>
                        {editForm.companyMode === 'company' && (
                          <div className="relative">
                            <select value={editForm.partner_entity_id}
                              onChange={(e) => setEditForm((f) => ({ ...f, partner_entity_id: e.target.value }))}
                              className="input-field appearance-none pr-8">
                              <option value="">Select company…</option>
                              {(companies ?? []).filter((c) => !c.is_self).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted pointer-events-none" />
                          </div>
                        )}
                        {editForm.companyMode === 'self' && (
                          <p className="text-[11px] text-theme-muted">
                            Independent partner — company record attached as Self.
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editForm.work_ready}
                      onChange={(e) => setEditForm((f) => ({ ...f, work_ready: e.target.checked }))}
                      className="accent-emerald-400"
                    />
                    <span className="text-sm text-white">Work ready (cleared for live work)</span>
                  </label>
                </div>
              </div>

              {editError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                  <AlertCircle size={14} /> {editError}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm py-2 px-4">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={editSaving || !editForm.display_name.trim()}
                  onClick={handleSave}
                  className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-60"
                >
                  {editSaving ? <SpinningDots size="sm" className="text-emerald-accent" /> : <CheckCircle size={14} />}
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
