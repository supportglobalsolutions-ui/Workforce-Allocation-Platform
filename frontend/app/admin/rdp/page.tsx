'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, X } from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import FilterBar from '@/components/platform/FilterBar';
import StatusBadge from '@/components/platform/StatusBadge';
import {
  createRdpResource,
  forceReleaseRdp,
  listRdpResources,
  lockRdp,
  maintenanceRdp,
  RdpResource,
  unlockRdp,
  updateRdpResource,
} from '@/lib/rdp';
import { api } from '@/lib/api';

interface ClientOption {
  id: string;
  name: string;
  platform: string;
}

interface MachineForm {
  nickname: string;
  country: string;
  client_group: string;
  client_id: string;
  monitor_host: string;
  monitor_port: string;
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

  const reload = () =>
    listRdpResources()
      .then(setMachines)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load machines');
      });

  useEffect(() => {
    reload().finally(() => setLoading(false));
    api.get<ClientOption[]>('/clients').then(setClients).catch(() => setClients([]));
  }, []);

  const clientName = (id: string | null) =>
    id ? clients.find((c) => c.id === id)?.name ?? null : null;

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
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
      setError(err instanceof Error ? err.message : 'Failed to create machine');
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
      setError(err instanceof Error ? err.message : 'Failed to update machine');
    } finally {
      setSavingEdit(false);
    }
  };

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
            <option key={c.id} value={c.id}>{c.name} — {c.platform}</option>
          ))}
        </select>
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
      <label className="block sm:col-span-2">
        <span className="text-xs text-brand-on-surface-variant mb-1 block">Guacamole connection ID</span>
        <input
          value={form.guacamole_connection_id}
          onChange={(e) => setForm((f) => ({ ...f, guacamole_connection_id: e.target.value }))}
          placeholder="From Guacamole after you register the connection"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
        />
      </label>
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
        description="Add machines, set monitor IPs, and control status — lock, maintenance, and force release."
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
                        {m.monitor_host ? ` · ${m.monitor_host}:${m.monitor_port ?? 3389}` : ' · no monitor IP'}
                        {m.health_notes ? ` · ${m.health_notes}` : ''}
                      </p>
                      <p className="text-xs text-brand-on-surface-variant mt-1">
                        Last health check: {formatHealthCheck(m.last_health_check_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(m)}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1"
                      >
                        <Pencil size={12} /> Edit
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
