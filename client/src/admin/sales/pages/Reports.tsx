import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useToast } from '@/components/ui/Toast';
import { api, download, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, titleCase } from '@/lib/format';
import { PageHeader } from '@/admin/ui';
import { DateRangePicker, initialRange, PanelError, SkeletonBlock, type DateRange } from '../components/common';
import { CHART, monthLabel } from '../lib';

interface ReportDef { key: string; label: string; finance: boolean }
interface ReportResult { key: string; label: string; from: string; to: string; rows: Record<string, string | number | null>[] }

const GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Sales', keys: ['inquiries-by-source', 'inquiry-conversion', 'quotation-acceptance', 'package-popularity', 'client-retention', 'manager-performance'] },
  { label: 'Operations', keys: ['bookings-by-category', 'bookings-by-month', 'upcoming-events'] },
  { label: 'Finance', keys: ['contract-value', 'payments-received', 'outstanding-balances', 'event-margins', 'vendor-spending'] },
];
/** Columns holding money (already in major units in report rows). */
const MONEY_COLS = new Set(['contractValue', 'received', 'refunded', 'net', 'outstanding', 'expenses', 'margin', 'spent']);
const PCT_COLS = new Set(['conversionPct', 'sharePct', 'marginPct']);
const HEADER: Record<string, string> = { conversionPct: 'Conversion %', sharePct: 'Share %', marginPct: 'Margin %', eventDate: 'Event date', contractValue: 'Contract value', inquiriesAssigned: 'Inquiries assigned', inquiriesWon: 'Inquiries won', eventsManaged: 'Events managed', eventsCompleted: 'Events completed' };
const headerOf = (k: string) => HEADER[k] ?? titleCase(k.replace(/([a-z])([A-Z])/g, '$1_$2'));
const major = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const num = new Intl.NumberFormat();

function fmtCell(k: string, v: string | number | null) {
  if (v === null || v === '') return '—';
  if (typeof v === 'number') {
    if (MONEY_COLS.has(k)) return major.format(v);
    if (PCT_COLS.has(k)) return `${v}%`;
    return num.format(v);
  }
  if (k === 'month' && /^\d{4}-\d{2}$/.test(v)) return monthLabel(v);
  if (k === 'eventDate') return fmtDate(v);
  if (k === 'status' && /^[A-Z_ %]+$/.test(v)) return titleCase(v);
  return v;
}

export default function Reports() {
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const [range, setRange] = useState<DateRange>(() => initialRange('12m'));
  const [exporting, setExporting] = useState(false);
  const list = useQuery({ queryKey: ['reports'], queryFn: () => api.get<ReportDef[]>('/admin/reports'), staleTime: 10 * 60_000 });
  const selected = sp.get('report') ?? list.data?.[0]?.key ?? '';
  const res = useQuery({
    queryKey: ['report', selected, range.from, range.to],
    queryFn: () => api.get<ReportResult>(`/admin/reports/${selected}`, { from: range.from, to: range.to }),
    enabled: !!selected,
    placeholderData: (p) => (p?.key === selected ? p : undefined),
  });
  const groups = GROUPS.map((g) => ({ ...g, items: (list.data ?? []).filter((r) => g.keys.includes(r.key)) }))
    .concat([{ label: 'Other', keys: [], items: (list.data ?? []).filter((r) => !GROUPS.some((g) => g.keys.includes(r.key))) }])
    .filter((g) => g.items.length);
  const rows = res.data?.rows ?? [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const numericCols = cols.filter((c) => c !== 'month' && rows.every((r) => typeof r[c] === 'number'));
  const chartable = cols[0] === 'month' && numericCols.length > 0 && rows.length > 1;
  const chartKey = numericCols.find((c) => ['net', 'contractValue', 'events'].includes(c)) ?? numericCols[0];
  const label = list.data?.find((r) => r.key === selected)?.label ?? res.data?.label ?? 'Report';

  return (
    <div className="reports-print">
      <style>{`@media print { body.admin aside, body.admin header.sticky, .no-print { display: none !important; } body.admin .lg\\:pl-60 { padding-left: 0 !important; } body.admin { background: #fff; } .reports-print .adm-card { border-color: #ddd; } }`}</style>
      <PageHeader
        title="Reports"
        subtitle="Sales, operations and finance insights. Export any report to CSV."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <DateRangePicker value={range} onChange={setRange} />
            <button
              className="adm-btn-secondary"
              disabled={!selected || exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  await download(`/admin/reports/${selected}`, { from: range.from, to: range.to, format: 'csv' }, `${selected}.csv`);
                } catch (e) {
                  toast.error('Export failed', errorMessage(e));
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button className="adm-btn-secondary" onClick={() => window.print()} disabled={!res.data}>
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Reports" className="no-print">
          {list.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-8" />)}</div>
          ) : list.isError ? (
            <PanelError error={list.error} onRetry={() => list.refetch()} />
          ) : (
            <>
              <label className="lg:hidden">
                <span className="adm-label">Report</span>
                <select className="adm-input" value={selected} onChange={(e) => setSp({ report: e.target.value }, { replace: true })}>
                  {groups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.items.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="hidden space-y-5 lg:block">
                {groups.map((g) => (
                  <div key={g.label}>
                    <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-adm-muted">{g.label}</p>
                    <ul>
                      {g.items.map((r) => (
                        <li key={r.key}>
                          <button
                            onClick={() => setSp({ report: r.key }, { replace: true })}
                            aria-current={r.key === selected ? 'page' : undefined}
                            className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px] transition', r.key === selected ? 'bg-white font-medium text-adm-ink shadow-sm ring-1 ring-adm-line' : 'text-adm-muted hover:bg-white/60 hover:text-adm-ink')}
                          >
                            {r.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </nav>

        <section className="min-w-0 space-y-6" aria-live="polite" aria-busy={res.isFetching}>
          <div>
            <h2 className="text-lg font-semibold">{label}</h2>
            <p className="text-xs text-adm-muted">
              {res.data ? `${fmtDate(res.data.from)} – ${fmtDate(res.data.to)}` : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}
              {selected === 'outstanding-balances' && ' · current balances (not limited to range)'}
              {selected === 'upcoming-events' && ' · from today, at least the next 6 months'}
            </p>
          </div>
          {res.isError ? (
            <PanelError error={res.error} onRetry={() => res.refetch()} />
          ) : !res.data ? (
            <>
              <SkeletonBlock className="h-56" />
              <SkeletonBlock className="h-64" />
            </>
          ) : rows.length === 0 ? (
            <div className="adm-card flex flex-col items-center px-6 py-16 text-center">
              <BarChart3 className="mb-3 h-8 w-8 text-adm-muted/60" />
              <p className="font-medium">No data for this range</p>
              <p className="mt-1 text-sm text-adm-muted">Try a wider date range.</p>
            </div>
          ) : (
            <>
              {chartable && (
                <div className="adm-card p-5 print:break-inside-avoid">
                  <p className="mb-3 text-xs font-medium uppercase tracking-[0.08em] text-adm-muted">{headerOf(chartKey)} by month</p>
                  <div className="h-56" role="img" aria-label={`Bar chart of ${headerOf(chartKey)} by month`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rows.map((r) => ({ ...r, label: monthLabel(String(r.month)) }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={10} />
                        <YAxis tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} allowDecimals={false} tickFormatter={(v: number) => (MONEY_COLS.has(chartKey) ? new Intl.NumberFormat('en-IN', { notation: 'compact' }).format(v) : String(v))} />
                        <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E7E2D9', fontSize: 12 }} cursor={{ fill: 'rgba(169,138,78,.08)' }} formatter={(v: number) => [fmtCell(chartKey, v), headerOf(chartKey)]} />
                        <Bar dataKey={chartKey} fill={CHART.gold} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div className="adm-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="adm-table">
                    <thead className="bg-adm-bg/60">
                      <tr>
                        {cols.map((c) => (
                          <th key={c} className={numericCols.includes(c) ? 'text-right' : undefined}>
                            {headerOf(c)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          {cols.map((c) => (
                            <td key={c} className={numericCols.includes(c) ? 'whitespace-nowrap text-right tabular-nums' : c === 'booking' || c === 'reference' ? 'whitespace-nowrap font-mono text-xs' : undefined}>
                              {fmtCell(c, r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {numericCols.some((c) => MONEY_COLS.has(c) || ['events', 'bookings', 'inquiries', 'won', 'entries'].includes(c)) && rows.length > 1 && (
                      <tfoot>
                        <tr className="font-semibold">
                          {cols.map((c, i) => (
                            <td key={c} className={cn('border-t border-adm-line px-4 py-3', numericCols.includes(c) && 'text-right tabular-nums')}>
                              {i === 0 ? 'Total' : numericCols.includes(c) && !PCT_COLS.has(c) ? fmtCell(c, Math.round(rows.reduce((s, r) => s + Number(r[c] ?? 0), 0) * 100) / 100) : ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
