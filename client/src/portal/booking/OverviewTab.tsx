import { Check, Mail, MessageSquare, Phone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { fmtDate, money } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { BookingDetail } from '../types';
import { KV, Panel, SectionHead } from '../ui';

const STEPS = [
  { label: 'Proposal accepted', note: 'Your selections are locked in.' },
  { label: 'Agreement', note: 'Sign the event agreement.' },
  { label: 'Advance payment', note: 'Secures your date and team.' },
  { label: 'Confirmed', note: 'Planning in full swing.' },
  { label: 'Event', note: 'The day itself.' },
  { label: 'Final payment', note: 'Settle the remaining balance.' },
  { label: 'Completed', note: 'Thank you for celebrating with us.' },
];
/** Index of the step currently in progress; everything before it is done. */
const CURRENT: Record<string, number> = { AWAITING_CONTRACT: 1, AWAITING_ADVANCE: 2, CONFIRMED: 3, IN_PROGRESS: 4, AWAITING_FINAL_PAYMENT: 5, COMPLETED: 7 };

export default function OverviewTab({ booking: b, onTab }: { booking: BookingDetail; onTab: (t: 'payments' | 'messages' | 'feedback') => void }) {
  const current = CURRENT[b.status] ?? 0;
  const cancelled = b.status === 'CANCELLED';
  const nextInstallment = b.installments.find((i) => i.status === 'PENDING' || i.status === 'PARTIAL');

  return (
    <div className="space-y-14">
      {cancelled ? (
        <Notice tone="error">This booking has been cancelled. If you have questions, please message your planner.</Notice>
      ) : (
        <section aria-labelledby="journey-h">
          <SectionHead eyebrow="Your journey" title="Where things stand" id="journey-h" />
          <Panel className="p-6 sm:p-8">
            <ol className="grid gap-6 md:grid-cols-7 md:gap-3">
              {STEPS.map((s, i) => {
                const done = i < current;
                const now = i === current;
                return (
                  <li key={s.label} className="relative flex gap-4 md:block" aria-current={now ? 'step' : undefined}>
                    {i < STEPS.length - 1 && (
                      <span
                        className={cn('absolute left-[13px] top-8 h-[calc(100%-0.5rem)] w-px md:left-8 md:top-[13px] md:h-px md:w-[calc(100%-1.25rem)]', done ? 'bg-primary' : 'bg-line')}
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition-colors',
                        done && 'border-primary bg-primary text-on-primary',
                        now && 'border-primary bg-bg text-primary ring-4 ring-primary/15',
                        !done && !now && 'border-line bg-bg text-muted',
                      )}
                      aria-hidden
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <div className="md:mt-4 md:pr-2">
                      <p className={cn('text-sm', now ? 'text-primary' : done ? 'text-ink' : 'text-muted')}>{s.label}</p>
                      <p className="mt-0.5 text-xs leading-snug text-muted">{now ? 'In progress — ' + s.note.charAt(0).toLowerCase() + s.note.slice(1) : s.note}</p>
                      <span className="sr-only">{done ? '(completed)' : now ? '(current step)' : '(upcoming)'}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {b.paymentsEnabled && nextInstallment && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
                <p className="text-sm text-muted">
                  Next payment: <span className="text-ink">{nextInstallment.label}</span> · {money(nextInstallment.amountMinor - nextInstallment.paidMinor, b.currency)}
                  {nextInstallment.dueDate && <> · due {fmtDate(nextInstallment.dueDate)}</>}
                </p>
                <Button size="sm" onClick={() => onTab('payments')}>
                  View &amp; pay
                </Button>
              </div>
            )}
            {b.status === 'AWAITING_CONTRACT' && <p className="mt-8 border-t border-line pt-6 text-sm text-muted">Your planner will share the agreement for signature. Payments open once it is signed.</p>}
            {b.status === 'COMPLETED' && !b.feedback && (
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
                <p className="text-sm text-muted">We’d love to hear how everything went.</p>
                <Button size="sm" onClick={() => onTab('feedback')}>
                  Share feedback
                </Button>
              </div>
            )}
          </Panel>
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-14">
          <section aria-labelledby="details-h">
            <SectionHead eyebrow="The event" title="Details" id="details-h" />
            <Panel className="grid grid-cols-2 gap-6 p-6 sm:p-8 md:grid-cols-3">
              <KV label="Date">{b.eventDate ? fmtDate(b.eventDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'To be confirmed'}</KV>
              {b.eventEndDate && b.eventEndDate !== b.eventDate && <KV label="Until">{fmtDate(b.eventEndDate)}</KV>}
              <KV label="Start time">{b.startTime || 'To be confirmed'}</KV>
              <KV label="Venue">{b.venueName || 'To be confirmed'}</KV>
              <KV label="City">{b.city || '—'}</KV>
              <KV label="Guests">{b.guestCount ?? '—'}</KV>
              <KV label="Contract value">{money(b.contractValueMinor, b.currency)}</KV>
              <KV label="Agreement">{b.contractSignedAt ? `Signed ${fmtDate(b.contractSignedAt)}` : 'Awaiting signature'}</KV>
            </Panel>
          </section>

          <section aria-labelledby="services-h">
            <SectionHead eyebrow="Included" title="Your services" id="services-h" />
            {b.services.length ? (
              <ul className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2" style={{ borderRadius: 'var(--radius)' }}>
                {b.services.map((s, i) => (
                  <li key={i} className="bg-surface p-6">
                    <p className="font-heading text-xl">{s.name}</p>
                    {s.description && <p className="mt-2 text-sm leading-relaxed text-muted">{s.description}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Your service list will appear here once finalised.</p>
            )}
          </section>

          <section aria-labelledby="notes-h">
            <SectionHead eyebrow="From your team" title="Notes" id="notes-h" />
            {b.clientVisibleNotes ? (
              <Panel className="p-6 sm:p-8">
                <div className="divider-gold mb-5" />
                <p className="whitespace-pre-line leading-relaxed text-ink/90">{b.clientVisibleNotes}</p>
              </Panel>
            ) : (
              <p className="text-sm text-muted">Your planner will share notes and updates here as plans take shape.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Panel className="p-6 sm:p-8">
            <p className="eyebrow">Your event manager</p>
            {b.manager ? (
              <>
                <div className="mt-5 flex items-center gap-4">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 font-heading text-2xl text-primary" aria-hidden>
                    {b.manager.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-heading text-xl">{b.manager.name}</p>
                    {b.manager.title && <p className="text-xs text-muted">{b.manager.title}</p>}
                  </div>
                </div>
                <ul className="mt-6 space-y-3 text-sm">
                  <li>
                    <a href={`mailto:${b.manager.email}`} className="inline-flex items-center gap-3 break-all text-muted hover:text-primary">
                      <Mail className="h-4 w-4 shrink-0" aria-hidden /> {b.manager.email}
                    </a>
                  </li>
                  {b.manager.phone && (
                    <li>
                      <a href={`tel:${b.manager.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-3 text-muted hover:text-primary">
                        <Phone className="h-4 w-4 shrink-0" aria-hidden /> {b.manager.phone}
                      </a>
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">A dedicated event manager will be assigned shortly. Meanwhile, our team reads every message.</p>
            )}
            <Button variant="secondary" size="sm" className="mt-7 w-full" icon={<MessageSquare className="h-4 w-4" />} onClick={() => onTab('messages')}>
              Send a message
            </Button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
