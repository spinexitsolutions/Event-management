import { useMutation, useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, Camera, Check, Clock, Loader2, MapPin } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { Img } from '@/components/ui/Img';
import { Reveal } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { Spinner } from '@/components/ui/States';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { GalleryImage } from '@/lib/types';
import { GalleryGrid } from '@/sections/showcase';
import { ON_IMAGE_VARS } from '@/sections/Shell';
import { isNotFound } from '../components/page';

interface ScheduleItem {
  time: string;
  title: string;
  location: string;
}

/* ───────────── Shared bits ───────────── */

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const diff = new Date(target).getTime() - now;
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return { done: true, d: 0, h: 0, m: 0, s: 0 };
  return { done: false, d: Math.floor(diff / 864e5), h: Math.floor((diff / 36e5) % 24), m: Math.floor((diff / 6e4) % 60), s: Math.floor((diff / 1e3) % 60) };
}

export function Countdown({ target, className }: { target: string | null; className?: string }) {
  const c = useCountdown(target);
  if (!c) return null;
  if (c.done) return <p className={cn('font-heading text-2xl italic', className)}>The celebration has begun</p>;
  const cells: [number, string][] = [
    [c.d, 'Days'],
    [c.h, 'Hours'],
    [c.m, 'Minutes'],
    [c.s, 'Seconds'],
  ];
  return (
    <div className={cn('flex justify-center gap-6 sm:gap-10', className)} role="timer" aria-label={`${c.d} days, ${c.h} hours and ${c.m} minutes to go`}>
      {cells.map(([v, l]) => (
        <div key={l} className="text-center" aria-hidden>
          <span className="block font-heading text-4xl tabular-nums sm:text-5xl">{String(v).padStart(2, '0')}</span>
          <span className="mt-2 block text-[0.6rem] uppercase opacity-70" style={{ letterSpacing: '0.28em' }}>
            {l}
          </span>
        </div>
      ))}
    </div>
  );
}

function Ornament() {
  return (
    <div className="flex items-center justify-center gap-3 text-primary" aria-hidden>
      <span className="h-px w-12 bg-current opacity-60" />
      <span className="h-1.5 w-1.5 rotate-45 border border-current" />
      <span className="h-px w-12 bg-current opacity-60" />
    </div>
  );
}

function Schedule({ items }: { items: ScheduleItem[] }) {
  if (!items?.length) return null;
  return (
    <ol className="relative mx-auto max-w-2xl">
      {items.map((s, i) => (
        <li key={i} className="grid grid-cols-[5.5rem_1fr] gap-6 border-b border-line py-6 last:border-0 sm:grid-cols-[8rem_1fr]">
          <span className="font-heading text-xl text-primary">{s.time}</span>
          <div>
            <p className="t-h4 font-heading">{s.title}</p>
            {s.location && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                <MapPin className="h-3.5 w-3.5" /> {s.location}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function BareShell({ children }: { children: ReactNode }) {
  const { site } = useSite();
  return (
    <div className="min-h-screen bg-bg text-ink">
      {children}
      <footer className="border-t border-line py-10 text-center text-xs text-muted">
        {site && (
          <p>
            Designed & produced by{' '}
            <Link to="/" className="text-ink hover:text-primary">
              {site.brand.name}
            </Link>
          </p>
        )}
      </footer>
    </div>
  );
}

function CenterMessage({ title, body }: { title: string; body: string }) {
  return (
    <BareShell>
      <Seo title={title} noIndex />
      <div className="container-site flex min-h-[80vh] flex-col items-center justify-center text-center">
        <Ornament />
        <h1 className="t-h2 mt-8">{title}</h1>
        <p className="lead mt-4 max-w-md">{body}</p>
      </div>
    </BareShell>
  );
}

const longDate = (d: string | null) => (d ? fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');

/* ───────────── RSVP ───────────── */

type RsvpStatus = 'ATTENDING' | 'DECLINED' | 'MAYBE';
interface RsvpData {
  guest: { firstName: string; rsvpStatus: string; plusOnes: number; dietary: string; respondedAt: string | null; maxPlusOnes: number };
  event: { title: string; eventDate: string; eventEndDate: string | null; startTime: string; venueName: string; city: string };
  microsite: { slug: string; headline: string; message: string; coverImage: string; schedule: ScheduleItem[]; countdownTo: string | null } | null;
  rsvp: { open: boolean; closedReason: string; deadline: string | null };
}

export function RsvpPage() {
  const { code = '' } = useParams();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ['rsvp', code], queryFn: () => api.get<RsvpData>(`/public/rsvp/${encodeURIComponent(code)}`) });
  const [status, setStatus] = useState<RsvpStatus | ''>('');
  const [plusOnes, setPlusOnes] = useState(0);
  const [dietary, setDietary] = useState('');
  const [editing, setEditing] = useState(false);
  const [formError, setFormError] = useState('');
  useEffect(() => {
    if (!q.data) return;
    const g = q.data.guest;
    if (['ATTENDING', 'DECLINED', 'MAYBE'].includes(g.rsvpStatus)) setStatus(g.rsvpStatus as RsvpStatus);
    setPlusOnes(g.plusOnes);
    setDietary(g.dietary);
  }, [q.data]);
  const m = useMutation({
    mutationFn: () => api.post<{ rsvpStatus: string; plusOnes: number; dietary: string; respondedAt: string }>(`/public/rsvp/${encodeURIComponent(code)}`, { rsvpStatus: status, plusOnes: status === 'DECLINED' ? 0 : plusOnes, dietary }),
    onSuccess: () => {
      setEditing(false);
      void q.refetch();
    },
    onError: (err) => setFormError(errorMessage(err)),
  });

  if (q.isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink">
        <Spinner />
      </div>
    );
  if (q.error) return isNotFound(q.error) ? <CenterMessage title="Invitation not found" body="Please check the link in your invitation, or contact your host." /> : <CenterMessage title="Something went wrong" body={errorMessage(q.error)} />;
  const d = q.data!;
  const responded = !!d.guest.respondedAt && ['ATTENDING', 'DECLINED', 'MAYBE'].includes(d.guest.rsvpStatus);
  const showForm = d.rsvp.open && (!responded || editing);
  const cover = d.microsite?.coverImage;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!status) return setFormError('Please let us know whether you can attend.');
    setFormError('');
    m.mutate();
  };
  const answer = { ATTENDING: 'joyfully accepts', DECLINED: 'regretfully declines', MAYBE: 'is not yet sure' }[d.guest.rsvpStatus as RsvpStatus];

  return (
    <BareShell>
      <Seo title={`RSVP · ${d.event.title}`} noIndex />
      <div className="relative isolate flex min-h-screen items-center justify-center px-4 py-16 sm:py-24">
        <div className="absolute inset-0 -z-10">
          {cover ? (
            <>
              <Img src={cover} alt="" priority width={2200} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
              <div className="absolute inset-0 bg-black/55" />
            </>
          ) : (
            <div className="h-full w-full bg-surface" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgb(var(--c-primary) / 0.18), transparent 60%)' }} />
          )}
        </div>
        <motion.div initial={reduce ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-xl border border-primary/40 bg-bg/95 p-2 shadow-2xl backdrop-blur">
          <div className="border border-primary/25 px-6 py-12 text-center sm:px-12 sm:py-14">
            <p className="eyebrow">You are invited</p>
            <p className="mt-8 font-heading text-xl italic text-muted">Dear {d.guest.firstName},</p>
            <h1 className="t-h1 mt-4 text-balance">{d.microsite?.headline || d.event.title}</h1>
            {d.microsite?.headline && <p className="mt-3 text-muted">{d.event.title}</p>}
            <div className="my-10">
              <Ornament />
            </div>
            <ul className="space-y-3 text-[0.95rem]">
              <li className="flex items-center justify-center gap-2.5">
                <CalendarDays className="h-4 w-4 text-primary" strokeWidth={1.25} /> {longDate(d.event.eventDate)}
                {d.event.eventEndDate && d.event.eventEndDate !== d.event.eventDate && ` – ${fmtDate(d.event.eventEndDate, { day: 'numeric', month: 'long' })}`}
              </li>
              {d.event.startTime && (
                <li className="flex items-center justify-center gap-2.5">
                  <Clock className="h-4 w-4 text-primary" strokeWidth={1.25} /> {d.event.startTime}
                </li>
              )}
              {(d.event.venueName || d.event.city) && (
                <li className="flex items-center justify-center gap-2.5">
                  <MapPin className="h-4 w-4 text-primary" strokeWidth={1.25} /> {[d.event.venueName, d.event.city].filter(Boolean).join(', ')}
                </li>
              )}
            </ul>
            {d.microsite?.countdownTo && <Countdown target={d.microsite.countdownTo} className="mt-10" />}

            <div className="mt-12 border-t border-line pt-10" aria-live="polite">
              {!d.rsvp.open ? (
                <>
                  {responded && <p className="font-heading text-xl">Your reply: {d.guest.firstName} {answer}.</p>}
                  <p className="mt-3 text-sm text-muted">{d.rsvp.closedReason}</p>
                </>
              ) : showForm ? (
                <form onSubmit={submit} className="space-y-8 text-left" noValidate>
                  <fieldset>
                    <legend className="field-label mb-4 w-full text-center">Will you attend?</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['ATTENDING', 'Joyfully accept'],
                          ['MAYBE', 'Not sure yet'],
                          ['DECLINED', 'Regretfully decline'],
                        ] as [RsvpStatus, string][]
                      ).map(([v, l]) => (
                        <label key={v} className="chip cursor-pointer justify-center px-2 text-center text-xs has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary sm:text-sm" data-active={status === v}>
                          <input type="radio" name="rsvp" value={v} checked={status === v} onChange={() => setStatus(v)} className="sr-only" />
                          {l}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {status !== 'DECLINED' && d.guest.maxPlusOnes > 0 && (
                    <div>
                      <label htmlFor="plus" className="field-label">
                        Additional guests
                      </label>
                      <select id="plus" value={plusOnes} onChange={(e) => setPlusOnes(Number(e.target.value))} className="field-input cursor-pointer [&>option]:bg-surface">
                        {Array.from({ length: d.guest.maxPlusOnes + 1 }, (_, i) => (
                          <option key={i} value={i}>
                            {i === 0 ? 'Just me' : `+${i}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {status !== 'DECLINED' && (
                    <div>
                      <label htmlFor="diet" className="field-label">
                        Dietary requirements <span className="ml-1 normal-case tracking-normal opacity-60">(optional)</span>
                      </label>
                      <textarea id="diet" rows={2} maxLength={300} value={dietary} onChange={(e) => setDietary(e.target.value)} className="field-input resize-none" placeholder="Allergies, preferences…" />
                    </div>
                  )}
                  {formError && (
                    <p className="field-error text-center" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="flex flex-col items-center gap-3">
                    <button className="btn btn-primary w-full sm:w-auto" disabled={m.isPending}>
                      {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {m.isPending ? 'Sending…' : 'Send reply'}
                    </button>
                    {d.rsvp.deadline && <p className="text-xs text-muted">Kindly reply by {fmtDate(d.rsvp.deadline, { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
                    {responded && (
                      <button type="button" className="text-xs text-muted underline underline-offset-4" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div>
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-primary text-primary">
                    <Check className="h-5 w-5" strokeWidth={1.5} />
                  </span>
                  <p className="mt-6 font-heading text-2xl">Thank you, {d.guest.firstName}.</p>
                  <p className="mt-2 text-muted">
                    Your reply: {d.guest.firstName} {answer}
                    {d.guest.rsvpStatus !== 'DECLINED' && d.guest.plusOnes > 0 ? ` with ${d.guest.plusOnes} guest${d.guest.plusOnes > 1 ? 's' : ''}` : ''}.
                  </p>
                  <button type="button" className="btn btn-ghost btn-sm mt-6" onClick={() => setEditing(true)}>
                    Change my reply
                  </button>
                </div>
              )}
            </div>
            {d.microsite?.slug && (
              <Link to={`/e/${d.microsite.slug}`} className="mt-10 inline-block text-xs uppercase text-primary underline-offset-4 hover:underline" style={{ letterSpacing: '0.22em' }}>
                View the event page
              </Link>
            )}
          </div>
        </motion.div>
      </div>
      {d.microsite?.schedule && d.microsite.schedule.length > 0 && (
        <section className="section">
          <div className="container-site">
            <p className="eyebrow mb-4 text-center">The celebration</p>
            <h2 className="t-h2 mb-12 text-center">Schedule</h2>
            <Schedule items={d.microsite.schedule} />
          </div>
        </section>
      )}
    </BareShell>
  );
}

/* ───────────── Event microsite ───────────── */

interface Microsite {
  slug: string;
  title: string;
  eventDate: string;
  eventEndDate: string | null;
  startTime: string;
  venueName: string;
  city: string;
  headline: string;
  message: string;
  coverImage: string;
  schedule: ScheduleItem[];
  gallery: { url: string; alt: string; caption: string }[];
  photoShareUrl: string;
  countdownTo: string | null;
  rsvpEnabled: boolean;
  rsvpDeadline: string | null;
}

export function MicrositePage() {
  const { slug = '' } = useParams();
  const reduce = useReducedMotion();
  const q = useQuery({ queryKey: ['microsite', slug], queryFn: () => api.get<Microsite>(`/public/events/${encodeURIComponent(slug)}`) });
  if (q.isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink">
        <Spinner />
      </div>
    );
  if (q.error) return isNotFound(q.error) ? <CenterMessage title="Event page not found" body="This event page may not be published yet. Please check your link." /> : <CenterMessage title="Something went wrong" body={errorMessage(q.error)} />;
  const e = q.data!;
  const gallery: GalleryImage[] = (e.gallery ?? []).filter((g) => g.url).map((g) => ({ url: g.url, alt: g.alt || e.title, caption: g.caption }));
  return (
    <BareShell>
      <Seo title={e.headline || e.title} description={e.message.slice(0, 160)} image={e.coverImage} noIndex />
      <section className="on-image relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden bg-black px-4 text-center text-white" style={ON_IMAGE_VARS}>
        <motion.div className="absolute inset-0 -z-10" initial={reduce ? false : { scale: 1.1 }} animate={{ scale: 1 }} transition={{ duration: 3, ease: [0.22, 1, 0.36, 1] }}>
          <Img src={e.coverImage} alt="" priority width={2400} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/35 to-black/70" />
        <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.2, ease: [0.22, 1, 0.36, 1] }} className="max-w-4xl">
          <Ornament />
          <p className="mt-8 text-[0.72rem] uppercase text-white/80" style={{ letterSpacing: '0.34em' }}>
            {longDate(e.eventDate)}
          </p>
          <h1 className="t-display mt-6 text-balance text-white">{e.headline || e.title}</h1>
          {e.headline && <p className="mt-5 font-heading text-2xl italic text-white/80">{e.title}</p>}
          {(e.venueName || e.city) && (
            <p className="mt-6 flex items-center justify-center gap-2 text-white/80">
              <MapPin className="h-4 w-4" strokeWidth={1.25} /> {[e.venueName, e.city].filter(Boolean).join(', ')}
            </p>
          )}
          {e.countdownTo && <Countdown target={e.countdownTo} className="mt-12 text-white" />}
        </motion.div>
      </section>

      {e.message && (
        <section className="section">
          <Reveal className="container-site mx-auto max-w-2xl text-center">
            <Ornament />
            <p className="mt-10 whitespace-pre-line font-heading text-[clamp(1.35rem,2.2vw,1.8rem)] leading-relaxed">{e.message}</p>
          </Reveal>
        </section>
      )}

      {e.schedule?.length > 0 && (
        <section className="section bg-variant-surface">
          <div className="container-site">
            <p className="eyebrow mb-4 text-center">The celebration</p>
            <h2 className="t-h2 mb-12 text-center">Schedule</h2>
            <Schedule items={e.schedule} />
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="section">
          <div className="container-site">
            <p className="eyebrow mb-4 text-center">Moments</p>
            <h2 className="t-h2 mb-12 text-center">Gallery</h2>
            <GalleryGrid images={gallery} variant="masonry" label="Event gallery" />
          </div>
        </section>
      )}

      {(e.photoShareUrl || e.rsvpEnabled) && (
        <section className="section bg-variant-surface">
          <div className="container-site mx-auto max-w-2xl text-center">
            {e.photoShareUrl && (
              <>
                <Camera className="mx-auto h-8 w-8 text-primary" strokeWidth={1} />
                <h2 className="t-h2 mt-6">Share your photographs</h2>
                <p className="lead mt-4">Help us remember every moment — add the photos you take to our shared album.</p>
                <a href={e.photoShareUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-8">
                  Open the shared album
                </a>
              </>
            )}
            {e.rsvpEnabled && <p className={cn('text-sm text-muted', e.photoShareUrl && 'mt-12')}>To reply, please use the personal RSVP link in your invitation{e.rsvpDeadline ? ` by ${fmtDate(e.rsvpDeadline, { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.</p>}
          </div>
        </section>
      )}
    </BareShell>
  );
}
