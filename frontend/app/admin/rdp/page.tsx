'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, X, RefreshCw } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
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

interface ClientOption {
  id: string;
  name: string;
  platform: string;
  owner_name: string | null;
}

interface MachineForm {
  nickname: string;
  country: string;
  client_group: string;
  client_id: string;
  monitor_host: string;
  monitor_port: string;
  rdp_username: string;
  rdp_password: string;
  rdp_domain: string;
  guacamole_connection_id: string;
  health_notes: string;
}

const EMPTY_FORM: MachineForm = {
  nickname: '',
  country: '',
  client_group: '',
  client_id: '',
  monitor_host: '',
  monitor_port: '3389',
  rdp_username: '',
  rdp_password: '',
  rdp_domain: '',
  guacamole_connection_id: '',
  health_notes: '',
};

function formFromMachine(m: RdpResource): MachineForm {
  return {
    nickname: m.nickname,
    country: m.country,
    client_group: m.client_group,
    client_id: m.client_id ?? '',
    monitor_host: m.monitor_host ?? '',
    monitor_port: String(m.monitor_port ?? 3389),
    // Credentials live in Guacamole, not here — blank means "leave unchanged".
    rdp_username: '',
    rdp_password: '',
    rdp_domain: '',
    guacamole_connection_id: m.guacamole_connection_id ?? '',
    health_notes: m.health_notes ?? '',
  };
}

function bodyFromForm(form: MachineForm) {
  const monitorPort = form.monitor_port.trim() ? Number(form.monitor_port) : 3389;
  return {
    nickname: form.nickname.trim(),
    country: form.country.trim(),
    client_group: form.client_group.trim(),
    client_id: form.client_id || null,
    monitor_host: form.monitor_host.trim() || null,
    monitor_port: monitorPort,
    guacamole_connection_id: form.guacamole_connection_id.trim() || null,
    health_notes: form.health_notes.trim() || null,
    // Omit blank credentials so an edit never wipes what Guacamole already has.
    ...(form.rdp_username.trim() ? { rdp_username: form.rdp_username.trim() } : {}),
    ...(form.rdp_password ? { rdp_password: form.rdp_password } : {}),
    ...(form.rdp_domain.trim() ? { rdp_domain: form.rdp_domain.trim() } : {}),
    auto_provision: true,
  };
}

function formatHealthCheck(at: string | null) {
  if (!at) return 'Never';
  return new Date(at).toLocaleString();
}

export default function RdpManagementPage() {
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forceReason, setForceReason] = useState<Record<string, string>>({});

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<MachineForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MachineForm>(EMPTY_FORM);
  const [savingEdit, setSavingEdit] = useState(false);

  const [health, setHealth] = useState<GuacamoleHealth | null>(null);
  const [holds, setHolds] = useState<QuarantinedLists>({ quarantined: [], held: [] });
  const [repairingId, setRepairingId] = useState<string | null>(null);

  const reloadHealth = () =>
    getGuacamoleHealth().then(setHealth).catch(() => setHealth(null));

  const reloadHolds = () =>
    listQuarantinedRdp()
      .then(setHolds)
      .catch(() => setHolds({ quarantined: [], held: [] }));

  const reload = () =>
    listRdpResources()
      .then(setMachines)
      .then(() => Promise.all([reloadHealth(), reloadHolds()]))
      .catch((e) => {
        setError(reportError('Load RDP machines', e));
      });

  useEffect(() => {
    reload().finally(() => setLoading(false));
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, []);

  const connectionState = (id: string) =>
    health?.machines.find((m) => m.id === id)?.connection_state ?? 'unknown';

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.name ?? null : null;

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(reportError('RDP admin action', e, { machineId: id }));
    } finally {
      setBusyId(null);
    }
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
    setEditingId(m.id);
    setEditForm(formFromMachine(m));
    setShowCreate(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    setError(null);
    try {
      await updateRdpResource(editingId, bodyFromForm(editForm));
      cancelEdit();
      await reload();
    } catch (err) {
      setError(reportError('Update RDP machine', err, { machineId: editingId }));
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
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block sm:col-span-2">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Nickname *</span>
        <input
          required
          value={form.nickname}
          onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
          placeholder="RDP2 — must match Uptime Kuma Friendly Name"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Country *</span>
        <input
          required
          value={form.country}
          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
          placeholder="Kenya"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Client group *</span>
        <input
          required
          value={form.client_group}
          onChange={(e) => setForm((f) => ({ ...f, client_group: e.target.value }))}
          placeholder="ClientA"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block sm:col-span-2">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Client account</span>
        <select
          value={form.client_id}
          onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        >
          <option value="">None</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {c.platform}{c.owner_name ? ` · owner ${c.owner_name}` : ''}
            </option>
          ))}
        </select>
        {form.client_id && (
          <span className="mt-1 block text-[11px] text-theme-muted">
            Owner: {clients.find((c) => c.id === form.client_id)?.owner_name ?? '—'}
          </span>
        )}
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Monitor host (IP) *</span>
        <input
          required
          value={form.monitor_host}
          onChange={(e) => setForm((f) => ({ ...f, monitor_host: e.target.value }))}
          placeholder="192.168.1.100"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Monitor port</span>
        <input
          type="number"
          value={form.monitor_port}
          onChange={(e) => setForm((f) => ({ ...f, monitor_port: e.target.value }))}
          placeholder="3389"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">RDP username</span>
        <input
          autoComplete="off"
          value={form.rdp_username}
          onChange={(e) => setForm((f) => ({ ...f, rdp_username: e.target.value }))}
          placeholder="Administrator"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">RDP password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={form.rdp_password}
          onChange={(e) => setForm((f) => ({ ...f, rdp_password: e.target.value }))}
          placeholder="Leave blank to keep the current one"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Domain (optional)</span>
        <input
          value={form.rdp_domain}
          onChange={(e) => setForm((f) => ({ ...f, rdp_domain: e.target.value }))}
          placeholder="WORKGROUP"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="block">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">
          Guacamole connection ID (auto)
        </span>
        <input
          value={form.guacamole_connection_id}
          onChange={(e) => setForm((f) => ({ ...f, guacamole_connection_id: e.target.value }))}
          placeholder="Created automatically on save"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <p className="sm:col-span-2 text-xs text-brand-on-surface-variant">
        The Guacamole connection is created and kept in sync automatically from the host, port and
        credentials above — you never need to open the Guacamole console. Credentials are stored in
        Guacamole only, never in this platform&apos;s database. Fill the ID field only to adopt a
        connection you built by hand.
      </p>
      <label className="block sm:col-span-2">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Health notes</span>
        <input
          value={form.health_notes}
          onChange={(e) => setForm((f) => ({ ...f, health_notes: e.target.value }))}
          placeholder="Optional notes"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
      <p className="sm:col-span-2 text-xs text-brand-on-surface-variant">
        After saving, add a matching <strong className="text-white">TCP Port</strong> monitor in Uptime Kuma
        (Friendly Name = nickname, same IP, port 3389). The shared webhook handles all machines.
      </p>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="RDP Resource Management"
        actions={
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
        }
      />
      <FilterBar
        searchPlaceholder="Search machines..."
        filters={[
          { label: 'Status', options: ['Online Free', 'Active', 'Maintenance', 'Locked'] },
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
          {formFields(createForm, setCreateForm)}
          <button type="submit" disabled={creating} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
            {creating ? 'Creating…' : 'Create machine'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="glass-panel p-4 h-20 animate-pulse" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <div className="glass-panel p-8 text-center text-brand-on-surface-variant text-sm">
          No RDP machines yet. Click <strong className="text-white">Add Machine</strong> above — no SQL required.
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map((m) => (
            <div key={m.id} className="glass-panel p-4 flex flex-col gap-4">
              {editingId === m.id ? (
                <form onSubmit={handleSaveEdit} className="space-y-4">
                  <h2 className="text-sm font-bold text-white">Edit {m.nickname}</h2>
                  {formFields(editForm, setEditForm)}
                  <div className="flex gap-2">
                    <button type="submit" disabled={savingEdit} className="btn-primary text-sm py-2 px-4 disabled:opacity-60">
                      {savingEdit ? 'Saving…' : 'Save changes'}
                    </button>
                    <button type="button" onClick={cancelEdit} className="btn-secondary text-sm py-2 px-4">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-mono text-xs text-brand-on-surface-variant">{m.id.slice(0, 8)}…</span>
                        <StatusBadge status={m.status} />
                      </div>
                      <p className="font-bold text-white">{m.nickname}</p>
                      <p className="text-xs text-brand-on-surface-variant">
                        {m.country} · {m.client_group}
                        {clientName(m.client_id) ? ` · ${clientName(m.client_id)}` : ''}
                        {m.owner_name ? ` · owner ${m.owner_name}` : ''}
                        {m.assigned_worker_name ? ` · worker ${m.assigned_worker_name}` : ''}
                        {m.monitor_host ? ` · ${m.monitor_host}:${m.monitor_port ?? 3389}` : ' · no monitor IP'}
                        {m.health_notes ? ` · ${m.health_notes}` : ''}
                      </p>
                      <p className="text-xs text-brand-on-surface-variant mt-1">
                        Last health check: {formatHealthCheck(m.last_health_check_at)}
                      </p>
                      {health && (
                        <p className="text-xs mt-1">
                          <span className="text-brand-on-surface-variant">Guacamole: </span>
                          {connectionState(m.id) === 'ok' ? (
                            <span className="text-success">
                              ready · connection {m.guacamole_connection_id}
                            </span>
                          ) : connectionState(m.id) === 'missing' ? (
                            <span className="text-danger">
                              not provisioned — workers cannot connect
                            </span>
                          ) : connectionState(m.id) === 'stale' ? (
                            <span className="text-danger">
                              connection {m.guacamole_connection_id} no longer exists in Guacamole
                            </span>
                          ) : (
                            <span className="text-brand-on-surface-variant">unknown</span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === m.id || !m.monitor_host}
                        title={
                          m.monitor_host
                            ? 'Create or repair this machine’s Guacamole connection'
                            : 'Add a host/IP first'
                        }
                        onClick={() => runAction(m.id, () => provisionRdpConnection(m.id))}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1 disabled:opacity-50"
                      >
                        <RefreshCw size={12} /> Sync Guacamole
                      </button>
                      {m.status === 'admin_locked' ? (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => runAction(m.id, () => unlockRdp(m.id))}
                          className="btn-secondary text-xs py-1.5"
                        >
                          Unlock
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => runAction(m.id, () => lockRdp(m.id))}
                          className="btn-secondary text-xs py-1.5"
                        >
                          Lock
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === m.id || m.status === 'maintenance'}
                        onClick={() => runAction(m.id, () => maintenanceRdp(m.id))}
                        className="btn-secondary text-xs py-1.5"
                      >
                        Maintenance
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      type="text"
                      placeholder="Force release reason (required)"
                      value={forceReason[m.id] ?? ''}
                      onChange={(e) => setForceReason((prev) => ({ ...prev, [m.id]: e.target.value }))}
                      className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-theme-muted"
                    />
                    <button
                      type="button"
                      disabled={busyId === m.id || !(forceReason[m.id] ?? '').trim()}
                      onClick={() =>
                        runAction(m.id, () => forceReleaseRdp(m.id, (forceReason[m.id] ?? '').trim()))
                      }
                      className="btn-secondary text-xs py-2 border-danger/30 text-danger shrink-0"
                    >
                      Force Release
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
