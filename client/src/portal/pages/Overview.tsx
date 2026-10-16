import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarDays, MapPin, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { INQUIRY_PUBLIC_LABELS } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { ButtonLink } from '@/components/ui/Button';
import { Seo } from '@/components/ui/Seo';
import { ErrorState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import type { Overview as OverviewData } from '../types';
import { bookingTone, countdownLabel, daysUntil, PageSkeleton, Panel, PROPOSAL_STATUS, SectionHead, Tag } from '../ui';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Overview() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['portal', 'overview'], queryFn: () => api.get<OverviewData>('/portal/overview') });

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { client, bookings, quotations, inquiries } = q.data;
  const firstName = (user?.name || client.name).split(/[\s—-]+/)[0];
  const nothing = !bookings.length && !quotations.length;
  const upcoming = bookings.filter((b) => b.status !== 'COMPLETED' && b.status !== 'CANCELLED');
  const past = bookings.filter((b) => b.status === 'COMPLETED' || b.status === 'CANCELLED');
  const awaiting = quotations.filter((x) => x.status === 'SENT' || x.status === 'VIEWED').length;

  return (
    <div className="space-y-16 sm:space-y-20">
      <Seo title="My events" noIndex />
      <header className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="eyebrow">Client portal</p>
          <h1 className="t-h1 mt-4">
            {greeting()}, <span className="italic text-primary">{firstName}</span>
          </h1>
          <p className="lead mt-4 max-w-2xl">
            {client.name}
            {upcoming.length > 0 && <> · {upcoming.length === 1 ? 'one event' : `${upcoming.length} events`} in planning</>}
            {awaiting > 0 && <> · {awaiting === 1 ? 'a proposal awaits' : `${awaiting} proposals await`} your review</>}
          </p>
        </div>
        <Panel className="flex items-center gap-4 p-5 sm:min-w-[300px]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary/40 font-heading text-lg text-primary" aria-hidden>
            {client.relationshipManager ? client.relationshipManager.name.slice(0, 1) : <UserRound className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
              Your relationship manager
            </p>
            <p className="mt-1 truncate text-ink">{client.relationshipManager?.name ?? 'Our planning team'}</p>
            <p className="truncate text-xs text-muted">{client.relationshipManager?.title || (client.relationshipManager ? 'Your planner' : 'A dedicated planner will be assigned')}</p>
          </div>
        </Panel>
      </header>

      {nothing && (
        <Panel className="px-6 py-16 text-center sm:px-16">
          <p className="eyebrow">Nothing here yet</p>
          <h2 className="t-h3 mx-auto mt-4 max-w-xl">Your proposals and events will appear here</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Once our team prepares a proposal for <span className="text-ink">{client.email}</span>, you’ll be able to review it, choose enhancements and confirm — all from this page.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/inquire">Plan an event</ButtonLink>
            <ButtonLink href="/contact" variant="secondary">
              Contact us
            </ButtonLink>
          </div>
        </Panel>
      )}

      {bookings.length > 0 && (
        <section aria-labelledby="events-h">
          <SectionHead eyebrow="Your events" title={upcoming.length ? 'In planning' : 'Your events'} id="events-h" />
          <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {[...upcoming, ...past].map((b) => {
              const d = b.eventDate ? new Date(`${b.eventDate}T00:00:00`) : null;
              const n = daysUntil(b.eventDate);
              const done = b.status === 'COMPLETED' || b.status === 'CANCELLED';
              return (
                <li key={b.id}>
                  <Link
                    to={`/portal/bookings/${b.id}`}
                    className="card group flex h-full flex-col border border-line p-7 transition-all duration-500 ease-lux hover:-translate-y-1 hover:border-primary/60 hover:shadow-[0_30px_60px_-40px_rgb(0_0_0/0.6)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <span className="font-heading text-[3.4rem] leading-none text-primary">{d ? d.getDate() : '—'}</span>
                        <span className="text-[0.7rem] uppercase leading-tight text-muted" style={{ letterSpacing: '0.2em' }}>
                          {d ? d.toLocaleDateString(undefined, { month: 'long' }) : 'Date'}
                          <br />
                          {d ? d.getFullYear() : 'to be confirmed'}
                        </span>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-muted transition-all duration-500 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                    </div>
                    {!done && n !== null && n >= 0 && (
                      <p className="mt-3 text-xs text-primary" aria-label={`Event ${countdownLabel(b.eventDate)}`}>
                        {countdownLabel(b.eventDate)}
                      </p>
                    )}
                    <h3 className="t-h4 mt-6 font-heading">{b.title}</h3>
                    <p className="mt-2 flex items-start gap-2 text-sm text-muted">
                      <MapPin className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span>{[b.venueName, b.city].filter(Boolean).join(', ') || 'Venue to be confirmed'}</span>
                    </p>
                    <div className="mt-auto pt-6">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                        <Tag tone={bookingTone(b.status)}>{b.statusLabel}</Tag>
                        <span className="text-xs text-muted">{b.manager ? `with ${b.manager.name}` : b.reference}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {quotations.length > 0 && (
        <section aria-labelledby="proposals-h">
          <SectionHead eyebrow="Proposals" title="Your proposals" id="proposals-h" />
          <Panel as="div" className="divide-y divide-line">
            {quotations.map((x) => {
              const st = PROPOSAL_STATUS[x.status];
              return (
                <Link key={x.id} to={`/portal/quotations/${x.id}`} className="group grid gap-3 px-6 py-5 transition-colors hover:bg-surface-2/60 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-8">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">
                      {x.number} · version {x.currentVersion}
                    </p>
                    <p className="mt-1 truncate font-heading text-xl">{x.title}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:justify-end">
                    <Tag tone={st.tone}>{st.label}</Tag>
                    {x.validUntil && (x.status === 'SENT' || x.status === 'VIEWED') && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Valid until {fmtDate(x.validUntil)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="font-heading text-xl text-ink">{money(x.versions[0]?.totalMinor, x.currency)}</span>
                    <ArrowUpRight className="h-4 w-4 text-muted transition-colors group-hover:text-primary" aria-hidden />
                  </div>
                </Link>
              );
            })}
          </Panel>
        </section>
      )}

      {inquiries.length > 0 && (
        <section aria-labelledby="inquiries-h">
          <SectionHead
            eyebrow="Inquiries"
            title="Recent inquiries"
            id="inquiries-h"
            action={
              <Link to="/inquire" className="btn btn-ghost">
                New inquiry
              </Link>
            }
          />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inquiries.map((i) => (
              <Panel as="li" key={i.reference} className="p-5">
                <p className="text-xs text-muted">
                  {i.reference} · {fmtDate(i.createdAt)}
                </p>
                <p className="mt-1.5 text-ink">{i.eventType || 'Event inquiry'}</p>
                <p className="mt-3 text-sm text-primary">{INQUIRY_PUBLIC_LABELS[i.status]}</p>
              </Panel>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
