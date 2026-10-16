import { Check, Diamond } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { BookingDetail, PlanItem } from '../types';
import { daysUntil, Panel, SectionHead, Tag, type Tone } from '../ui';

const STATUS: Record<PlanItem['status'], { label: string; tone: Tone }> = {
  TODO: { label: 'Planned', tone: 'muted' },
  IN_PROGRESS: { label: 'In progress', tone: 'gold' },
  BLOCKED: { label: 'Waiting on details', tone: 'warning' },
  DONE: { label: 'Done', tone: 'success' },
};

export default function PlanningTab({ booking: b }: { booking: BookingDetail }) {
  const items = b.milestones;
  const done = items.filter((i) => i.status === 'DONE').length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  const phases = [...new Set(items.map((i) => i.phase || 'General'))];

  if (!items.length)
    return (
      <Panel className="px-6 py-16 text-center">
        <p className="eyebrow">Planning</p>
        <h2 className="t-h3 mt-4">Your plan is being prepared</h2>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted">Your event manager will share milestones and key dates here as planning progresses.</p>
      </Panel>
    );

  return (
    <div className="space-y-12">
      <section aria-labelledby="prog-h" className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="relative h-28 w-28" role="img" aria-label={`${progress}% of shared milestones complete`}>
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="3" className="stroke-line" />
            <circle cx="50" cy="50" r="45" fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-1000" strokeDasharray={2 * Math.PI * 45} strokeDashoffset={2 * Math.PI * 45 * (1 - progress / 100)} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center font-heading text-3xl">{progress}%</span>
        </div>
        <div>
          <p className="eyebrow">Planning progress</p>
          <h2 id="prog-h" className="t-h3 mt-2">
            {done} of {items.length} milestones complete
          </h2>
          <p className="mt-2 text-sm text-muted">Shared by your event team — updated as each piece falls into place.</p>
        </div>
      </section>

      {phases.map((phase) => (
        <section key={phase} aria-label={phase}>
          <SectionHead eyebrow="Phase" title={phase} />
          <ol className="relative ml-3 border-l border-line">
            {items
              .filter((i) => (i.phase || 'General') === phase)
              .map((i) => {
                const st = STATUS[i.status];
                const d = daysUntil(i.dueAt);
                const late = i.status !== 'DONE' && d !== null && d < 0;
                return (
                  <li key={i.id} className="relative pb-8 pl-8 last:pb-0">
                    <span
                      className={cn(
                        'absolute -left-[9px] top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-bg',
                        i.status === 'DONE' ? 'border-primary bg-primary text-on-primary' : i.status === 'IN_PROGRESS' ? 'border-primary text-primary' : 'border-line text-muted',
                      )}
                      aria-hidden
                    >
                      {i.status === 'DONE' ? <Check className="h-2.5 w-2.5" /> : i.isMilestone ? <Diamond className="h-2 w-2" /> : null}
                    </span>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn('text-ink', i.isMilestone && 'font-heading text-xl', i.status === 'DONE' && 'text-ink/70')}>{i.title}</p>
                        <p className={cn('mt-0.5 text-xs', late ? 'text-danger' : 'text-muted')}>
                          {i.status === 'DONE' && i.completedAt ? `Completed ${fmtDate(i.completedAt)}` : i.dueAt ? `${late ? 'Was due' : 'Due'} ${fmtDate(i.dueAt)}` : 'Date to be confirmed'}
                          {i.isMilestone && ' · Key milestone'}
                        </p>
                      </div>
                      <Tag tone={st.tone}>{st.label}</Tag>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
