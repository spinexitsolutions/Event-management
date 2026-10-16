import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { api } from '@/lib/api';
import { fmtDate, fromNow, money, titleCase } from '@/lib/format';
import { Card, PageHeader, StatusBadge } from '@/admin/ui';
import { DateRangePicker, InfoTip, initialRange, PanelError, SkeletonBlock, type DateRange } from '../components/common';
import { CHART, monthLabel } from '../lib';

interface DashboardData {
  range: { from: string; to: string };
  inquiries: { total: number; new: number };
  bookings: { upcoming: number; inProgress: number; completed: number; confirmed: number; byStatus: Record<string, number> };
  quotations: { sent: number; pending: number };
  clients: { total: number; new: number };
  money: { quotationValueMinor: number; confirmedValueMinor: number; receivedMinor: number; outstandingMinor: number; revenueTrend: { month: string; received: number }[] } | null;
  trend: { month: string; inquiries: number; bookings: number }[];
  categoryPerformance: { category: string; bookings: number; valueMinor: number | null }[];
  upcomingEvents: { id: string; reference: string; title: string; eventDate: string; venueName: string; city: string; status: BookingStatus; client: { name: string } }[];
  recentActivity: { id: string; action: string; summary: string; entityType: string; entityId: string | null; actor: string; createdAt: string }[];
}

const nf = new Intl.NumberFormat();
/** Compact currency for chart axes (major units). */
const compactMoney = (minor: number) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);

function Kpi({ label, value, hint, to, info }: { label: string; value: ReactNode; hint?: ReactNode; to?: string; info?: ReactNode }) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">
        {label}
        {info && <InfoTip label={`About ${label}`}>{info}</InfoTip>}
      </p>
      <p className="mt-2.5 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-xs text-adm-muted">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="adm-card group relative block p-4 transition hover:border-adm-gold/50 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/40">
      <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-adm-muted opacity-0 transition group-hover:opacity-100" />
      {body}
    </Link>
  ) : (
    <div className="adm-card p-4">{body}</div>
  );
}

const tooltipStyle = { borderRadius: 10, border: '1px solid #E7E2D9', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' };
const axisProps = { tickLine: false, axisLine: false, tick: { fill: CHART.axis, fontSize: 11 } } as const;

const ACTIVITY_LINK: Record<string, (id: string) => string> = {
  Inquiry: (id) => `/admin/inquiries/${id}`,
  Client: (id) => `/admin/clients/${id}`,
  Quotation: (id) => `/admin/quotations/${id}`,
  Booking: (id) => `/admin/bookings/${id}`,
};

export default function Dashboard() {
  const { user, can } = useAuth();
  const [range, setRange] = useState<DateRange>(() => initialRange('12m'));
  const q = useQuery({ queryKey: ['dashboard', range.from, range.to], queryFn: () => api.get<DashboardData>('/admin/dashboard', { from: range.from, to: range.to }), placeholderData: (p) => p });
  const d = q.data;
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  return (
    <div>
      <PageHeader title={`${greeting}${user ? `, ${user.name.split(' ')[0]}` : ''}`} subtitle="Your pipeline, events and finances at a glance." actions={<DateRangePicker value={range} onChange={setRange} />} />
      {q.isError && !d ? (
        <PanelError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-6" aria-busy={q.isFetching}>
          <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {!d ? (
              Array.from({ length: 10 }).map((_, i) => <SkeletonBlock key={i} className="h-[104px]" />)
            ) : (
              <>
                <Kpi label="Inquiries" value={nf.format(d.inquiries.total)} hint="Received in range" to={can('inquiries.view') ? '/admin/inquiries' : undefined} />
                <Kpi label="New inquiries" value={nf.format(d.inquiries.new)} hint="Awaiting first contact" to={can('inquiries.view') ? '/admin/inquiries?status=NEW' : undefined} />
                <Kpi label="Upcoming events" value={nf.format(d.bookings.upcoming)} hint="Confirmed or awaiting contract/advance" to={can('bookings.view') ? '/admin/bookings' : undefined} />
                <Kpi label="In progress" value={nf.format(d.bookings.inProgress)} hint="Events in execution" />
                <Kpi label="Completed" value={nf.format(d.bookings.completed)} hint="Completed in range" />
                <Kpi label="Confirmed bookings" value={nf.format(d.bookings.confirmed)} hint="Confirmed in range" />
                <Kpi label="Pending quotations" value={nf.format(d.quotations.pending)} hint="Sent, viewed or revision requested" to={can('quotations.manage') ? '/admin/quotations' : undefined} />
                <Kpi label="Quotations sent" value={nf.format(d.quotations.sent)} hint="Sent in range" />
                <Kpi label="Clients" value={nf.format(d.clients.total)} hint="Total in CRM" to={can('clients.view') ? '/admin/clients' : undefined} />
                <Kpi label="New clients" value={nf.format(d.clients.new)} hint="Added in range" />
              </>
            )}
          </section>

          {d?.money && (
            <section aria-label="Finance" className="adm-card overflow-hidden">
              <header className="flex items-center justify-between border-b border-adm-line px-5 py-3.5">
                <h2 className="text-sm font-semibold">Finance</h2>
                <span className="text-xs text-adm-muted">
                  {fmtDate(d.range.from)} – {fmtDate(d.range.to)}
                </span>
              </header>
              <div className="grid divide-adm-line sm:grid-cols-2 sm:divide-x xl:grid-cols-4">
                {[
                  { label: 'Quotation value', sub: 'Estimate, not revenue', v: d.money.quotationValueMinor, info: 'Total of quotations sent in this range (latest version). An estimate of pipeline value — never counted as revenue.' },
                  { label: 'Confirmed contract value', sub: 'Bookings confirmed in range', v: d.money.confirmedValueMinor, info: 'Contract value of bookings that reached Confirmed (or later, excluding cancelled) within this range.' },
                  { label: 'Payments received', sub: 'Net of refunds', v: d.money.receivedMinor, info: 'Verified paid payments by payment date, minus processed refunds in the same range.' },
                  { label: 'Outstanding balances', sub: 'All active & completed bookings', v: d.money.outstandingMinor, info: 'Contract value of active and completed bookings minus payments received on them. Not limited to the selected range.' },
                ].map((m, i) => (
                  <div key={m.label} className={i > 1 ? 'border-t border-adm-line p-5 xl:border-t-0' : i === 1 ? 'border-t border-adm-line p-5 sm:border-t-0' : 'p-5'}>
                    <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-adm-muted">
                      {m.label}
                      <InfoTip label={`How ${m.label} is calculated`}>{m.info}</InfoTip>
                    </p>
                    <p className={i === 2 ? 'mt-2.5 text-2xl font-semibold tabular-nums text-adm-gold' : 'mt-2.5 text-2xl font-semibold tabular-nums'}>{money(m.v)}</p>
                    <p className="mt-1.5 text-xs text-adm-muted">{m.sub}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
            <Card title="Inquiries vs bookings" actions={<span className="text-xs text-adm-muted">per month</span>}>
              {!d ? (
                <SkeletonBlock className="h-64" />
              ) : d.trend.every((t) => !t.inquiries && !t.bookings) ? (
                <p className="py-20 text-center text-sm text-adm-muted">No inquiries or bookings in this range.</p>
              ) : (
                <div className="h-64" role="img" aria-label="Line chart of inquiries and bookings per month">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.trend.map((t) => ({ ...t, label: monthLabel(t.month) }))} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
                      <YAxis allowDecimals={false} {...axisProps} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: CHART.grid, strokeWidth: 1 }} />
                      <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                      <Line type="monotoneX" dataKey="inquiries" name="Inquiries" stroke={CHART.gold} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                      <Line type="monotoneX" dataKey="bookings" name="Bookings" stroke={CHART.ink} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            {d?.money ? (
              <Card title="Payments received" actions={<span className="text-xs text-adm-muted">net of refunds, per month</span>}>
                <div className="h-64" role="img" aria-label="Bar chart of payments received per month">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.money.revenueTrend.map((t) => ({ ...t, label: monthLabel(t.month) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
                      <YAxis {...axisProps} tickFormatter={compactMoney} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(169,138,78,.08)' }} formatter={(v: number) => [money(v), 'Received']} />
                      <Bar dataKey="received" name="Received" fill={CHART.gold} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : (
              <Card title="Category performance" actions={<span className="text-xs text-adm-muted">bookings created in range</span>}>
                <CategoryChart d={d} />
              </Card>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
            {d?.money && (
              <Card title="Category performance" actions={<span className="text-xs text-adm-muted">bookings created in range</span>} className="xl:col-span-1">
                <CategoryChart d={d} />
              </Card>
            )}
            <Card title="Upcoming events" actions={can('bookings.view') && <Link to="/admin/bookings" className="text-xs text-adm-gold hover:underline">All bookings</Link>} className={d?.money ? '' : 'xl:col-span-2'} bodyClassName="p-0">
              {!d ? (
                <div className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12" />)}</div>
              ) : d.upcomingEvents.length === 0 ? (
                <p className="px-5 py-14 text-center text-sm text-adm-muted">No upcoming events.</p>
              ) : (
                <ul className="divide-y divide-adm-line">
                  {d.upcomingEvents.map((e) => {
                    const dt = new Date(`${e.eventDate}T00:00:00`);
                    const inner = (
                      <>
                        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-adm-bg text-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-adm-gold">{dt.toLocaleDateString(undefined, { month: 'short' })}</span>
                          <span className="text-lg font-semibold leading-none">{dt.getDate()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{e.title}</p>
                          <p className="mt-0.5 truncate text-xs text-adm-muted">
                            {e.client.name}
                            {(e.venueName || e.city) && ` · ${[e.venueName, e.city].filter(Boolean).join(', ')}`}
                          </p>
                          <div className="mt-1.5">
                            <StatusBadge status={e.status} label={BOOKING_STATUS_LABELS[e.status]} />
                          </div>
                        </div>
                      </>
                    );
                    return (
                      <li key={e.id}>
                        {can('bookings.view') ? (
                          <Link to={`/admin/bookings/${e.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-adm-bg/60">
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 px-5 py-3">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card title="Recent activity" actions={can('audit.view') && <Link to="/admin/settings/audit" className="text-xs text-adm-gold hover:underline">Audit log</Link>} bodyClassName="p-0">
              {!d ? (
                <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-9" />)}</div>
              ) : d.recentActivity.length === 0 ? (
                <p className="px-5 py-14 text-center text-sm text-adm-muted">No activity yet.</p>
              ) : (
                <ol className="max-h-[420px] overflow-y-auto px-5 py-3">
                  {d.recentActivity.map((a) => {
                    const href = a.entityId && ACTIVITY_LINK[a.entityType]?.(a.entityId);
                    const text = (
                      <>
                        <span className="font-medium">{a.actor}</span> <span className="text-adm-muted">{titleCase(a.action.replace(/\./g, ' '))}</span>
                        {a.summary && <span className="text-adm-muted"> — {a.summary}</span>}
                      </>
                    );
                    return (
                      <li key={a.id} className="relative border-l border-adm-line py-2 pl-4">
                        <span className="absolute -left-[4px] top-3.5 h-[7px] w-[7px] rounded-full bg-adm-gold" aria-hidden />
                        <p className="text-sm leading-snug">{href ? <Link to={href} className="hover:underline">{text}</Link> : text}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-adm-muted">
                          <CalendarDays className="h-3 w-3" /> <time dateTime={a.createdAt}>{fromNow(a.createdAt)}</time>
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryChart({ d }: { d: DashboardData | undefined }) {
  if (!d) return <SkeletonBlock className="h-64" />;
  if (!d.categoryPerformance.length) return <p className="py-20 text-center text-sm text-adm-muted">No bookings created in this range.</p>;
  const rows = [...d.categoryPerformance].sort((a, b) => b.bookings - a.bookings);
  return (
    <div style={{ height: Math.max(180, rows.length * 44 + 30) }} role="img" aria-label="Bar chart of bookings by category">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...axisProps} />
          <YAxis type="category" dataKey="category" width={128} {...axisProps} tick={{ fill: '#3d3933', fontSize: 12 }} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: 'rgba(169,138,78,.08)' }}
            formatter={(v: number, _n, p) => [p.payload.valueMinor !== null ? `${v} · ${money(p.payload.valueMinor)}` : v, 'Bookings']}
          />
          <Bar dataKey="bookings" name="Bookings" fill={CHART.gold} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
