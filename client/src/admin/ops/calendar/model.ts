import type { Permission } from '@maison/shared';
import { addDaysLocal, parseYmd, startOfDay } from '../shared';

export type FeedSource = 'booking' | 'consultation' | 'payment' | 'vendor' | 'task' | 'entry';

export interface FeedItem {
  id: string;
  source: FeedSource;
  type: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link: string;
  color: string;
  bookingId?: string | null;
  assignee?: { id: string; name: string } | null;
  status?: string;
  meta?: Record<string, unknown>;
}

export interface FeedMeta {
  from: string;
  to: string;
  types: FeedSource[];
  hiddenTypes: FeedSource[];
  total: number;
}

export const FEED_FILTERS: { type: FeedSource; label: string; perm?: Permission }[] = [
  { type: 'booking', label: 'Events' },
  { type: 'consultation', label: 'Consultations' },
  { type: 'payment', label: 'Payments due', perm: 'finance.view' },
  { type: 'vendor', label: 'Vendor deliveries' },
  { type: 'task', label: 'Task deadlines' },
  { type: 'entry', label: 'Custom entries' },
];

export const ENTRY_TYPES = ['MEETING', 'SITE_VISIT', 'CONSULTATION', 'VENDOR_DELIVERY', 'DEADLINE', 'OTHER'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];
export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  MEETING: 'Meeting',
  SITE_VISIT: 'Site visit',
  CONSULTATION: 'Consultation',
  VENDOR_DELIVERY: 'Vendor delivery',
  DEADLINE: 'Deadline',
  OTHER: 'Other',
};

/** Colour tokens per feed `color` key: chip background/text, accent bar, legend dot. */
export interface Tone {
  chip: string;
  bar: string;
  dot: string;
  label: string;
}
export const TONES: Record<string, Tone> = {
  'event-confirmed': { chip: 'bg-emerald-50 text-emerald-900', bar: 'border-emerald-500', dot: 'bg-emerald-500', label: 'Event — confirmed' },
  'event-tentative': { chip: 'bg-[#F7F0E1] text-[#5E4920]', bar: 'border-[#A98A4E]', dot: 'bg-[#A98A4E]', label: 'Event — awaiting confirmation' },
  consultation: { chip: 'bg-violet-50 text-violet-900', bar: 'border-violet-500', dot: 'bg-violet-500', label: 'Consultation' },
  payment: { chip: 'bg-sky-50 text-sky-900', bar: 'border-sky-500', dot: 'bg-sky-500', label: 'Payment due' },
  'payment-overdue': { chip: 'bg-red-50 text-red-900', bar: 'border-red-500', dot: 'bg-red-500', label: 'Payment overdue' },
  vendor: { chip: 'bg-teal-50 text-teal-900', bar: 'border-teal-500', dot: 'bg-teal-500', label: 'Vendor delivery' },
  task: { chip: 'bg-stone-100 text-stone-800', bar: 'border-stone-400', dot: 'bg-stone-400', label: 'Task deadline' },
  'task-high': { chip: 'bg-orange-50 text-orange-900', bar: 'border-orange-500', dot: 'bg-orange-500', label: 'High-priority task' },
  'task-overdue': { chip: 'bg-rose-50 text-rose-900', bar: 'border-rose-600', dot: 'bg-rose-600', label: 'Overdue task' },
  'entry-meeting': { chip: 'bg-indigo-50 text-indigo-900', bar: 'border-indigo-500', dot: 'bg-indigo-500', label: 'Meeting' },
  'entry-site_visit': { chip: 'bg-lime-50 text-lime-900', bar: 'border-lime-600', dot: 'bg-lime-600', label: 'Site visit' },
  'entry-consultation': { chip: 'bg-violet-50 text-violet-900', bar: 'border-violet-400', dot: 'bg-violet-400', label: 'Consultation (entry)' },
  'entry-vendor_delivery': { chip: 'bg-teal-50 text-teal-900', bar: 'border-teal-400', dot: 'bg-teal-400', label: 'Vendor delivery (entry)' },
  'entry-deadline': { chip: 'bg-pink-50 text-pink-900', bar: 'border-pink-500', dot: 'bg-pink-500', label: 'Deadline' },
  'entry-other': { chip: 'bg-neutral-100 text-neutral-800', bar: 'border-neutral-500', dot: 'bg-neutral-500', label: 'Other entry' },
};
export const toneOf = (color: string): Tone => TONES[color] ?? TONES['entry-other'];

/** Legend groups shown under the calendar, keyed by the feed type that produces them. */
export const LEGEND: { source: FeedSource; colors: string[] }[] = [
  { source: 'booking', colors: ['event-confirmed', 'event-tentative'] },
  { source: 'consultation', colors: ['consultation'] },
  { source: 'payment', colors: ['payment', 'payment-overdue'] },
  { source: 'vendor', colors: ['vendor'] },
  { source: 'task', colors: ['task', 'task-high', 'task-overdue'] },
  { source: 'entry', colors: ['entry-meeting', 'entry-site_visit', 'entry-deadline', 'entry-other'] },
];

export const SOURCE_LABEL: Record<FeedSource, string> = {
  booking: 'Event',
  consultation: 'Consultation',
  payment: 'Payment due',
  vendor: 'Vendor delivery',
  task: 'Task deadline',
  entry: 'Calendar entry',
};

/** Local start and end Date objects for an item (end is exclusive for timed items). */
export function itemTimes(it: FeedItem) {
  if (it.allDay) {
    const s = parseYmd(it.start);
    const e = parseYmd(it.end || it.start);
    return { start: s, end: addDaysLocal(e < s ? s : e, 1) };
  }
  const s = new Date(it.start);
  const e = new Date(it.end || it.start);
  return { start: s, end: e < s ? s : e };
}

/** Day keys (local, midnight Date) that an item touches, clipped to [from, to). */
export function itemDays(it: FeedItem, from: Date, to: Date): Date[] {
  const { start, end } = itemTimes(it);
  const out: Date[] = [];
  let d = startOfDay(start);
  // For timed items, an end exactly at midnight does not occupy the next day.
  const lastMoment = end.getTime() > start.getTime() ? new Date(end.getTime() - 1) : end;
  const last = startOfDay(lastMoment);
  if (d < from) d = startOfDay(from);
  for (let i = 0; d <= last && d < to && i < 120; i++) {
    out.push(d);
    d = addDaysLocal(d, 1);
  }
  return out;
}

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Groups items by local day within [from, to). */
export function groupByDay(items: FeedItem[], from: Date, to: Date) {
  const map = new Map<string, FeedItem[]>();
  for (const it of items) for (const d of itemDays(it, from, to)) {
    const k = dayKey(d);
    const list = map.get(k) ?? [];
    list.push(it);
    map.set(k, list);
  }
  // All-day first, then by start time.
  for (const list of map.values()) list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || itemTimes(a).start.getTime() - itemTimes(b).start.getTime());
  return map;
}

export interface Placed {
  item: FeedItem;
  top: number; // minutes from day start
  height: number; // minutes
  lane: number;
  lanes: number;
}

/** Lays out timed items for one day into non-overlapping lanes. */
export function layoutDay(items: FeedItem[], day: Date): Placed[] {
  const dayStart = day.getTime();
  const dayEnd = addDaysLocal(day, 1).getTime();
  const rows = items
    .filter((i) => !i.allDay)
    .map((item) => {
      const { start, end } = itemTimes(item);
      const s = Math.max(start.getTime(), dayStart);
      const e = Math.min(Math.max(end.getTime(), s + 30 * 60_000), dayEnd);
      return { item, s, e };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const out: Placed[] = [];
  let cluster: { p: Placed; e: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.p.lane + 1));
    for (const c of cluster) c.p.lanes = lanes;
    cluster = [];
  };
  for (const r of rows) {
    if (r.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const laneEnds: number[] = [];
    for (const c of cluster) laneEnds[c.p.lane] = Math.max(laneEnds[c.p.lane] ?? -Infinity, c.e);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] > r.s) lane++;
    const p: Placed = { item: r.item, top: (r.s - dayStart) / 60_000, height: Math.max(24, (r.e - r.s) / 60_000), lane, lanes: 1 };
    cluster.push({ p, e: Math.max(r.e, r.s + 24 * 60_000) });
    clusterEnd = Math.max(clusterEnd, r.e, r.s + 24 * 60_000);
    out.push(p);
  }
  flush();
  return out;
}
