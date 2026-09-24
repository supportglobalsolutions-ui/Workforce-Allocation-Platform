'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
  Activity, Briefcase, Clock, DollarSign, Globe2, Monitor,
  Server, Star, Users,
} from 'lucide-react';

import AnalyticsViewToggle, { type AnalyticsView } from '@/components/platform/AnalyticsViewToggle';
import DataAlert from '@/components/platform/DataAlert';
import KpiCard from '@/components/platform/KpiCard';
import PageHeader from '@/components/platform/PageHeader';
import PeriodFilter from '@/components/platform/PeriodFilter';
import StatusBadge from '@/components/platform/StatusBadge';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { withTimeout } from '@/lib/with-timeout';
import { enteredPayMinutes, formatHoursLabel, rdpConnectedMinutes } from '@/lib/hours';
import { coversDate, pickCurrentPeriod, type PeriodLike } from '@/lib/periods';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Filler, Tooltip, Legend);

interface Worker {
  id: string;
  status: string;
  country?: string;
  partner_entity_id?: string | null;
  partner_entity_name?: string | null;
}
interface WorkSession {
  id: string;
  worker_id?: string;
  rdp_resource_id?: string | null;
  client_id?: string | null;
  end_time: string | null;
  start_time: string;
  image_start_at?: string | null;
  image_end_at?: string | null;
}
interface RdpResource {
  id: string;
  nickname: string;
  status: string;
  client_id?: string | null;
  owner_name?: string | null;
  owner_type?: string | null;
}
interface LeaderboardEntry {
  id: string;
  worker_display_name: string;
  composite_score: number;
  global_rank: number | null;
}
interface QualityScore { composite_score: number }
interface Partner { id: string; name: string }
interface Client {
  id: string;
  owner_type?: string;
  owner_worker_id?: string | null;
  owner_partner_entity_id?: string | null;
  owner_name?: string | null;
}
interface PayrollPeriod extends PeriodLike { label: string; currency?: string }
interface PayrollReportRow {
  final_net?: number | string;
  local_currency?: string | null;
  /** final_net converted to the period's base currency at the stored FX rate. */
  base_equivalent?: number | string | null;
}

const EMERALD = '#3FC7A0';
const GOLD = '#D4AF37';
const BLUE = '#60A5FA';
const TICK = 'rgba(148, 163, 184, 0.9)';
const GRID = 'rgba(148, 163, 184, 0.12)';

const barOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: { legend: { display: false } },
  scales: {
    x: { beginAtZero: true, grid: { color: GRID }, ticks: { color: TICK } },
    y: { grid: { display: false }, ticks: { color: TICK } },
  },
};

const doughnutOptions: ChartOptions<'doughnut'> = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, usePointStyle: true } },
  },
};

function settled<T>(r: PromiseSettledResult<T>, fallback: T): T {
  return r.status === 'fulfilled' ? r.value : fallback;
}

function formatYmd(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso.slice(0, 10);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ownerKey(client: Client | undefined, rdp: RdpResource | undefined): string | null {
  if (client) {
    if (client.owner_type === 'worker' && client.owner_worker_id) return `worker:${client.owner_worker_id}`;
    if (client.owner_type === 'partner_entity' && client.owner_partner_entity_id) {
      return `partner:${client.owner_partner_entity_id}`;
    }
    return 'gs';
  }
  if (rdp?.owner_type === 'worker' || rdp?.owner_type === 'partner_entity') {
    return rdp.owner_name ? `name:${rdp.owner_name}` : `type:${rdp.owner_type}:${rdp.id}`;
  }
  if (rdp?.owner_name) return rdp.owner_name === 'Global Solutions' ? 'gs' : `name:${rdp.owner_name}`;
  return null;
}

function Section({
  title,
  icon: Icon,
  children,
  accent = 'emerald',
}: {
  title: string;
  icon: typeof Globe2;
  children: ReactNode;
  accent?: 'emerald' | 'gold';
}) {
  const strip = accent === 'gold' ? 'bg-gold-accent' : 'bg-emerald-accent';
  return (
    <div className="rounded-2xl border border-theme bg-brand-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-theme bg-brand-surface-low">
        <span className={`w-1 h-4 rounded-full ${strip}`} />
        <Icon size={14} className={accent === 'gold' ? 'text-gold-accent' : 'text-emerald-accent'} />
        <h2 className="text-sm font-bold text-theme-heading">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-theme bg-brand-surface-low px-3 py-2.5 text-center">
      <p className="text-lg font-black text-theme-heading tabular-nums leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-wide text-theme-muted mt-1">{label}</p>
    </div>
  );
}

export default function CeoCommandCenterPage() {
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [machines, setMachines] = useState<RdpResource[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scores, setScores] = useState<QualityScore[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodsLoadFailed, setPeriodsLoadFailed] = useState(false);
  const [periodId, setPeriodId] = useState('');
  const [payoutTotal, setPayoutTotal] = useState<number | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [view, setView] = useState<AnalyticsView>('cards');

  useEffect(() => {
    let cancelled = false;
    const softFails: string[] = [];
    const noteFail = (label: string, reason: unknown) => {
      softFails.push(`${label}: ${reason instanceof Error ? reason.message : 'failed'}`);
    };

    (async () => {
      setLoading(true);
      setErrors([]);
      setPeriodsLoadFailed(false);

      // Wave 1 — periods + workers only. Firing sessions/RDP in parallel used to
      // starve the API worker so /payroll/periods timed out and the page looked
      // like there was no September month.
      const [workersResult, periodsResult] = await Promise.allSettled([
        withTimeout(
          (async () => {
            try {
              return await api.get<Worker[]>('/workers/roster');
            } catch {
              return api.get<Worker[]>('/workers?lite=true');
            }
          })(),
          45_000,
          'workers',
        ),
        withTimeout(api.get<PayrollPeriod[]>('/payroll/periods'), 45_000, 'payroll periods'),
      ]);
      if (cancelled) return;

      if (workersResult.status === 'fulfilled') {
        setWorkers(workersResult.value);
      } else {
        setWorkers([]);
        noteFail('workers', workersResult.reason);
      }

      let periodRows: PayrollPeriod[] = [];
      if (periodsResult.status === 'fulfilled') {
        periodRows = periodsResult.value;
        setPeriods(periodRows);
        setPeriodId(pickCurrentPeriod(periodRows)?.id ?? periodRows[0]?.id ?? '');
        setPeriodsLoadFailed(false);
      } else {
        setPeriods([]);
        setPeriodId('');
        setPeriodsLoadFailed(true);
        noteFail('payroll periods', periodsResult.reason);
      }

      setErrors([...softFails]);
      setLoading(false);

      // Wave 2 — heavy / secondary feeds. Soft-fail; do not blank the month scope.
      const secondary = await Promise.allSettled([
        withTimeout(
          api.get<WorkSession[]>('/sessions?limit=1000&include_images=false'),
          60_000,
          'sessions',
        ),
        withTimeout(api.get<RdpResource[]>('/rdp'), 60_000, 'RDP'),
        withTimeout(api.get<LeaderboardEntry[]>('/leaderboard?limit=5'), 45_000, 'leaderboard'),
        withTimeout(api.get<QualityScore[]>('/quality/scores'), 45_000, 'quality'),
        withTimeout(api.get<Partner[]>('/partners'), 45_000, 'partners'),
        withTimeout(api.get<Client[]>('/clients'), 45_000, 'clients'),
      ]);
      if (cancelled) return;

      const labels = ['sessions', 'RDP', 'leaderboard', 'quality', 'partners', 'clients'] as const;
      secondary.forEach((r, i) => {
        if (r.status === 'rejected') noteFail(labels[i], r.reason);
      });

      setSessions(settled(secondary[0], [] as WorkSession[]));
      setMachines(settled(secondary[1], [] as RdpResource[]));
      setLeaderboard(settled(secondary[2], [] as LeaderboardEntry[]));
      setScores(settled(secondary[3], [] as QualityScore[]));
      setPartners(settled(secondary[4], [] as Partner[]));
      setClients(settled(secondary[5], [] as Client[]));
      setErrors([...softFails]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (periods.length === 0) {
      setPayoutTotal(null);
      return;
    }
    let cancelled = false;
    setPayoutLoading(true);
    const scope = periodId ? periods.filter((period) => period.id === periodId) : periods;
    Promise.allSettled(
      scope.map((period) => api.get<PayrollReportRow[]>(`/payroll/periods/${period.id}/reports/payroll`)),
    )
      .then((results) => {
        if (cancelled) return;
        const reports = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
        if (results.every((result) => result.status === 'rejected')) {
          throw new Error('No payroll reports loaded.');
        }
        // Sum the base-currency equivalent, never final_net: that is in each
        // worker's OWN currency, so adding a Ugandan row to a Kenyan one and
        // labelling the result USD reported 150,000 UGX (~$40) as "USD 150K".
        // base_equivalent is the same amount at the period's stored FX rate;
        // a row that already is the base currency carries no rate, so it falls
        // back to its own net.
        setPayoutTotal(
          reports.reduce((sum, row) => {
            const base = row.base_equivalent;
            const value = base != null && base !== '' ? Number(base) : Number(row.final_net ?? 0);
            return sum + (Number.isFinite(value) ? value : 0);
          }, 0),
        );
        setErrors((prev) => prev.filter((e) => !e.startsWith('payroll report:')));
      })
      .catch((e) => {
        if (cancelled) return;
        setPayoutTotal(null);
        const msg = `payroll report: ${e instanceof Error ? e.message : 'failed'}`;
        setErrors((prev) => (prev.includes(msg) ? prev : [...prev, msg]));
      })
      .finally(() => { if (!cancelled) setPayoutLoading(false); });
    return () => { cancelled = true; };
  }, [periodId, periods]);

  const selectedPeriod = periods.find((p) => p.id === periodId) ?? null;
  const currentPeriod = pickCurrentPeriod(periods);
  const viewingAll = periodId === '';
  const orderedPeriods = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const scopeStart = viewingAll ? orderedPeriods[0]?.start_date : selectedPeriod?.start_date;
  const scopeEnd = viewingAll ? orderedPeriods[orderedPeriods.length - 1]?.end_date : selectedPeriod?.end_date;
  const scopeLabel = viewingAll ? 'All working months' : (selectedPeriod?.label ?? 'Working month');
  const scopeCurrencies = Array.from(new Set(
    (viewingAll ? periods : selectedPeriod ? [selectedPeriod] : []).map((period) => period.currency ?? 'USD'),
  ));
  const currency = scopeCurrencies.length === 1 ? scopeCurrencies[0] : 'Mixed';

  const periodSessions = useMemo(() => {
    if (viewingAll) return sessions;
    if (!selectedPeriod) return [];
    return sessions.filter((s) => coversDate(selectedPeriod, s.start_time.slice(0, 10)));
  }, [sessions, selectedPeriod, viewingAll]);

  const liveSessions = useMemo(
    () => sessions.filter((s) => !s.end_time).length,
    [sessions],
  );
  const workersLoaded = workers.length > 0 || !errors.some((e) => e.startsWith('workers:'));
  const rosterTotal = workers.length;
  const activeWorkers = useMemo(
    () => workers.filter((w) => w.status === 'active').length,
    [workers],
  );
  const qualityIndex = useMemo(() => {
    if (scores.length === 0) return null;
    const avg = scores.reduce((sum, s) => sum + Number(s.composite_score), 0) / scores.length;
    return `${avg.toFixed(1)}%`;
  }, [scores]);

  const periodHours = useMemo(() => {
    let rdp = 0;
    let work = 0;
    for (const s of periodSessions) {
      rdp += rdpConnectedMinutes(s) ?? 0;
      work += enteredPayMinutes(s);
    }
    return { rdp, work };
  }, [periodSessions]);

  const census = useMemo(() => {
    const workerIds = new Set<string>();
    const rdpIds = new Set<string>();
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const rdpById = new Map(machines.map((m) => [m.id, m]));
    const owners = new Set<string>();

    for (const s of periodSessions) {
      if (s.worker_id) workerIds.add(s.worker_id);
      if (s.rdp_resource_id) rdpIds.add(s.rdp_resource_id);
      const rdp = s.rdp_resource_id ? rdpById.get(s.rdp_resource_id) : undefined;
      const client = (s.client_id && clientById.get(s.client_id))
        || (rdp?.client_id ? clientById.get(rdp.client_id) : undefined);
      const key = ownerKey(client, rdp);
      if (key) owners.add(key);
    }

    const workerById = new Map(workers.map((w) => [w.id, w]));
    const partnerIds = new Set<string>();
    for (const id of workerIds) {
      const pid = workerById.get(id)?.partner_entity_id;
      if (pid) partnerIds.add(pid);
    }

    return {
      workers: workerIds.size,
      rdps: rdpIds.size,
      partners: partnerIds.size,
      owners: owners.size,
      sessions: periodSessions.length,
    };
  }, [periodSessions, workers, machines, clients]);

  const countryViz = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const w of workers) {
      const raw = (w.country || '').trim() || 'Unassigned';
      const key = raw.toLowerCase();
      const prev = map.get(key);
      if (prev) prev.count += 1;
      else map.set(key, { label: raw[0].toUpperCase() + raw.slice(1), count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [workers]);

  const machineSummary = useMemo(() => {
    const online = machines.filter((m) => ['online_free', 'assigned', 'active', 'idle'].includes(m.status)).length;
    const inUse = machines.filter((m) => m.status === 'active' || m.status === 'assigned').length;
    const free = machines.filter((m) => m.status === 'online_free').length;
    const offline = machines.length - online;
    return { online, inUse, free, offline, total: machines.length };
  }, [machines]);

  const payoutLabel = payoutLoading
    ? '…'
    : payoutTotal == null
      ? '—'
      : payoutTotal >= 1000
        ? `${currency} ${(payoutTotal / 1000).toFixed(1)}K`
        : `${currency} ${payoutTotal.toFixed(0)}`;

  const countryChart: ChartData<'bar'> = {
    labels: countryViz.map((r) => r.label),
    datasets: [{
      data: countryViz.map((r) => r.count),
      backgroundColor: EMERALD,
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const machineChart: ChartData<'doughnut'> = {
    labels: ['In use', 'Free', 'Offline'],
    datasets: [{
      data: [machineSummary.inUse, machineSummary.free, machineSummary.offline],
      backgroundColor: [GOLD, EMERALD, 'rgba(148, 163, 184, 0.35)'],
      borderWidth: 0,
    }],
  };

  const leaderboardChart: ChartData<'bar'> = {
    labels: leaderboard.map((w) => w.worker_display_name),
    datasets: [{
      data: leaderboard.map((w) => Number(w.composite_score)),
      backgroundColor: GOLD,
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <SpinningDots size="lg" className="text-emerald-accent" />
      </div>
    );
  }

  const periodChip = periods.length > 0 && scopeStart && scopeEnd ? (
    <span className="text-xs text-theme-muted">
      {formatYmd(scopeStart)} – {formatYmd(scopeEnd)}
      {' · '}
      {census.sessions} session{census.sessions === 1 ? '' : 's'}
      {selectedPeriod?.id === currentPeriod?.id ? (
        <span className="ml-1.5 text-[10px] font-bold uppercase text-gold-accent">Current</span>
      ) : null}
    </span>
  ) : null;

  return (
    <div>
      <PageHeader
        title="CEO Command Center"
        description={scopeLabel}
        besideTitle={periodChip}
        actions={
          periods.length > 0 ? (
            <>
              <PeriodFilter
                periods={periods}
                value={periodId}
                onChange={setPeriodId}
                allowAll
                allLabel="All working months"
                variant="inline"
                label="Working month"
              />
              <AnalyticsViewToggle value={view} onChange={setView} />
            </>
          ) : (
            <AnalyticsViewToggle value={view} onChange={setView} />
          )
        }
      />

      {errors.length > 0 && (
        <div className="mb-4">
          <DataAlert tone="warning">
            Some data sources failed: {errors.slice(0, 2).join(' · ')}
            {errors.length > 2 ? ` · +${errors.length - 2} more` : ''}.
          </DataAlert>
        </div>
      )}

      {periods.length === 0 && (
        <div className="mb-4">
          <DataAlert tone={periodsLoadFailed ? 'warning' : undefined}>
            {periodsLoadFailed
              ? 'Working months could not be loaded. Refresh the page — September should appear if it exists on Finance.'
              : 'No working months yet. Create one on Finance to scope hours and payouts.'}
          </DataAlert>
        </div>
      )}

      {(viewingAll || selectedPeriod?.id !== currentPeriod?.id) && currentPeriod && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => setPeriodId(currentPeriod.id)}
            className="text-xs font-bold text-emerald-accent hover:underline"
          >
            Jump to current month
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-theme bg-brand-surface-low/80 p-4 sm:p-6 space-y-6">
        {view === 'cards' ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard
                compact
                label="Active on roster"
                value={workersLoaded ? activeWorkers : '—'}
                icon={Users}
              />
              <KpiCard compact label="Live sessions" value={liveSessions} icon={Activity} accent="blue" />
              <KpiCard compact label="Quality" value={qualityIndex ?? '—'} icon={Star} accent="gold" />
              <KpiCard compact label="Work hours" value={formatHoursLabel(periodHours.work)} icon={Clock} />
              <KpiCard compact label="RDP time" value={formatHoursLabel(periodHours.rdp)} icon={Monitor} accent="blue" />
              <KpiCard compact label="Payouts" value={payoutLabel} icon={DollarSign} accent="gold" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
              <MiniStat label="On roster" value={workersLoaded ? rosterTotal : 0} />
              <MiniStat label="With sessions" value={census.workers} />
              <MiniStat label="RDPs used" value={census.rdps} />
              <MiniStat label="Partners" value={census.partners} />
              <MiniStat label="Owners" value={census.owners} />
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <Section title="Workforce by country" icon={Globe2}>
                {countryViz.length === 0 ? (
                  <DataAlert>
                    {workersLoaded
                      ? 'No country data on worker profiles yet.'
                      : 'Worker roster did not load — country breakdown unavailable.'}
                  </DataAlert>
                ) : (
                  <ul className="space-y-2">
                    {countryViz.map((row) => (
                      <li key={row.label} className="flex items-center justify-between text-sm gap-3 py-1.5 border-b border-theme last:border-0">
                        <span className="text-theme-heading truncate">{row.label}</span>
                        <span className="font-mono text-emerald-accent tabular-nums shrink-0">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Machines" icon={Server} accent="gold">
                <p className="text-xs text-theme-muted mb-3">
                  {machineSummary.inUse} in use · {machineSummary.online}/{machineSummary.total} online
                </p>
                {machines.length === 0 ? (
                  <DataAlert>No machines configured.</DataAlert>
                ) : (
                  <ul className="space-y-1.5">
                    {machines.slice(0, 6).map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-theme bg-brand-surface-low px-3 py-2"
                      >
                        <span className="text-sm text-theme-heading truncate">{m.nickname}</span>
                        <StatusBadge status={m.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Section title="Top workers" icon={Briefcase} accent="gold">
              {leaderboard.length === 0 ? (
                <DataAlert>No leaderboard scores yet.</DataAlert>
              ) : (
                <ul className="divide-y divide-theme">
                  {leaderboard.map((w, i) => {
                    const rank = w.global_rank ?? i + 1;
                    return (
                      <li key={w.id} className="flex items-center justify-between py-2.5 gap-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                            rank === 1
                              ? 'bg-gold-accent/15 text-gold-accent border border-gold-accent/30'
                              : 'bg-brand-surface-high text-theme-muted border border-theme'
                          }`}>
                            {rank}
                          </span>
                          <span className="text-sm text-theme-heading truncate">{w.worker_display_name}</span>
                        </div>
                        <span className="text-sm font-mono font-semibold text-emerald-accent tabular-nums">
                          {Number(w.composite_score).toFixed(1)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard
                compact
                label="Active on roster"
                value={workersLoaded ? activeWorkers : '—'}
                icon={Users}
              />
              <KpiCard compact label="Live sessions" value={liveSessions} icon={Activity} accent="blue" />
              <KpiCard compact label="Quality" value={qualityIndex ?? '—'} icon={Star} accent="gold" />
              <KpiCard compact label="Work hours" value={formatHoursLabel(periodHours.work)} icon={Clock} />
              <KpiCard compact label="RDP time" value={formatHoursLabel(periodHours.rdp)} icon={Monitor} accent="blue" />
              <KpiCard compact label="Payouts" value={payoutLabel} icon={DollarSign} accent="gold" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-emerald-accent/15 bg-brand-card p-4 h-[260px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-accent mb-2">By country</p>
                {countryViz.length === 0 ? (
                  <DataAlert>{workersLoaded ? 'No country data.' : 'Roster did not load.'}</DataAlert>
                ) : (
                  <Bar data={countryChart} options={barOptions} />
                )}
              </div>
              <div className="rounded-2xl border border-gold-accent/15 bg-brand-card p-4 h-[260px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold-accent mb-2">Machine status</p>
                {machines.length === 0 ? (
                  <DataAlert>No machines.</DataAlert>
                ) : (
                  <Doughnut data={machineChart} options={doughnutOptions} />
                )}
              </div>
              <div className="rounded-2xl border border-gold-accent/15 bg-brand-card p-4 h-[260px]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gold-accent mb-2">Top workers</p>
                {leaderboard.length === 0 ? (
                  <DataAlert>No scores yet.</DataAlert>
                ) : (
                  <Bar data={leaderboardChart} options={barOptions} />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
              <MiniStat label="On roster" value={workersLoaded ? rosterTotal : 0} />
              <MiniStat label="With sessions" value={census.workers} />
              <MiniStat label="RDPs used" value={census.rdps} />
              <MiniStat label="Partners" value={census.partners} />
              <MiniStat label="Owners" value={census.owners} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
