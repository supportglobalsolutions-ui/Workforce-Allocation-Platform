'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Archive, Download, FileBarChart, FileText, PieChart,
} from 'lucide-react';
import PageHeader from '@/components/platform/PageHeader';
import ShiftsReport from '@/components/reports/ShiftsReport';
import AdminSectionTabs, { PAYROLL_TABS } from '@/components/platform/AdminSectionTabs';
import PeriodFilter from '@/components/platform/PeriodFilter';
import SpinningDots from '@/components/shared/SpinningDots';
import { api } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { pickCurrentPeriod } from '@/lib/periods';
import { displayCurrencyFor, formatMoneyAmount, formatMoneyTotals, useMoneyDisplay } from '@/lib/money';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PayrollPeriod {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  currency: 'USD' | 'GBP';
  status: string;
}

interface PayrollReportRow {
  id: string;
  period_id?: string;
  period_label?: string;
  worker_display_name: string;
  worker_country: string;
  worker_type: string;
  hours_logged: string | number;
  gross_earned: string | number;
  total_deductions: string | number;
  final_net: string | number;
  local_currency: string;
  base_equivalent: string | number;
}

interface RevenueShareRow {
  client_id: string;
  period_id?: string;
  period_label?: string;
  client_name: string;
  platform: string;
  earnings: string;
  worker_cost: string;
  distributable: string;
  gs_pct: string;
  owner_pct: string;
  gs_share: string;
  owner_share: string;
  earnings_source?: 'entered' | 'calculated';
}

const fmt = formatMoneyAmount;

function sumByCurrency<T>(
  rows: T[],
  currency: (row: T) => string,
  value: (row: T) => string | number | null | undefined,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const cur = currency(r);
    totals.set(cur, (totals.get(cur) ?? 0) + Number(value(r) ?? 0));
  }
  return totals;
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl border text-xs mb-4 bg-danger/10 border-danger/30 text-danger">
      <AlertCircle size={14} className="shrink-0" /> {children}
    </div>
  );
}

function PanelHeader({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
      <h2 className="text-sm font-bold text-theme-heading flex items-center gap-2">
        <span className="text-emerald-accent">{icon}</span> {title}
      </h2>
      {action}
    </div>
  );
}

const th = 'text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant';
const thRight = 'text-right px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-brand-on-surface-variant';
const td = 'px-4 py-3 text-brand-on-surface';
const tdRight = 'px-4 py-3 text-brand-on-surface text-right font-mono text-xs';

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { display } = useMoneyDisplay();
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payrollRows, setPayrollRows] = useState<PayrollReportRow[]>([]);
  const [revenueRows, setRevenueRows] = useState<RevenueShareRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PayrollPeriod[]>('/payroll/periods')
      .then((list) => {
        setPeriods(list);
        if (list.length > 0) setPeriodId(pickCurrentPeriod(list)?.id ?? list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load payroll periods.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (periods.length === 0) return;
    setReportsLoading(true); setReportsError(null);
    const scope = periodId ? periods.filter((period) => period.id === periodId) : periods;
    Promise.allSettled(scope.map(async (period) => {
      const [payroll, revenue] = await Promise.all([
        api.get<PayrollReportRow[]>(`/payroll/periods/${period.id}/reports/payroll`),
        api.get<RevenueShareRow[]>(`/payroll/periods/${period.id}/reports/revenue-share`),
      ]);
      return {
        payroll: payroll.map((row) => ({ ...row, period_id: period.id, period_label: period.label })),
        revenue: revenue.map((row) => ({ ...row, period_id: period.id, period_label: period.label })),
      };
    }))
      .then((results) => {
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        if (loaded.length === 0) throw new Error('Failed to load reports.');
        setPayrollRows(loaded.flatMap((row) => row.payroll));
        setRevenueRows(loaded.flatMap((row) => row.revenue));
        const failed = results.length - loaded.length;
        if (failed > 0) setReportsError(`${failed} working month${failed === 1 ? '' : 's'} did not load.`);
      })
      .catch((e) => setReportsError(e instanceof Error ? e.message : 'Failed to load reports.'))
      .finally(() => setReportsLoading(false));
  }, [periodId, periods]);

  const selectedPeriod = periods.find((p) => p.id === periodId) ?? null;
  const currencies = Array.from(new Set(
    (selectedPeriod ? [selectedPeriod] : periods).map((period) => period.currency),
  ));
  const baseCur = currencies.length === 1 ? displayCurrencyFor(currencies[0]) : (display ?? 'Mixed');
  const slug = (selectedPeriod?.label ?? 'all-working-months').replace(/\s+/g, '-').toLowerCase();

  const periodCurrency = useCallback(
    (rowPeriodId?: string) => periods.find((p) => p.id === (rowPeriodId ?? periodId))?.currency ?? 'USD',
    [periods, periodId],
  );

  const payrollTotals = useMemo(() => ({
    hours: payrollRows.reduce((s, r) => s + Number(r.hours_logged ?? 0), 0),
    gross: sumByCurrency(payrollRows, (r) => r.local_currency, (r) => r.gross_earned),
    deductions: sumByCurrency(payrollRows, (r) => r.local_currency, (r) => r.total_deductions),
    net: sumByCurrency(payrollRows, (r) => r.local_currency, (r) => r.final_net),
    baseEquivalent: sumByCurrency(payrollRows, (r) => periodCurrency(r.period_id), (r) => r.base_equivalent),
  }), [payrollRows, periodCurrency]);

  const revenueTotals = useMemo(() => {
    const cur = (r: RevenueShareRow) => periodCurrency(r.period_id);
    return {
      earnings: sumByCurrency(revenueRows, cur, (r) => r.earnings),
      workerCost: sumByCurrency(revenueRows, cur, (r) => r.worker_cost),
      distributable: sumByCurrency(revenueRows, cur, (r) => r.distributable),
      gsShare: sumByCurrency(revenueRows, cur, (r) => r.gs_share),
      ownerShare: sumByCurrency(revenueRows, cur, (r) => r.owner_share),
    };
  }, [revenueRows, periodCurrency]);

  async function handleDownload(key: string, path: string, filename: string) {
    setDownloading(key); setDownloadError(null);
    try {
      await downloadFile(path, filename);
    } catch (e: unknown) {
      setDownloadError(e instanceof Error ? e.message : 'Download failed.');
    } finally { setDownloading(null); }
  }

  function csvButton(key: string, path: string, filename: string) {
    return (
      <button type="button" disabled={downloading !== null || !periodId}
        onClick={() => handleDownload(key, path, filename)}
        className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 disabled:opacity-50">
        {downloading === key ? <SpinningDots size="sm" /> : <Download size={12} />} Download CSV
      </button>
    );
  }

  return (
    <div>
      <PageHeader
        title="Reports"
      />
      <AdminSectionTabs tabs={PAYROLL_TABS} />

      {loading ? (
        <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
      ) : error ? (
        <Banner>{error}</Banner>
      ) : periods.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <p className="text-theme-muted text-sm">No payroll periods yet. Create one on the Payroll page to generate reports.</p>
        </div>
      ) : (
        <>
          <PeriodFilter
            periods={periods}
            value={periodId}
            onChange={setPeriodId}
            allowAll
            allLabel="All working months"
            variant="select"
            label="Working month"
          />

          {downloadError && <Banner>{downloadError}</Banner>}
          {reportsError && <Banner>{reportsError}</Banner>}

          {reportsLoading ? (
            <div className="flex justify-center py-16"><SpinningDots size="lg" className="text-emerald-accent" /></div>
          ) : (
            <div className="space-y-6">
              {/* ── Payroll Report ── */}
              <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                <PanelHeader
                  icon={<FileBarChart size={15} />}
                  title="Payroll Report"
                  action={csvButton('payroll', `/payroll/periods/${periodId}/reports/payroll?format=csv`, `payroll-report-${slug}.csv`)}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className={th}>Worker</th>
                        <th className={th}>Country</th>
                        <th className={thRight}>Hours</th>
                        <th className={thRight}>Gross</th>
                        <th className={thRight}>Deductions</th>
                        <th className={thRight}>Final Net</th>
                        <th className={th}>Local</th>
                        <th className={thRight}>{baseCur} Equiv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-brand-on-surface-variant">
                            No payroll rows for this period. Run Calculate on the Payroll page first.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {payrollRows.map((r) => (
                            <tr key={`${r.period_id ?? periodId}:${r.id}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                              <td className={`${td} font-medium text-theme-heading`}>
                                {r.worker_display_name}
                                {!periodId && r.period_label ? <span className="block text-[10px] font-normal text-theme-muted mt-0.5">{r.period_label}</span> : null}
                              </td>
                              <td className={td}>{r.worker_country}</td>
                              <td className={tdRight}>{Number(r.hours_logged ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                              <td className={tdRight}>{fmt(r.gross_earned, r.local_currency)}</td>
                              <td className={tdRight}>{fmt(r.total_deductions, r.local_currency)}</td>
                              <td className={`${tdRight} font-bold text-emerald-accent`}>{fmt(r.final_net, r.local_currency)}</td>
                              <td className={td}>{displayCurrencyFor(r.local_currency) || r.local_currency}</td>
                              <td className={`${tdRight} text-gold-accent`}>{fmt(r.base_equivalent, periodCurrency(r.period_id))}</td>
                            </tr>
                          ))}
                          <tr className="bg-white/[0.03] border-t border-white/10">
                            <td className={`${td} font-bold text-theme-heading`} colSpan={2}>Totals ({payrollRows.length} workers)</td>
                            <td className={`${tdRight} font-bold`}>{payrollTotals.hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                            <td className={`${tdRight} font-bold`}>{formatMoneyTotals(payrollTotals.gross)}</td>
                            <td className={`${tdRight} font-bold`}>{formatMoneyTotals(payrollTotals.deductions)}</td>
                            <td className={`${tdRight} font-bold text-emerald-accent`}>{formatMoneyTotals(payrollTotals.net)}</td>
                            <td className={td} />
                            <td className={`${tdRight} font-bold text-gold-accent`}>{formatMoneyTotals(payrollTotals.baseEquivalent)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
                {payrollRows.length > 0 && (
                  <p className="px-5 py-3 text-[11px] text-theme-muted border-t border-white/[0.06]">
                    {display
                      ? <>All amounts are shown in {display} at today&apos;s catalog rates. Recorded amounts are unchanged.</>
                      : <>Gross, deductions and net are shown in each worker&apos;s local currency; the {baseCur} equivalent column uses each working month&apos;s FX rates.</>}
                  </p>
                )}
              </div>

              {/* ── Revenue Sharing ── */}
              <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                <PanelHeader
                  icon={<PieChart size={15} />}
                  title="Revenue Sharing / Client Earnings"
                  action={csvButton('revenue', `/payroll/periods/${periodId}/reports/revenue-share?format=csv`, `revenue-share-${slug}.csv`)}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className={th}>Client</th>
                        <th className={th}>Platform</th>
                        <th className={thRight}>Earnings</th>
                        <th className={thRight}>Worker Cost</th>
                        <th className={thRight}>Distributable</th>
                        <th className={thRight}>GS %</th>
                        <th className={thRight}>Owner %</th>
                        <th className={thRight}>GS Share</th>
                        <th className={thRight}>Owner Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-brand-on-surface-variant">
                            No revenue-share rows for this period.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {revenueRows.map((r) => (
                            <tr key={`${r.period_id ?? periodId}:${r.client_id}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                              <td className={`${td} font-medium text-theme-heading`}>
                                {r.client_name}
                                {!periodId && r.period_label ? <span className="block text-[10px] font-normal text-theme-muted mt-0.5">{r.period_label}</span> : null}
                              </td>
                              <td className={td}>{r.platform}</td>
                              <td className={tdRight}>
                                <div>{fmt(r.earnings, periodCurrency(r.period_id))}</div>
                                <span className={`text-[9px] font-sans uppercase tracking-wider ${r.earnings_source === 'entered' ? 'text-emerald-accent' : 'text-theme-muted'}`}>
                                  {r.earnings_source === 'entered' ? 'Client entry' : 'Calculated fallback'}
                                </span>
                              </td>
                              <td className={tdRight}>{fmt(r.worker_cost, periodCurrency(r.period_id))}</td>
                              <td className={tdRight}>{fmt(r.distributable, periodCurrency(r.period_id))}</td>
                              <td className={tdRight}>{Number(r.gs_pct).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                              <td className={tdRight}>{Number(r.owner_pct).toLocaleString(undefined, { maximumFractionDigits: 1 })}%</td>
                              <td className={`${tdRight} font-bold text-emerald-accent`}>{fmt(r.gs_share, periodCurrency(r.period_id))}</td>
                              <td className={`${tdRight} font-bold text-gold-accent`}>{fmt(r.owner_share, periodCurrency(r.period_id))}</td>
                            </tr>
                          ))}
                          <tr className="bg-white/[0.03] border-t border-white/10">
                            <td className={`${td} font-bold text-theme-heading`} colSpan={2}>Totals ({revenueRows.length} clients)</td>
                            <td className={`${tdRight} font-bold`}>{formatMoneyTotals(revenueTotals.earnings)}</td>
                            <td className={`${tdRight} font-bold`}>{formatMoneyTotals(revenueTotals.workerCost)}</td>
                            <td className={`${tdRight} font-bold`}>{formatMoneyTotals(revenueTotals.distributable)}</td>
                            <td className={tdRight} />
                            <td className={tdRight} />
                            <td className={`${tdRight} font-bold text-emerald-accent`}>{formatMoneyTotals(revenueTotals.gsShare)}</td>
                            <td className={`${tdRight} font-bold text-gold-accent`}>{formatMoneyTotals(revenueTotals.ownerShare)}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="px-5 py-3 text-[11px] text-theme-muted border-t border-white/[0.06]">
                  Client earnings entered on the Clients page are authoritative. If no entry exists, calculated payroll gross is shown as a fallback. Owner splits are applied after worker costs are deducted.
                </p>
              </div>

              {/* ── Shifts & RDP claim shifts ── */}
              <ShiftsReport
                range={selectedPeriod ? { start: selectedPeriod.start_date, end: selectedPeriod.end_date } : null}
                label={selectedPeriod?.label ?? 'all-working-months'}
              />

              {/* ── Payslips ── */}
              <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden">
                <PanelHeader icon={<FileText size={15} />} title="Payslips" />
                <div className="p-5 flex flex-wrap items-center gap-4">
                  <button type="button" disabled={downloading !== null || !periodId}
                    onClick={() => handleDownload('zip', `/payroll/periods/${periodId}/payslips.zip`, `payslips-${slug}.zip`)}
                    className="btn-primary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
                    {downloading === 'zip' ? <SpinningDots size="sm" /> : <Archive size={14} />}
                    Download all payslips (ZIP)
                  </button>
                  <p className="text-xs text-theme-muted">
                    Individual payslip PDFs are available per worker on the Payroll page.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
