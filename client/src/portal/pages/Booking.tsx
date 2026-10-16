import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import { lazy, Suspense, useRef, type KeyboardEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Seo } from '@/components/ui/Seo';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { BookingDetail } from '../types';
import { BackLink, bookingTone, countdownLabel, daysUntil, PageSkeleton, Tag } from '../ui';

const OverviewTab = lazy(() => import('../booking/OverviewTab'));
const PaymentsTab = lazy(() => import('../booking/PaymentsTab'));
const PlanningTab = lazy(() => import('../booking/PlanningTab'));
const DocumentsTab = lazy(() => import('../booking/DocumentsTab'));
const MessagesTab = lazy(() => import('../booking/MessagesTab'));
const RequestsTab = lazy(() => import('../booking/RequestsTab'));
const FeedbackTab = lazy(() => import('../booking/FeedbackTab'));

type TabKey = 'overview' | 'payments' | 'planning' | 'documents' | 'messages' | 'requests' | 'feedback';

export default function Booking() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const q = useQuery({ queryKey: ['portal', 'booking', id], queryFn: () => api.get<BookingDetail>(`/portal/bookings/${id}`) });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data;

  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'payments', label: 'Payments' },
    { key: 'planning', label: 'Planning' },
    { key: 'documents', label: 'Documents', badge: b.documents.length || undefined },
    { key: 'messages', label: 'Messages' },
    { key: 'requests', label: 'Requests', badge: b.changeRequests.filter((c) => c.status === 'OPEN').length || undefined },
    ...(b.status === 'COMPLETED' ? [{ key: 'feedback' as const, label: 'Feedback' }] : []),
  ];
  const wanted = (params.get('feedback') === '1' ? 'feedback' : params.get('tab')) as TabKey | null;
  const active: TabKey = tabs.some((t) => t.key === wanted) ? (wanted as TabKey) : 'overview';
  const select = (key: TabKey) => {
    const next = new URLSearchParams(params);
    next.delete('feedback');
    if (key === 'overview') next.delete('tab');
    else next.set('tab', key);
    setParams(next, { replace: true });
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[n].key);
    tabRefs.current[tabs[n].key]?.focus();
  };
  const n = daysUntil(b.eventDate);
  const live = b.status !== 'COMPLETED' && b.status !== 'CANCELLED';

  return (
    <article>
      <Seo title={b.title} noIndex />
      <BackLink to="/portal">My events</BackLink>
      <header className="mt-8 grid gap-8 border-b border-line pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="eyebrow">Booking {b.reference}</p>
          <h1 className="t-h1 mt-4">{b.title}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
            <Tag tone={bookingTone(b.status)}>{b.statusLabel}</Tag>
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {b.eventDate ? fmtDate(b.eventDate, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be confirmed'}
              {b.eventEndDate && b.eventEndDate !== b.eventDate && <> – {fmtDate(b.eventEndDate)}</>}
            </span>
            {(b.venueName || b.city) && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden />
                {[b.venueName, b.city].filter(Boolean).join(', ')}
              </span>
            )}
            {b.guestCount && (
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4" aria-hidden /> {b.guestCount} guests
              </span>
            )}
          </div>
        </div>
        {live && n !== null && n >= 0 && (
          <div className="text-left lg:text-right">
            <p className="font-heading text-[3.6rem] leading-none text-primary">{n}</p>
            <p className="mt-2 text-[0.7rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
              {n === 1 ? 'day to go' : n === 0 ? countdownLabel(b.eventDate) : 'days to go'}
            </p>
          </div>
        )}
      </header>

      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
        <div role="tablist" aria-label="Booking sections" className="flex min-w-max gap-7 border-b border-line">
          {tabs.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => (tabRefs.current[t.key] = el)}
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={active === t.key}
              aria-controls={`panel-${t.key}`}
              tabIndex={active === t.key ? 0 : -1}
              onClick={() => select(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                '-mb-px inline-flex items-center gap-2 border-b-2 py-4 text-[0.72rem] uppercase transition-colors',
                active === t.key ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
              )}
              style={{ letterSpacing: '0.2em' }}
            >
              {t.label}
              {t.badge !== undefined && <span className="rounded-full bg-primary/15 px-1.5 text-[0.65rem] tracking-normal text-primary">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="pt-10 sm:pt-12" tabIndex={-1}>
        <Suspense
          fallback={
            <div className="space-y-4" aria-busy="true">
              <Skeleton className="h-32" />
              <Skeleton className="h-64" />
            </div>
          }
        >
          {active === 'overview' && <OverviewTab booking={b} onTab={select} />}
          {active === 'payments' && <PaymentsTab booking={b} />}
          {active === 'planning' && <PlanningTab booking={b} />}
          {active === 'documents' && <DocumentsTab booking={b} />}
          {active === 'messages' && <MessagesTab booking={b} />}
          {active === 'requests' && <RequestsTab booking={b} />}
          {active === 'feedback' && <FeedbackTab booking={b} />}
        </Suspense>
      </div>
    </article>
  );
}
