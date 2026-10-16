import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { PageHeader, Select } from '@/admin/ui';
import { useAuth } from '@/app/AuthProvider';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import { EntryForm, type EntryDraftSeed } from '../calendar/EntryForm';
import { ItemPopover, whenLabel } from '../calendar/ItemPopover';
import { dayKey, FEED_FILTERS, groupByDay, itemTimes, layoutDay, LEGEND, toneOf, TONES, type FeedItem, type FeedMeta, type FeedSource } from '../calendar/model';
import { addDaysLocal, AdmError, fmtTime, RequirePerm, sameDay, startOfDay, startOfWeek, useStaffDirectory, ymd } from '../shared';

type View = 'month' | 'week' | 'day';
const HOUR_PX = 44;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function useIsMobile() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function rangeFor(view: View, cursor: Date) {
  if (view === 'day') {
    const from = startOfDay(cursor);
    return { from, to: addDaysLocal(from, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(cursor);
    return { from, to: addDaysLocal(from, 7) };
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const from = startOfWeek(first);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const to = addDaysLocal(startOfWeek(last), 7);
  return { from, to };
}

function titleFor(view: View, cursor: Date, from: Date, to: Date) {
  if (view === 'month') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (view === 'day') return cursor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const last = addDaysLocal(to, -1);
  return from.getMonth() === last.getMonth()
    ? `${from.getDate()} – ${last.getDate()} ${last.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
    : `${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function Chip({ item, onOpen, compact }: { item: FeedItem; onOpen: (it: FeedItem, el: HTMLElement) => void; compact?: boolean }) {
  const tone = toneOf(item.color);
  const time = !item.allDay ? fmtTime(itemTimes(item).start) : '';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item, e.currentTarget);
      }}
      className={cn('block w-full truncate rounded-md border-l-2 px-1.5 text-left text-[12px] leading-5 transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/50', tone.chip, tone.bar, compact ? 'py-0' : 'py-0.5')}
      title={`${item.title} — ${whenLabel(item)}`}
    >
      {time && <span className="mr-1 tabular-nums opacity-70">{time}</span>}
      {item.title}
    </button>
  );
}

function MonthGrid({ from, to, cursor, byDay, onOpen, onDay, onCreate, canWrite }: { from: Date; to: Date; cursor: Date; byDay: Map<string, FeedItem[]>; onOpen: (it: FeedItem, el: HTMLElement) => void; onDay: (d: Date) => void; onCreate: (d: Date) => void; canWrite: boolean }) {
  const days: Date[] = [];
  for (let d = from; d < to; d = addDaysLocal(d, 1)) days.push(d);
  const today = new Date();
  return (
    <div className="adm-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-adm-line bg-adm-bg/60 text-xs font-medium uppercase tracking-wide text-adm-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7" role="grid" aria-label="Month view">
        {days.map((d, i) => {
          const items = byDay.get(dayKey(d)) ?? [];
          const outside = d.getMonth() !== cursor.getMonth();
          const isToday = sameDay(d, today);
          const shown = items.slice(0, 3);
          return (
            <div
              key={i}
              role="gridcell"
              className={cn('group relative min-h-[118px] border-b border-r border-adm-line/70 p-1.5', (i + 1) % 7 === 0 && 'border-r-0', outside && 'bg-adm-bg/40')}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  className={cn(
                    'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs tabular-nums hover:bg-adm-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/50',
                    isToday ? 'bg-adm-dark font-semibold text-white hover:bg-adm-dark' : outside ? 'text-adm-muted/70' : 'text-adm-ink',
                  )}
                  aria-label={`Open ${d.toDateString()}`}
                >
                  {d.getDate()}
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => onCreate(d)}
                    className="rounded p-0.5 text-adm-muted opacity-0 transition hover:bg-adm-bg hover:text-adm-ink focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Add entry on ${d.toDateString()}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {shown.map((it) => (
                  <Chip key={it.id} item={it} onOpen={onOpen} compact />
                ))}
                {items.length > shown.length && (
                  <button type="button" onClick={() => onDay(d)} className="px-1.5 text-[11px] font-medium text-adm-muted hover:text-adm-ink">
                    +{items.length - shown.length} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({ days, byDay, onOpen, onCreate, canWrite }: { days: Date[]; byDay: Map<string, FeedItem[]>; onOpen: (it: FeedItem, el: HTMLElement) => void; onCreate: (d: Date, hour: number) => void; canWrite: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  // Scroll to 7am, or earlier when something is scheduled before that.
  const earliest = Math.min(
    7,
    ...days.flatMap((d) =>
      (byDay.get(dayKey(d)) ?? [])
        .filter((i) => !i.allDay)
        .map((i) => {
          const s = itemTimes(i).start;
          return sameDay(s, d) ? s.getHours() : 0;
        }),
    ),
  );
  const firstDay = days[0]?.getTime();
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, earliest - 0.5) * HOUR_PX;
  }, [earliest, firstDay]);
  const today = new Date();
  const nowMin = today.getHours() * 60 + today.getMinutes();
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="adm-card overflow-hidden">
      <div className="grid border-b border-adm-line bg-adm-bg/60" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => (
          <div key={d.toISOString()} className={cn('border-l border-adm-line/70 px-2 py-2 text-center', sameDay(d, today) && 'text-adm-gold')}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-adm-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</p>
            <p className={cn('text-lg font-semibold tabular-nums', sameDay(d, today) && 'text-adm-gold')}>{d.getDate()}</p>
          </div>
        ))}
      </div>
      {/* All-day row */}
      <div className="grid border-b border-adm-line" style={{ gridTemplateColumns: cols }}>
        <div className="px-1 py-1.5 text-right text-[10px] uppercase tracking-wide text-adm-muted">All day</div>
        {days.map((d) => {
          const items = (byDay.get(dayKey(d)) ?? []).filter((i) => i.allDay);
          return (
            <div key={d.toISOString()} className="min-h-[34px] space-y-0.5 border-l border-adm-line/70 p-1">
              {items.map((it) => (
                <Chip key={it.id} item={it} onOpen={onOpen} />
              ))}
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="max-h-[640px] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }).map((_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-adm-muted" style={{ top: h * HOUR_PX }}>
                {h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' })}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const placed = layoutDay(byDay.get(dayKey(d)) ?? [], d);
            return (
              <div key={d.toISOString()} className="relative border-l border-adm-line/70">
                {Array.from({ length: 24 }).map((_, h) => (
                  <button
                    key={h}
                    type="button"
                    tabIndex={canWrite ? 0 : -1}
                    disabled={!canWrite}
                    onClick={() => onCreate(d, h)}
                    className="absolute left-0 right-0 border-t border-adm-line/50 hover:bg-adm-bg/60 disabled:cursor-default disabled:hover:bg-transparent"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                    aria-label={canWrite ? `Add entry ${d.toDateString()} ${h}:00` : undefined}
                  />
                ))}
                {sameDay(d, today) && <div className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-adm-gold" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden />}
                {placed.map((p) => {
                  const tone = toneOf(p.item.color);
                  const { start, end } = itemTimes(p.item);
                  return (
                    <button
                      key={p.item.id}
                      type="button"
                      onClick={(e) => onOpen(p.item, e.currentTarget)}
                      className={cn('absolute z-[5] flex flex-col justify-start overflow-hidden rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm ring-1 ring-white transition hover:z-20 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold', tone.chip, tone.bar)}
                      style={{ top: (p.top / 60) * HOUR_PX, height: Math.max(20, (p.height / 60) * HOUR_PX - 2), left: `calc(${(p.lane / p.lanes) * 100}% + 2px)`, width: `calc(${100 / p.lanes}% - 4px)` }}
                      title={`${p.item.title} — ${whenLabel(p.item)}`}
                    >
                      <span className="block truncate font-medium">{p.item.title}</span>
                      <span className="block truncate tabular-nums opacity-70">
                        {fmtTime(start)}
                        {end.getTime() > start.getTime() ? ` – ${fmtTime(end)}` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Agenda({ from, to, byDay, onOpen, emptyLabel }: { from: Date; to: Date; byDay: Map<string, FeedItem[]>; onOpen: (it: FeedItem, el: HTMLElement) => void; emptyLabel: string }) {
  const days: Date[] = [];
  for (let d = from; d < to; d = addDaysLocal(d, 1)) if (byDay.get(dayKey(d))?.length) days.push(d);
  if (!days.length) return <div className="adm-card px-6 py-14 text-center text-sm text-adm-muted">{emptyLabel}</div>;
  const today = new Date();
  return (
    <ol className="space-y-4" aria-label="Agenda">
      {days.map((d) => (
        <li key={d.toISOString()} className="adm-card overflow-hidden">
          <div className={cn('flex items-baseline gap-2 border-b border-adm-line bg-adm-bg/60 px-4 py-2', sameDay(d, today) && 'text-adm-gold')}>
            <span className="text-lg font-semibold tabular-nums">{d.getDate()}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-adm-muted">{d.toLocaleDateString(undefined, { weekday: 'long', month: 'short' })}</span>
            {sameDay(d, today) && <span className="ml-auto text-[11px] font-medium uppercase tracking-wide">Today</span>}
          </div>
          <ul className="divide-y divide-adm-line/70">
            {byDay.get(dayKey(d))!.map((it) => {
              const tone = toneOf(it.color);
              const { start, end } = itemTimes(it);
              return (
                <li key={it.id}>
                  <button type="button" onClick={(e) => onOpen(it, e.currentTarget)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-adm-bg/60 focus-visible:bg-adm-bg focus-visible:outline-none">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                    <span className="w-16 shrink-0 whitespace-pre-line text-xs tabular-nums text-adm-muted">{it.allDay ? 'All day' : `${fmtTime(start)}${end.getTime() > start.getTime() ? `\n${fmtTime(end)}` : ''}`}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{it.title}</span>
                      <span className="block text-xs text-adm-muted">
                        {tone.label}
                        {it.assignee ? ` · ${it.assignee.name}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

const STORE_KEY = 'maison.calendar.prefs';

function CalendarScreen() {
  const { can } = useAuth();
  const isMobile = useIsMobile();
  const canWrite = can('calendar.manage');
  const available = FEED_FILTERS.filter((f) => !f.perm || can(f.perm));
  const saved = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as { view?: View; types?: FeedSource[] };
    } catch {
      return {};
    }
  }, []);
  const [view, setView] = useState<View>(saved.view ?? 'month');
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [types, setTypes] = useState<FeedSource[]>(() => (saved.types?.length ? saved.types : available.map((f) => f.type)));
  const [assigneeId, setAssigneeId] = useState('');
  const [open, setOpen] = useState<{ item: FeedItem; anchor: DOMRect } | null>(null);
  const [form, setForm] = useState<{ entryId: string | null; seed: EntryDraftSeed | null } | null>(null);
  const staff = useStaffDirectory();

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ view, types }));
    } catch {
      /* storage unavailable */
    }
  }, [view, types]);

  const { from, to } = useMemo(() => rangeFor(view, cursor), [view, cursor]);
  const activeTypes = types.filter((t) => available.some((f) => f.type === t));
  const feed = useQuery({
    queryKey: ['calendar-feed', ymd(from), ymd(to), activeTypes.join(','), assigneeId],
    queryFn: () => apiRequest<FeedItem[]>('/admin/calendar/feed', { query: { from: ymd(from), to: ymd(addDaysLocal(to, -1)), types: activeTypes.join(','), assigneeId } }),
    enabled: activeTypes.length > 0,
    placeholderData: keepPreviousData,
  });
  const items = useMemo(() => (activeTypes.length ? (feed.data?.data ?? []) : []), [feed.data, activeTypes.length]);
  const meta = feed.data?.meta as unknown as FeedMeta | undefined;
  const byDay = useMemo(() => groupByDay(items, from, to), [items, from, to]);

  const step = (dir: -1 | 1) => {
    setOpen(null);
    setCursor((c) => (view === 'month' ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : addDaysLocal(c, view === 'week' ? 7 * dir : dir)));
  };
  const onOpen = useCallback((item: FeedItem, el: HTMLElement) => setOpen({ item, anchor: el.getBoundingClientRect() }), []);
  const closePopover = useCallback(() => setOpen(null), []);
  const toggleType = (t: FeedSource) => setTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const goDay = (d: Date) => {
    setCursor(d);
    setView('day');
  };
  const create = (d: Date, hour?: number) => setForm({ entryId: null, seed: { date: d, hour } });
  const days: Date[] = [];
  for (let d = from; d < to; d = addDaysLocal(d, 1)) days.push(d);
  const monthRange = view === 'month' ? { from: new Date(cursor.getFullYear(), cursor.getMonth(), 1), to: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) } : { from, to };

  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    if (e.key === 'ArrowLeft' && e.altKey) step(-1);
    if (e.key === 'ArrowRight' && e.altKey) step(1);
  };

  return (
    <div onKeyDown={onKey}>
      <PageHeader
        title="Calendar"
        subtitle="Events, consultations, payments, deliveries, task deadlines and team entries in one place."
        actions={
          canWrite && (
            <button className="adm-btn-primary" onClick={() => create(cursor)}>
              <Plus className="h-4 w-4" /> New entry
            </button>
          )
        }
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button className="adm-btn-secondary px-2" onClick={() => step(-1)} aria-label={`Previous ${view}`}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="adm-btn-secondary"
            onClick={() => {
              setOpen(null);
              setCursor(startOfDay(new Date()));
            }}
          >
            Today
          </button>
          <button className="adm-btn-secondary px-2" onClick={() => step(1)} aria-label={`Next ${view}`}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight" aria-live="polite">
          {titleFor(view, cursor, from, to)}
          {feed.isFetching && <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-adm-gold border-t-transparent align-middle" aria-label="Loading" />}
        </h2>
        <div className="flex rounded-lg border border-adm-line bg-white p-0.5" role="tablist" aria-label="Calendar view">
          {(['month', 'week', 'day'] as View[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                setOpen(null);
                setView(v);
              }}
              className={cn('rounded-md px-3 py-1.5 text-sm capitalize transition', view === v ? 'bg-adm-dark text-white' : 'text-adm-muted hover:text-adm-ink')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-adm-muted">Show</span>
        {available.map((f) => {
          const on = types.includes(f.type);
          const legend = LEGEND.find((l) => l.source === f.type);
          return (
            <button
              key={f.type}
              type="button"
              aria-pressed={on}
              onClick={() => toggleType(f.type)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold/40',
                on ? 'border-adm-ink/80 bg-adm-dark text-white' : 'border-adm-line bg-white text-adm-muted hover:text-adm-ink',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', TONES[legend?.colors[0] ?? 'entry-other'].dot)} aria-hidden />
              {f.label}
            </button>
          );
        })}
        <div className="ml-auto w-full sm:w-56">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Filter by assignee">
            <option value="">Everyone</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {meta?.hiddenTypes?.length ? <p className="mb-3 text-xs text-adm-muted">Some item types are hidden because your role cannot view them: {meta.hiddenTypes.join(', ')}.</p> : null}

      {!activeTypes.length ? (
        <div className="adm-card px-6 py-14 text-center text-sm text-adm-muted">Choose at least one item type to show.</div>
      ) : feed.isError ? (
        <AdmError error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.isLoading ? (
        <div className="adm-card h-[560px] animate-pulse bg-white" aria-busy aria-label="Loading calendar" />
      ) : isMobile ? (
        <Agenda from={monthRange.from} to={monthRange.to} byDay={byDay} onOpen={onOpen} emptyLabel={`Nothing scheduled ${view === 'day' ? 'on this day' : `this ${view}`}.`} />
      ) : view === 'month' ? (
        <MonthGrid from={from} to={to} cursor={cursor} byDay={byDay} onOpen={onOpen} onDay={goDay} onCreate={(d) => create(d)} canWrite={canWrite} />
      ) : (
        <TimeGrid days={days} byDay={byDay} onOpen={onOpen} onCreate={create} canWrite={canWrite} />
      )}

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-adm-muted" aria-label="Legend">
        {LEGEND.filter((l) => available.some((f) => f.type === l.source)).flatMap((l) =>
          l.colors.map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className={cn('h-2.5 w-2.5 rounded-sm', TONES[c].dot)} aria-hidden />
              {TONES[c].label}
            </span>
          )),
        )}
        {!isMobile && (
          <span className="inline-flex items-center gap-1.5 sm:ml-auto">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {meta?.total ?? items.length} items in view
          </span>
        )}
      </div>

      {open && <ItemPopover item={open.item} anchor={open.anchor} onClose={closePopover} canEdit={canWrite} onEdit={(entryId) => {
        setOpen(null);
        setForm({ entryId, seed: null });
      }} />}
      <EntryForm open={!!form} entryId={form?.entryId ?? null} seed={form?.seed ?? null} onClose={() => setForm(null)} />
    </div>
  );
}

export default function CalendarPage() {
  return (
    <RequirePerm any={['calendar.manage', 'bookings.view', 'inquiries.view']}>
      <CalendarScreen />
    </RequirePerm>
  );
}
