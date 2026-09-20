'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Eye, EyeOff, Lock, Pencil, Plus, RefreshCw, Trash2, Wrench, X } from 'lucide-react';
import Link from 'next/link';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import AdminRdpSubnav from '@/components/rdp/AdminRdpSubnav';
import DeleteRdpModal from '@/components/rdp/DeleteRdpModal';
import EntityPickerModal from '@/components/admin/EntityPickerModal';
import {
  createRdpResource,
  forceReleaseRdp,
  getGuacamoleHealth,
  GuacamoleHealth,
  listQuarantinedRdp,
  listRdpResources,
  lockRdp,
  maintenanceRdp,
  provisionRdpConnection,
  QuarantinedLists,
  QuarantinedRdpRow,
  repairRdp,
  RdpResource,
  unlockRdp,
  updateRdpResource,
} from '@/lib/rdp';
import { api } from '@/lib/api';
import { reportError } from '@/lib/errors';

type StatusMode = 'online' | 'locked' | 'maintenance';

/** Per-card actions that need their own in-progress label. */
type CardAction = 'sync' | 'stop' | 'other';

interface ClientOption {
  id: string;
  name: string;
  platform: string;
  owner_name: string | null;
}

interface WorkerOption {
  id: string;
  display_name: string;
  username: string | null;
  status: string;
}

interface MachineForm {
  nickname: string;
  country: string;
  client_group: string;
  client_id: string;
  allowed_worker_ids: string[];
  monitor_host: string;
  monitor_port: string;
  rdp_username: string;
  rdp_password: string;
  rdp_domain: string;
  guacamole_connection_id: string;
}

const EMPTY_FORM: MachineForm = {
  nickname: '',
  country: '',
  client_group: '',
  client_id: '',
  allowed_worker_ids: [],
  monitor_host: '',
  monitor_port: '3389',
  rdp_username: '',
  rdp_password: '',
  rdp_domain: '',
  guacamole_connection_id: '',
};

function formFromMachine(m: RdpResource): MachineForm {
  return {
    nickname: m.nickname,
    country: m.country,
    client_group: m.client_group,
    client_id: m.client_id ?? '',
    allowed_worker_ids: m.allowed_worker_ids ?? [],
    monitor_host: m.monitor_host ?? '',
    monitor_port: String(m.monitor_port ?? 3389),
    rdp_username: m.rdp_username ?? '',
    rdp_password: '',
    rdp_domain: '',
    guacamole_connection_id: m.guacamole_connection_id ?? '',
  };
}

function bodyFromForm(form: MachineForm) {
  const monitorPort = form.monitor_port.trim() ? Number(form.monitor_port) : 3389;
  return {
    nickname: form.nickname.trim(),
    country: form.country.trim(),
    client_group: form.client_group.trim(),
    client_id: form.client_id || null,
    allowed_worker_ids: form.allowed_worker_ids,
    monitor_host: form.monitor_host.trim() || null,
    monitor_port: monitorPort,
    guacamole_connection_id: form.guacamole_connection_id.trim() || null,
    ...(form.rdp_username.trim() ? { rdp_username: form.rdp_username.trim() } : {}),
    ...(form.rdp_password ? { rdp_password: form.rdp_password } : {}),
    ...(form.rdp_domain.trim() ? { rdp_domain: form.rdp_domain.trim() } : {}),
    auto_provision: true,
  };
}

function statusMode(status: string): StatusMode {
  if (status === 'admin_locked') return 'locked';
  if (status === 'maintenance') return 'maintenance';
  return 'online';
}

function cardShellClass(mode: StatusMode): string {
  // Same deep green as the app sidebar (`--sidebar-bg`).
  const base = 'on-dark-surface bg-[var(--sidebar-bg)] text-white';
  if (mode === 'locked') {
    return `${base} border-white/15`;
  }
  if (mode === 'maintenance') {
    return `${base} border-amber-400/45`;
  }
  return `${base} border-emerald-accent/45`;
}

/** True only when a worker holds the machine live (or in disconnect grace). */
function hasLiveSession(m: RdpResource): boolean {
  return m.status === 'active' || m.status === 'idle';
}

export default function RdpManagementPage() {
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Which button on the busy card is working — the labels differ. */
  const [busyAction, setBusyAction] = useState<CardAction>('other');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<MachineForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<RdpResource | null>(null);
  const [editForm, setEditForm] = useState<MachineForm>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  /** Click-to-open pickers — closed until the admin opens them. */
  const [openPicker, setOpenPicker] = useState<null | 'create-client' | 'create-workers' | 'edit-client' | 'edit-workers'>(null);

  const [deleteMachine, setDeleteMachine] = useState<RdpResource | null>(null);

  const [health, setHealth] = useState<GuacamoleHealth | null>(null);
  const [holds, setHolds] = useState<QuarantinedLists>({ quarantined: [], held: [] });
  const [repairingId, setRepairingId] = useState<string | null>(null);

  const reloadHealth = () =>
    getGuacamoleHealth().then(setHealth).catch(() => setHealth(null));

  const reloadHolds = () =>
    listQuarantinedRdp()
      .then(setHolds)
      .catch(() => setHolds({ quarantined: [], held: [] }));

  const reload = async () => {
    try {
      const list = await listRdpResources();
      const rows = Array.isArray(list) ? list : [];
      setMachines(rows);
      setEditing((current) =>
        current ? rows.find((row) => row.id === current.id) ?? null : null,
      );
      await Promise.all([reloadHealth(), reloadHolds()]);
    } catch (e) {
      setError(reportError('Load RDP machines', e));
    }
  };

  useEffect(() => {
    reload().finally(() => setLoading(false));
    api
      .get<ClientOption[]>('/clients')
      .then((rows) => setClients(Array.isArray(rows) ? rows : []))
      .catch(() => setClients([]));
    api
      .get<WorkerOption[]>('/workers')
      .then((rows) => setWorkers(Array.isArray(rows) ? rows : []))
      .catch(() => setWorkers([]));
  }, []);

  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
    kind: CardAction = 'other',
  ) => {
    setBusyId(id);
    setBusyAction(kind);
    setError(null);
    setModalError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      const msg = reportError('RDP admin action', e, { machineId: id });
      setError(msg);
      setModalError(msg);
    } finally {
      setBusyId(null);
      setBusyAction('other');
    }
  };

  const applyStatus = async (machineId: string, mode: StatusMode) => {
    const current = machines.find((m) => m.id === machineId) ?? editing;
    if (current && statusMode(current.status) === mode) return;
    await runAction(machineId, async () => {
      // Use the long-lived lock / unlock / maintenance routes (not set-status),
      // so a backend that has not been restarted still accepts the switch.
      if (mode === 'online') {
        await unlockRdp(machineId);
      } else if (mode === 'locked') {
        await lockRdp(machineId);
      } else {
        await maintenanceRdp(machineId);
      }
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createRdpResource(bodyFromForm(createForm));
      setCreateForm(EMPTY_FORM);
      setShowCreate(false);
      await reload();
    } catch (err) {
      setError(reportError('Create RDP machine', err));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (m: RdpResource) => {
    setEditing(m);
    setEditForm(formFromMachine(m));
    setShowEditPassword(false);
    setModalError(null);
    setOpenPicker(null);
    setShowCreate(false);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(EMPTY_FORM);
    setShowEditPassword(false);
    setModalError(null);
    setOpenPicker(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    setModalError(null);
    try {
      await updateRdpResource(editing.id, bodyFromForm(editForm));
      cancelEdit();
      await reload();
    } catch (err) {
      const msg = reportError('Update RDP machine', err, { machineId: editing.id });
      setError(msg);
      setModalError(msg);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRepair = async (rdpId: string) => {
    setRepairingId(rdpId);
    setError(null);
    try {
      await repairRdp(rdpId);
      await reload();
    } catch (e) {
      setError(reportError('Repair RDP machine', e, { machineId: rdpId }));
      await reloadHolds();
    } finally {
      setRepairingId(null);
    }
  };

  const holdRows: { kind: 'quarantined' | 'held'; row: QuarantinedRdpRow }[] = [
    ...holds.quarantined.map((row) => ({ kind: 'quarantined' as const, row })),
    ...holds.held.map((row) => ({ kind: 'held' as const, row })),
  ];

  const formFields = (
    form: MachineForm,
    setForm: React.Dispatch<React.SetStateAction<MachineForm>>,
    opts?: { showPasswordToggle?: boolean; pickerScope?: 'create' | 'edit' },
  ) => {
    const scope = opts?.pickerScope ?? 'edit';
    const clientKey = `${scope}-client` as const;
    const workersKey = `${scope}-workers` as const;
    const clientOpen = openPicker === clientKey;
    const workersOpen = openPicker === workersKey;
    const selectedClient = clients.find((c) => c.id === form.client_id);
    const fieldClass =
      'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-accent/40';

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Nickname *
          </span>
          <input
            required
            value={form.nickname}
            onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            placeholder="RDP2 — must match Uptime Kuma Friendly Name"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Country *
          </span>
          <input
            required
            value={form.country}
            onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
            placeholder="Kenya"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Client group *
          </span>
          <input
            required
            value={form.client_group}
            onChange={(e) => setForm((f) => ({ ...f, client_group: e.target.value }))}
            placeholder="ClientA"
            className={fieldClass}
          />
        </label>

        <div className="block sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Client account
          </span>
          <button
            type="button"
            onClick={() => setOpenPicker(clientKey)}
            className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
          >
            <span className={selectedClient ? 'text-white truncate' : 'text-white/40'}>
              {selectedClient
                ? `${selectedClient.name} — ${selectedClient.platform}${
                    selectedClient.owner_name ? ` · ${selectedClient.owner_name}` : ''
                  }`
                : 'None'}
            </span>
            <ChevronDown size={16} className="shrink-0 text-theme-muted" />
          </button>
        </div>

        <div className="block sm:col-span-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Workers who can see this desktop
          </span>
          <button
            type="button"
            onClick={() => setOpenPicker(workersKey)}
            className={`${fieldClass} flex items-center justify-between gap-2 text-left`}
          >
            <span className={form.allowed_worker_ids.length ? 'text-white' : 'text-white/40'}>
              {form.allowed_worker_ids.length === 0
                ? 'Nobody — off the claim board'
                : `${form.allowed_worker_ids.length} worker${form.allowed_worker_ids.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronDown size={16} className="shrink-0 text-theme-muted" />
          </button>
          <p className="text-[11px] text-theme-muted mt-1.5">
            Only selected workers see this desktop on their claim board.
          </p>
        </div>

        <EntityPickerModal
          open={clientOpen}
          title="Select client account"
          description="The client this desktop works on."
          noneLabel="None"
          searchPlaceholder="Search clients…"
          emptyLabel="No clients yet."
          options={clients.map((c) => ({
            id: c.id,
            label: `${c.name} — ${c.platform}`,
            hint: c.owner_name ? `Owner ${c.owner_name}` : undefined,
          }))}
          value={form.client_id}
          onSave={(id) => setForm((f) => ({ ...f, client_id: id }))}
          onClose={() => setOpenPicker(null)}
        />

        <EntityPickerModal
          multiple
          open={workersOpen}
          title="Workers who can see this desktop"
          description="Only these workers see it on their claim board."
          searchPlaceholder="Search workers by name or username…"
          emptyLabel="No workers found."
          options={workers.map((w) => ({
            id: w.id,
            label: w.display_name,
            hint: w.username ? `@${w.username}` : undefined,
          }))}
          value={form.allowed_worker_ids}
          onSave={(ids) => setForm((f) => ({ ...f, allowed_worker_ids: ids }))}
          onClose={() => setOpenPicker(null)}
        />

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Monitor host (IP) *
          </span>
          <input
            required
            value={form.monitor_host}
            onChange={(e) => setForm((f) => ({ ...f, monitor_host: e.target.value }))}
            placeholder="192.168.1.100"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            TCP port
          </span>
          <input
            type="number"
            value={form.monitor_port}
            onChange={(e) => setForm((f) => ({ ...f, monitor_port: e.target.value }))}
            placeholder="3389"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            RDP username
          </span>
          <input
            autoComplete="off"
            value={form.rdp_username}
            onChange={(e) => setForm((f) => ({ ...f, rdp_username: e.target.value }))}
            placeholder="Administrator"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            RDP password
          </span>
          <div className="relative">
            <input
              type={opts?.showPasswordToggle && showEditPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={form.rdp_password}
              onChange={(e) => setForm((f) => ({ ...f, rdp_password: e.target.value }))}
              placeholder="Leave blank to keep the current one"
              className={`${fieldClass} pr-10`}
            />
            {opts?.showPasswordToggle && (
              <button
                type="button"
                onClick={() => setShowEditPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-white"
                aria-label={showEditPassword ? 'Hide password' : 'Show password'}
              >
                {showEditPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
          </div>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Domain (optional)
          </span>
          <input
            value={form.rdp_domain}
            onChange={(e) => setForm((f) => ({ ...f, rdp_domain: e.target.value }))}
            placeholder="WORKGROUP"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-1.5 block">
            Guacamole connection ID
          </span>
          <input
            value={form.guacamole_connection_id}
            onChange={(e) => setForm((f) => ({ ...f, guacamole_connection_id: e.target.value }))}
            placeholder="Auto on save"
            className={fieldClass}
          />
        </label>
      </div>
    );
  };

  return (
    <div>
      <AdminRdpSubnav />
      <PageHeader
        title="RDP Resource Management"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/rdp/claim" className="btn-secondary text-sm py-2 px-4">
              Claim board
            </Link>
            <button
              type="button"
              onClick={() => {
                setShowCreate((v) => !v);
                cancelEdit();
              }}
              className="btn-primary flex items-center gap-2 text-sm py-2 px-4"
            >
              {showCreate ? <X size={16} /> : <Plus size={16} />}
              {showCreate ? 'Cancel' : 'Add Machine'}
            </button>
          </div>
        }
      />
      <FilterBar
        searchPlaceholder="Search machines..."
        filters={[
          { label: 'Status', options: ['Online', 'Maintenance', 'Locked'] },
          { label: 'Country', options: ['Kenya', 'Nigeria', 'Uganda', 'Ghana'] },
        ]}
      />
      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      {health && (
        <div
          className={`glass-panel p-3 mb-4 text-xs flex flex-wrap items-center gap-x-4 gap-y-1 ${
            health.authenticated ? 'text-brand-on-surface-variant' : 'text-danger'
          }`}
        >
          <span>
            Guacamole:{' '}
            <strong className={health.authenticated ? 'text-success' : 'text-danger'}>
              {health.authenticated ? 'connected' : 'unreachable'}
            </strong>{' '}
            ({health.guacamole_url})
          </span>
          <span>{health.connection_count} connection(s) registered</span>
          <span>
            {health.machines.filter((m) => m.ready).length}/{health.machines.length} machines ready
          </span>
          {health.error && <span className="text-danger">{health.error}</span>}
        </div>
      )}

      {holdRows.length > 0 && (
        <div className="glass-panel p-4 mb-4 space-y-3 border border-amber-500/30">
          <div>
            <h2 className="text-sm font-bold text-white">Held / quarantined</h2>
            <p className="text-xs text-brand-on-surface-variant mt-1">
              Closure could not be confirmed. Repair retries the disconnect on the machine&apos;s
              gateway — it will not free the seat unless the tunnel is gone.
            </p>
          </div>
          <div className="space-y-2">
            {holdRows.map(({ kind, row }) => {
              const when = row.quarantined_at || row.held_at;
              return (
                <div
                  key={`${kind}-${row.allocation_id}-${row.rdp_resource_id}`}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-bold text-white text-sm">
                        {row.nickname || row.rdp_resource_id.slice(0, 8)}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          kind === 'quarantined'
                            ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                            : 'border-white/20 text-brand-on-surface-variant bg-white/5'
                        }`}
                      >
                        {kind === 'quarantined' ? 'Quarantined' : 'Held'}
                      </span>
                    </div>
                    <p className="text-xs text-brand-on-surface-variant break-words">
                      {row.reason || 'No reason recorded'}
                    </p>
                    {when && (
                      <p className="text-[11px] text-theme-muted mt-1">
                        Since {new Date(when).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={repairingId === row.rdp_resource_id}
                    onClick={() => handleRepair(row.rdp_resource_id)}
                    className="btn-primary text-xs py-2 px-3 shrink-0 disabled:opacity-60"
                  >
                    {repairingId === row.rdp_resource_id ? 'Repairing…' : 'Repair'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-panel p-5 mb-6 space-y-4">
          <h2 className="text-sm font-bold text-white">New RDP machine</h2>
          {formFields(createForm, setCreateForm, { pickerScope: 'create' })}
          <button type="submit" disabled={creating} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
            {creating ? 'Creating…' : 'Create machine'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl border border-white/10 bg-white/[0.03] h-14 animate-pulse" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
          No RDP machines yet. Click <strong className="text-white">Add Machine</strong> above — no SQL required.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {machines.map((m) => {
            const mode = statusMode(m.status);
            const live = hasLiveSession(m);
            const title =
              mode === 'locked' ? 'Locked' : mode === 'maintenance' ? 'Maintenance' : 'Online';
            return (
              <div
                key={m.id}
                title={title}
                className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${cardShellClass(mode)}`}
              >
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {mode === 'locked' && (
                      <Lock size={15} className="shrink-0 text-white/70" aria-hidden />
                    )}
                    {mode === 'maintenance' && (
                      <Wrench size={15} className="shrink-0 text-amber-300" aria-hidden />
                    )}
                    {mode === 'online' && !live && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-accent" aria-hidden />
                    )}
                    {live && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-red-400 animate-pulse"
                        aria-hidden
                        title="Live session"
                      />
                    )}
                    <p className="font-semibold text-sm truncate text-white">{m.nickname}</p>
                  </div>
                  {live && (
                    <p className="text-[11px] text-red-300/90 truncate pl-4">
                      Live · {m.assigned_worker_name || 'In use'}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/80 hover:bg-emerald-accent/15 hover:text-emerald-accent hover:border-emerald-accent/30"
                  aria-label={`Edit ${m.nickname}`}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  disabled={busyId === m.id || !m.monitor_host}
                  onClick={() => runAction(m.id, () => provisionRdpConnection(m.id), 'sync')}
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white/80 hover:bg-emerald-accent/15 hover:text-emerald-accent hover:border-emerald-accent/30 disabled:opacity-35 disabled:cursor-not-allowed"
                  aria-label={`Sync Guacamole connection for ${m.nickname}`}
                  title={
                    m.monitor_host
                      ? 'Push host, RDP login, quality defaults, and audio-on into Guacamole. Use after create/edit, Guacamole rebuild, or if sound/connect is wrong — not every claim. Reopen the desktop after Sync.'
                      : 'Set the machine’s host/IP first'
                  }
                >
                  <RefreshCw
                    size={14}
                    className={busyId === m.id && busyAction === 'sync' ? 'animate-spin' : undefined}
                  />
                </button>
                <button
                  type="button"
                  disabled={busyId === m.id || !live}
                  onClick={() => runAction(m.id, () => forceReleaseRdp(m.id), 'stop')}
                  className="shrink-0 text-xs py-1.5 px-2.5 rounded-lg font-semibold border border-red-400/35 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-35 disabled:grayscale disabled:cursor-not-allowed disabled:hover:bg-red-500/10"
                  title={
                    live
                      ? `Kick ${m.assigned_worker_name || 'current session'} and free the machine`
                      : 'Force stop is only available when someone is connected (or in reconnect grace)'
                  }
                >
                  {busyId === m.id && busyAction === 'stop' ? 'Stopping…' : 'Force stop'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              onClick={cancelEdit}
              disabled={savingEdit}
            />
            <form
              onSubmit={handleSaveEdit}
              className="glass-modal relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-theme shadow-2xl"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.06] bg-[var(--glass-bg)] backdrop-blur px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-theme-heading">Edit {editing.nickname}</h2>
                  <p className="text-xs text-theme-muted mt-0.5">
                    Status, access, connection, and credentials
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingEdit}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme-muted hover:bg-white/5 hover:text-white disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </header>

              <div className="px-5 py-5 space-y-5">
                {modalError && <p className="text-danger text-xs">{modalError}</p>}

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-theme-muted mb-2">
                    Status
                  </p>
                  <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 gap-1">
                    {(
                      [
                        { id: 'online' as const, label: 'Online', icon: null },
                        { id: 'locked' as const, label: 'Locked', icon: <Lock size={12} /> },
                        { id: 'maintenance' as const, label: 'Maintenance', icon: <Wrench size={12} /> },
                      ]
                    ).map((opt) => {
                      const active = statusMode(editing.status) === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={busyId === editing.id}
                          onClick={() => void applyStatus(editing.id, opt.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 ${
                            active
                              ? opt.id === 'online'
                                ? 'bg-emerald-accent/25 text-emerald-accent'
                                : opt.id === 'locked'
                                  ? 'bg-white/10 text-white'
                                  : 'bg-amber-500/25 text-amber-300'
                              : 'text-theme-muted hover:text-white'
                          }`}
                        >
                          {opt.icon}
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {formFields(editForm, setEditForm, { showPasswordToggle: true, pickerScope: 'edit' })}
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-[var(--glass-bg)] backdrop-blur px-5 py-4">
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary text-sm py-2 px-4 disabled:opacity-60"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  disabled={busyId === editing.id || !editForm.monitor_host.trim()}
                  onClick={() => runAction(editing.id, () => provisionRdpConnection(editing.id))}
                  className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5 disabled:opacity-50"
                  title="Push this machine’s host, RDP login, quality defaults, and audio-on into Guacamole. Needed after create/edit or a Guacamole rebuild — not every worker claim. Reopen the desktop afterward."
                >
                  <RefreshCw size={14} /> Sync
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteMachine(editing)}
                  className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5 border-danger/30 text-danger"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={savingEdit}
                  className="btn-secondary text-sm py-2 px-4 ml-auto"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {deleteMachine && (
        <DeleteRdpModal
          machine={deleteMachine}
          onClose={() => setDeleteMachine(null)}
          onDeleted={async () => {
            const deletedId = deleteMachine.id;
            setDeleteMachine(null);
            if (editing?.id === deletedId) cancelEdit();
            await reload();
          }}
        />
      )}
    </div>
  );
}
