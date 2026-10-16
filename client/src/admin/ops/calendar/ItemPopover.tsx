import { ArrowUpRight, Clock, MapPin, Pencil, User, X } from 'lucide-react';
import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/admin/ui';
import { fmtDate, money, titleCase } from '@/lib/format';
import { fmtTime, sameDay } from '../shared';
import { itemTimes, SOURCE_LABEL, toneOf, ENTRY_TYPE_LABELS, type EntryType, type FeedItem } from './model';

const linkLabel: Record<string, string> = {
  booking: 'Open booking',
  consultation: 'Open inquiry',
  payment: 'Open booking finance',
  vendor: 'Open booking vendors',
  task: 'Open task in booking',
  entry: 'Open linked booking',
};

export function whenLabel(it: FeedItem) {
  const { start, end } = itemTimes(it);
  if (it.allDay) {
    const last = new Date(end.getTime() - 86_400_000);
    return sameDay(start, last) ? `${fmtDate(start, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · All day` : `${fmtDate(start)} – ${fmtDate(last)} · All day`;
  }
  if (start.getTime() === end.getTime()) return `${fmtDate(start, { weekday: 'short', day: 'numeric', month: 'short' })} · due ${fmtTime(start)}`;
  return sameDay(start, end)
    ? `${fmtDate(start, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(start)} – ${fmtTime(end)}`
    : `${fmtDate(start)} ${fmtTime(start)} – ${fmtDate(end)} ${fmtTime(end)}`;
}

function details(it: FeedItem): [string, string][] {
  const m = (it.meta ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  const rows: [string, string][] = [];
  switch (it.source) {
    case 'booking':
      rows.push(['Reference', s(m.reference)], ['Start time', s(m.startTime)], ['Venue', [s(m.venueName), s(m.city)].filter(Boolean).join(', ')], ['Guests', s(m.guestCount)]);
      break;
    case 'consultation':
      rows.push(['Inquiry', s(m.inquiryReference)], ['Event type', s(m.eventType)], ['Mode', m.mode ? titleCase(String(m.mode)) : ''], ['Location', s(m.location)]);
      break;
    case 'payment': {
      const cur = s(m.currency) || 'INR';
      rows.push(['Booking', s(m.reference)], ['Amount', money(Number(m.amountMinor ?? 0), cur)], ['Paid so far', money(Number(m.paidMinor ?? 0), cur)]);
      break;
    }
    case 'vendor':
      rows.push(['Booking', [s(m.reference), s(m.bookingTitle)].filter(Boolean).join(' · ')], ['PO number', s(m.poNumber)]);
      break;
    case 'task':
      rows.push(['Booking', [s(m.reference), s(m.bookingTitle)].filter(Boolean).join(' · ')], ['Phase', s(m.phase)], ['Priority', m.priority ? titleCase(String(m.priority)) : '']);
      break;
    case 'entry': {
      const venue = m.venue as { name?: string } | null;
      const booking = m.booking as { reference?: string; title?: string } | null;
      rows.push(['Type', ENTRY_TYPE_LABELS[it.type as EntryType] ?? titleCase(it.type)], ['Venue', venue?.name ?? ''], ['Booking', booking ? `${booking.reference} · ${booking.title}` : '']);
      break;
    }
  }
  return rows.filter(([, v]) => v);
}

/** Anchored popover with an item's details. Closes on Escape or outside click; focus moves in and is restored. */
export function ItemPopover({ item, anchor, onClose, onEdit, canEdit }: { item: FeedItem; anchor: DOMRect; onClose: () => void; onEdit: (entryId: string) => void; canEdit: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.left, top: anchor.bottom + 6 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(Math.max(8, anchor.left), vw - w - 8);
    let top = anchor.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, anchor.top - h - 6);
    if (vw < 640) {
      left = 8;
      top = Math.max(8, vh - h - 8);
    }
    setPos({ left, top });
  }, [anchor]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      prev?.focus?.();
    };
  }, [onClose]);
  const tone = toneOf(item.color);
  const notes = item.source === 'entry' ? String((item.meta as Record<string, unknown> | undefined)?.notes ?? '') : '';
  const entryId = item.source === 'entry' ? String((item.meta as Record<string, unknown> | undefined)?.entryId ?? '') : '';
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={item.title}
      className="fixed z-[120] w-[min(340px,calc(100vw-16px))] rounded-xl border border-adm-line bg-white p-4 text-sm shadow-2xl outline-none"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-adm-muted">{SOURCE_LABEL[item.source]}</p>
          <h3 className="mt-0.5 font-semibold leading-snug">{item.title}</h3>
        </div>
        <button className="-mr-1 -mt-1 rounded-md p-1 text-adm-muted hover:bg-adm-bg hover:text-adm-ink" onClick={onClose} aria-label="Close details">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <p className="flex items-center gap-2 text-adm-ink">
          <Clock className="h-3.5 w-3.5 text-adm-muted" aria-hidden /> {whenLabel(item)}
        </p>
        {item.assignee && (
          <p className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-adm-muted" aria-hidden /> {item.assignee.name}
          </p>
        )}
        {item.source === 'booking' && Boolean(item.meta?.venueName) && (
          <p className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-adm-muted" aria-hidden /> {String(item.meta?.venueName)}
          </p>
        )}
      </div>
      {item.status && (
        <div className="mt-3">
          <StatusBadge status={item.status} />
        </div>
      )}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        {details(item).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-adm-muted">{k}</dt>
            <dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-adm-bg px-3 py-2 text-[13px] text-adm-ink">{notes}</p>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {entryId && canEdit && (
          <button className="adm-btn-secondary px-3 py-1.5 text-xs" onClick={() => onEdit(entryId)}>
            <Pencil className="h-3.5 w-3.5" /> Edit entry
          </button>
        )}
        {item.link && (
          <Link to={item.link} className="adm-btn-primary px-3 py-1.5 text-xs">
            {linkLabel[item.source]} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}
