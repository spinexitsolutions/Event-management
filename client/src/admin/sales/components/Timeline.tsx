import { ArrowDownLeft, ArrowUpRight, Bot, Mail, MessageCircle, Phone, StickyNote, Users } from 'lucide-react';
import { fmtDateTime, fromNow, titleCase } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Communication } from '../lib';

const ICONS: Record<string, typeof Mail> = { NOTE: StickyNote, CALL: Phone, EMAIL: Mail, MEETING: Users, WHATSAPP: MessageCircle, SYSTEM: Bot };

const FIELD_LABELS: Record<string, string> = { assignedToId: 'Assignee', categoryId: 'Category', eventType: 'Event type', eventDate: 'Event date', guestCount: 'Guests', budgetRange: 'Budget', lostReason: 'Lost reason', status: 'Status', location: 'Location' };

/** Makes system change logs readable: field keys → labels, ids → names. */
function humanize(body: string, names?: Record<string, string>) {
  let out = body.replace(/^(\w+):/gm, (m, k: string) => (FIELD_LABELS[k] ? `${FIELD_LABELS[k]}:` : m));
  if (names) for (const [id, name] of Object.entries(names)) out = out.split(id).join(name);
  return out;
}

/** Communication log (all kinds, including SYSTEM events), newest first. */
export function Timeline({ items, authors, names }: { items: Communication[]; authors?: Record<string, string>; names?: Record<string, string> }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-adm-muted">No communication logged yet.</p>;
  return (
    <ol className="relative space-y-0">
      {items.map((c, i) => {
        const Icon = ICONS[c.kind] ?? StickyNote;
        const author = c.authorName ?? (c.authorId ? authors?.[c.authorId] : null) ?? (c.kind === 'SYSTEM' ? 'System' : c.direction === 'INBOUND' ? 'Client' : 'Staff');
        const system = c.kind === 'SYSTEM';
        return (
          <li key={c.id} className="relative flex gap-3 pb-5">
            {i < items.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-adm-line" aria-hidden />}
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white', system ? 'bg-adm-bg text-adm-muted' : 'bg-[#F5EEDF] text-[#7A5F2B]')}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-adm-muted">
                <span className="font-medium text-adm-ink">{c.kind === 'WHATSAPP' ? 'WhatsApp' : titleCase(c.kind)}</span>
                {c.direction !== 'INTERNAL' && (
                  <span className="inline-flex items-center gap-0.5">
                    {c.direction === 'INBOUND' ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                    {titleCase(c.direction)}
                  </span>
                )}
                <span aria-hidden>·</span>
                <span>{author}</span>
                <span aria-hidden>·</span>
                <time dateTime={c.createdAt} title={fmtDateTime(c.createdAt)}>
                  {fromNow(c.createdAt)}
                </time>
              </div>
              {c.subject && <p className="mt-1 text-sm font-medium">{c.subject}</p>}
              <p className={cn('mt-0.5 whitespace-pre-line break-words text-sm', system ? 'text-adm-muted' : 'text-adm-ink/90')}>{system ? humanize(c.body, { ...authors, ...names }) : c.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
