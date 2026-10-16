import { ArrowLeft } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { QuotationStatus } from '@maison/shared';
import { Skeleton } from '@/components/ui/States';
import { cn } from '@/lib/cn';

export type Tone = 'gold' | 'success' | 'muted' | 'danger' | 'warning';

export function Tag({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap border px-2.5 py-1 text-[0.66rem] font-medium uppercase leading-none',
        tone === 'gold' && 'border-primary/50 bg-primary/10 text-primary',
        tone === 'success' && 'border-success/40 bg-success/10 text-success',
        tone === 'danger' && 'border-danger/40 bg-danger/10 text-danger',
        tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
        tone === 'muted' && 'border-line text-muted',
        className,
      )}
      style={{ letterSpacing: '0.16em', borderRadius: 'var(--btn-radius)' }}
    >
      {children}
    </span>
  );
}

/** A themed panel: surface background with a hairline border. */
export function Panel({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'li' } & HTMLAttributes<HTMLElement>) {
  return (
    <As className={cn('card border border-line', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionHead({ eyebrow, title, action, id }: { eyebrow?: string; title: string; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 id={id} className="t-h3 mt-2">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-[0.7rem] uppercase text-muted transition-colors hover:text-primary" style={{ letterSpacing: '0.2em' }}>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {children}
    </Link>
  );
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
        {label}
      </dt>
      <dd className="mt-1.5 text-[0.95rem] text-ink">{children}</dd>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-12 w-2/3" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Whole days from today (local) to a YYYY-MM-DD date. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function countdownLabel(date: string | null | undefined): string | null {
  const n = daysUntil(date);
  if (n === null) return null;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1) return `In ${n} days`;
  if (n === -1) return 'Yesterday';
  return `${Math.abs(n)} days ago`;
}

export const PROPOSAL_STATUS: Record<QuotationStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'In preparation', tone: 'muted' },
  SENT: { label: 'Awaiting your review', tone: 'gold' },
  VIEWED: { label: 'Awaiting your review', tone: 'gold' },
  REVISION_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Declined', tone: 'danger' },
  EXPIRED: { label: 'Expired', tone: 'muted' },
  CONVERTED: { label: 'Confirmed as booking', tone: 'success' },
};

export function bookingTone(status: string): Tone {
  if (status === 'CANCELLED') return 'danger';
  if (status === 'COMPLETED') return 'muted';
  if (status === 'AWAITING_ADVANCE' || status === 'AWAITING_FINAL_PAYMENT' || status === 'AWAITING_CONTRACT') return 'gold';
  return 'success';
}

export const qty = (x100: number) => (x100 % 100 === 0 ? String(x100 / 100) : (x100 / 100).toFixed(2).replace(/0$/, ''));
