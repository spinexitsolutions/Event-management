import { Check, Loader2, Video, Phone, MapPin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { trackInquirySchema } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { HeaderSpacer } from '@/components/layout/PublicLayout';
import { Reveal } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, titleCase } from '@/lib/format';
import { TextInput } from '../components/fields';
import { Breadcrumbs } from '../components/page';

interface TrackResult {
  reference: string;
  status: string;
  statusLabel: string;
  eventType: string;
  eventDate: string | null;
  location: string;
  guestCount: number;
  submittedAt: string;
  planner: string | null;
  consultations: { scheduledAt: string; mode: string; status: string }[];
  hasProposal: boolean;
}

const STAGES = ['Inquiry received', 'Planner in touch', 'Consultation', 'Preparing your proposal', 'Proposal shared', 'Booking'];
const STAGE_OF: Record<string, number> = { NEW: 0, CONTACTED: 1, CONSULTATION_SCHEDULED: 2, REQUIREMENTS_RECEIVED: 3, QUOTATION_SENT: 4, NEGOTIATION: 4, WON: 5 };

export function TrackPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [reference, setReference] = useState((params.get('ref') ?? '').toUpperCase());
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TrackResult | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = trackInquirySchema.safeParse({ reference, email });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setError('');
    setLoading(true);
    try {
      setResult(await api.post<TrackResult>('/public/inquiries/track', parsed.data));
    } catch (err) {
      setResult(null);
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const closed = result && !(result.status in STAGE_OF);
  const stage = result ? (STAGE_OF[result.status] ?? -1) : -1;

  return (
    <>
      <Seo title="Track your inquiry" description="Check the status of your event inquiry with your reference and email." noIndex />
      <HeaderSpacer />
      <section className="container-site pb-section pt-12 md:pt-20">
        <div className="grid gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Track inquiry' }]} />
            <p className="eyebrow mb-5 mt-10">Your inquiry</p>
            <h1 className="t-h1 text-balance">Track your inquiry</h1>
            <p className="lead mt-6">Enter the reference from your confirmation and the email you used. We will show where things stand.</p>
            <form onSubmit={submit} noValidate className="mt-12 space-y-8">
              <TextInput label="Reference" name="reference" id="track-ref" placeholder="INQ-XXXXXX" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} error={errors.reference} autoComplete="off" className="font-heading text-xl tracking-wider" />
              <TextInput label="Email" name="email" id="track-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
              {error && !Object.keys(errors).length && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <button className="btn btn-primary" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Checking…' : 'Check status'}
              </button>
            </form>
          </Reveal>

          <div className="lg:col-span-6 lg:col-start-7" aria-live="polite">
            {result ? (
              <Reveal className="card p-8 md:p-10">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-8">
                  <div>
                    <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.24em' }}>
                      {result.reference}
                    </p>
                    <h2 className="t-h3 mt-2 font-heading">{result.statusLabel}</h2>
                  </div>
                  <span className="text-xs text-muted">Submitted {fmtDate(result.submittedAt)}</span>
                </div>
                <dl className="grid grid-cols-2 gap-6 border-b border-line py-8 text-sm">
                  <div>
                    <dt className="text-muted">Occasion</dt>
                    <dd className="mt-1">{result.eventType}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Date</dt>
                    <dd className="mt-1">{result.eventDate ? fmtDate(result.eventDate, { day: 'numeric', month: 'long', year: 'numeric' }) : 'To be decided'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Location</dt>
                    <dd className="mt-1">{result.location}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Guests</dt>
                    <dd className="mt-1">{result.guestCount.toLocaleString()}</dd>
                  </div>
                  {result.planner && (
                    <div className="col-span-2">
                      <dt className="text-muted">Your planner</dt>
                      <dd className="mt-1 font-heading text-lg">{result.planner}</dd>
                    </div>
                  )}
                </dl>

                {closed ? (
                  <p className="pt-8 text-sm text-muted">This inquiry is closed. If you would like to plan something new, we would love to hear from you.</p>
                ) : (
                  <ol className="relative space-y-7 pt-8">
                    {STAGES.map((s, i) => {
                      const done = i < stage || (i === stage && result.status === 'WON');
                      const current = i === stage && !done;
                      return (
                        <li key={s} className="relative flex gap-5">
                          {i < STAGES.length - 1 && <span className={cn('absolute left-[11px] top-7 h-[calc(100%+0.25rem)] w-px', i < stage ? 'bg-primary' : 'bg-line')} aria-hidden />}
                          <span className={cn('relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', done ? 'border-primary bg-primary text-on-primary' : current ? 'border-primary bg-surface' : 'border-line bg-surface')}>
                            {done ? <Check className="h-3 w-3" strokeWidth={2.5} /> : current ? <span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> : null}
                          </span>
                          <div className="-mt-0.5">
                            <p className={cn(current ? 'text-ink' : done ? 'text-ink/80' : 'text-muted')}>
                              {s}
                              {current && <span className="sr-only"> (current stage)</span>}
                            </p>
                            {i === 2 && result.consultations.length > 0 && (
                              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                                {result.consultations.map((c, k) => (
                                  <li key={k} className="flex items-center gap-2">
                                    {c.mode === 'VIDEO' ? <Video className="h-3.5 w-3.5" /> : c.mode === 'PHONE' ? <Phone className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                                    {fmtDateTime(c.scheduledAt)} · {titleCase(c.mode)} {c.status === 'COMPLETED' && '· completed'}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {result.hasProposal && (
                  <div className="mt-10 border border-primary/40 bg-primary/5 p-6">
                    <p className="font-heading text-xl">Your proposal is ready</p>
                    <p className="mt-2 text-sm text-muted">Sign in to your client portal to review the proposal, request changes or accept it.</p>
                    <Link to={user ? '/portal' : '/login?next=/portal'} className="btn btn-primary btn-sm mt-5">
                      {user ? 'Open my portal' : 'Sign in to the portal'}
                    </Link>
                  </div>
                )}
              </Reveal>
            ) : (
              <div className="hidden h-full min-h-[360px] items-center justify-center rounded-theme-img border border-dashed border-line p-10 text-center text-sm text-muted lg:flex">
                <p className="max-w-xs">Your inquiry status will appear here — every step from first call to booking.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
