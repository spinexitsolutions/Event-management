import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Download, FileText, Plus, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { milestoneDueDate, type QuoteTotals } from '@maison/shared';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Seo } from '@/components/ui/Seo';
import { ErrorState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, money, pct } from '@/lib/format';
import { Notice } from '@/auth/ui';
import type { Proposal as ProposalData, ProposalLine } from '../types';
import { BackLink, KV, PageSkeleton, Panel, PROPOSAL_STATUS, qty, SectionHead, Tag } from '../ui';

const OPEN = ['SENT', 'VIEWED'];

function dueText(m: QuoteTotals['milestones'][number], eventDate: string | null) {
  const base =
    m.due === 'ON_ACCEPTANCE'
      ? 'On acceptance'
      : m.due === 'ON_EVENT_DAY'
        ? 'On the event day'
        : m.due === 'DAYS_BEFORE_EVENT'
          ? `${m.days} days before the event`
          : m.due === 'DAYS_AFTER_EVENT'
            ? `${m.days} days after the event`
            : 'Fixed date';
  const date = m.due === 'ON_ACCEPTANCE' ? null : milestoneDueDate(m, eventDate);
  return date ? `${base} · ${fmtDate(date)}` : base;
}

export default function Proposal() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ['portal', 'proposal', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<ProposalData>(`/portal/quotations/${id}`) });
  const data = q.data;

  const initialSelected = useMemo(() => (data ? data.lines.filter((l) => l.optional && l.selected).map((l) => l.id) : []), [data]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const sel = selected ?? initialSelected;
  const [preview, setPreview] = useState<QuoteTotals | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const reqId = useRef(0);
  const [modal, setModal] = useState<'accept' | 'revise' | 'reject' | null>(null);

  // Reset local selection whenever a new version arrives from the server.
  useEffect(() => {
    setSelected(null);
    setPreview(null);
  }, [data?.version, data?.status]);

  // Debounced server-side recalculation of totals for the chosen enhancements (nothing is saved).
  useEffect(() => {
    if (!data || selected === null) return;
    const same = selected.length === initialSelected.length && selected.every((x) => initialSelected.includes(x));
    if (same) {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    setPreviewing(true);
    const my = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const totals = await api.post<QuoteTotals>(`/portal/quotations/${id}/preview`, { selectedOptionalIds: selected });
        if (my === reqId.current) {
          setPreview(totals);
          setPreviewError(null);
        }
      } catch (err) {
        if (my === reqId.current) setPreviewError(errorMessage(err));
      } finally {
        if (my === reqId.current) setPreviewing(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [selected, initialSelected, data, id]);

  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const open = OPEN.includes(data.status);
  const totals = preview ?? data.totals;
  const st = PROPOSAL_STATUS[data.status];
  const core = data.lines.filter((l) => !l.optional);
  const optional = data.lines.filter((l) => l.optional);
  const lineTotal = (l: ProposalLine) => totals.lines.find((x) => x.id === l.id);
  const toggle = (lineId: string) => setSelected(sel.includes(lineId) ? sel.filter((x) => x !== lineId) : [...sel, lineId]);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ['portal', 'overview'] });
  };

  return (
    <article className={cn('space-y-12', open && 'pb-20 lg:pb-0')}>
      <Seo title={data.title} noIndex />
      <div className="space-y-8">
        <BackLink to="/portal">My events</BackLink>
        <header className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">
              Proposal {data.number} · Version {data.version}
            </p>
            <h1 className="t-h1 mt-4 max-w-4xl">{data.title}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Tag tone={st.tone}>{st.label}</Tag>
              {data.validUntil && open && <span className="text-sm text-muted">Valid until {fmtDate(data.validUntil)}</span>}
            </div>
          </div>
          <a href={api.url(`/portal/quotations/${id}/pdf`)} className="btn btn-secondary btn-sm self-start lg:self-end" download>
            <Download className="h-4 w-4" aria-hidden /> Download PDF
          </a>
        </header>
        <StatusBanner data={data} />
        <Panel className="grid grid-cols-2 gap-6 p-6 sm:p-8 md:grid-cols-4">
          <KV label="Event date">{data.eventDate ? fmtDate(data.eventDate, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'To be confirmed'}</KV>
          <KV label="Venue">{data.venue || 'To be confirmed'}</KV>
          <KV label="Guests">{data.guestCount ?? '—'}</KV>
          <KV label="Valid until">{data.validUntil ? fmtDate(data.validUntil) : '—'}</KV>
        </Panel>
      </div>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0 space-y-14">
          {data.intro && (
            <section>
              <div className="divider-gold mb-6" />
              <p className="whitespace-pre-line font-heading text-[1.45rem] leading-[1.55] text-ink/90 sm:text-[1.6rem]">{data.intro}</p>
            </section>
          )}

          <section aria-labelledby="scope-h">
            <SectionHead eyebrow="The proposal" title="What’s included" id="scope-h" />
            <Panel className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_70px_130px_140px] gap-4 border-b border-line px-6 py-3 text-[0.66rem] uppercase text-muted md:grid" style={{ letterSpacing: '0.18em' }}>
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit price</span>
                <span className="text-right">Total</span>
              </div>
              <ul className="divide-y divide-line">
                {core.map((l) => {
                  const t = lineTotal(l);
                  return (
                    <li key={l.id} className="grid gap-2 px-6 py-5 md:grid-cols-[minmax(0,1fr)_70px_130px_140px] md:gap-4">
                      <div className="min-w-0">
                        <p className="text-ink">{l.name}</p>
                        {l.description && <p className="mt-1 text-sm leading-relaxed text-muted">{l.description}</p>}
                        {l.discountBps > 0 && t && (
                          <p className="mt-2 text-xs text-primary">
                            Includes {pct(l.discountBps)} courtesy discount (−{money(t.discountMinor, data.currency)})
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-muted md:text-right md:text-ink">
                        <span className="md:hidden">Qty </span>
                        {qty(l.quantityX100)}
                        {l.unit && <span className="text-muted"> {l.unit}</span>}
                      </p>
                      <p className="text-sm text-muted md:text-right md:text-ink">
                        <span className="md:hidden">at </span>
                        {money(l.unitPriceMinor, data.currency)}
                      </p>
                      <p className="text-ink md:text-right">{money(t?.netMinor, data.currency)}</p>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </section>

          {optional.length > 0 && (
            <section aria-labelledby="enh-h">
              <SectionHead eyebrow="Make it yours" title="Optional enhancements" id="enh-h" />
              <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted">
                {open ? 'Select any enhancements you’d like included — your total updates instantly. Your choices are confirmed when you accept.' : 'Enhancements offered with this proposal.'}
              </p>
              <ul className="grid gap-4 sm:grid-cols-2">
                {optional.map((l) => {
                  const on = sel.includes(l.id);
                  const t = lineTotal(l);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={!open}
                        onClick={() => toggle(l.id)}
                        className={cn(
                          'card group flex h-full w-full flex-col border p-6 text-left transition-all duration-500 ease-lux',
                          on ? 'border-primary bg-primary/[0.06]' : 'border-line hover:border-primary/50',
                          !open && 'cursor-default opacity-80',
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <Sparkles className={cn('h-5 w-5', on ? 'text-primary' : 'text-muted')} aria-hidden />
                          <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border transition-colors', on ? 'border-primary bg-primary text-on-primary' : 'border-line text-muted')} aria-hidden>
                            {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                        <p className="mt-5 font-heading text-xl">{l.name}</p>
                        {l.description && <p className="mt-2 text-sm leading-relaxed text-muted">{l.description}</p>}
                        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                          <span className="text-xs text-muted">
                            {qty(l.quantityX100)} {l.unit || '×'} {money(l.unitPriceMinor, data.currency)}
                            {l.discountBps > 0 && <span className="text-primary"> · {pct(l.discountBps)} off</span>}
                          </span>
                          <span className="font-heading text-lg text-ink">+{money(t?.netMinor, data.currency)}</span>
                        </div>
                        <span className="sr-only">{on ? 'Included' : 'Not included'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {data.terms && (
            <section>
              <details className="card group border border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="eyebrow block">The fine print</span>
                    <span className="t-h4 mt-1 block font-heading">Terms &amp; conditions</span>
                  </span>
                  <ChevronDown className="h-5 w-5 text-muted transition-transform duration-300 group-open:rotate-180" aria-hidden />
                </summary>
                <div className="whitespace-pre-line border-t border-line px-6 py-6 text-sm leading-relaxed text-muted">{data.terms}</div>
              </details>
            </section>
          )}

          {data.history.length > 1 && (
            <section aria-labelledby="hist-h">
              <SectionHead eyebrow="History" title="Versions" id="hist-h" />
              <ol className="space-y-0 border-l border-line pl-6">
                {data.history.map((h) => (
                  <li key={h.version} className="relative pb-5 last:pb-0">
                    <span className={cn('absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border', h.version === data.version ? 'border-primary bg-primary' : 'border-line bg-bg')} aria-hidden />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-ink">
                        Version {h.version}
                        {h.version === data.version && <span className="ml-2 text-xs text-primary">current</span>}
                      </p>
                      <p className="font-heading text-lg">{money(h.totalMinor, data.currency)}</p>
                    </div>
                    <p className="text-xs text-muted">{fmtDateTime(h.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Panel className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Investment</p>
              {previewing && (
                <span className="inline-flex items-center gap-2 text-xs text-muted">
                  <Spinner className="h-3 w-3" /> Updating
                </span>
              )}
            </div>
            <dl className="mt-6 space-y-3 text-sm" aria-live="polite" aria-busy={previewing}>
              <Row label="Services">{money(totals.subtotalMinor, data.currency)}</Row>
              {totals.discountMinor > 0 && <Row label="Discount">−{money(totals.discountMinor, data.currency)}</Row>}
              {data.fees.map((f) => (
                <Row key={f.name} label={f.name}>
                  {money(f.amountMinor, data.currency)}
                </Row>
              ))}
              {totals.taxes.map((t) => (
                <Row key={t.name} label={`${t.name} (${pct(t.rateBps)})`}>
                  {money(t.amountMinor, data.currency)}
                </Row>
              ))}
              <div className="!mt-6 flex items-end justify-between gap-4 border-t border-line pt-5">
                <dt className="text-[0.7rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                  Total
                </dt>
                <dd className={cn('font-heading text-[2.1rem] leading-none text-ink transition-opacity', previewing && 'opacity-50')}>{money(totals.totalMinor, data.currency)}</dd>
              </div>
            </dl>
            {previewError && <p className="mt-3 text-xs text-danger" role="alert">{previewError}</p>}

            <div className="mt-8 border-t border-line pt-6">
              <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                Payment schedule
              </p>
              <ol className="mt-4 space-y-4">
                {totals.milestones.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-ink">
                        {m.label} <span className="text-muted">· {pct(m.shareBps)}</span>
                      </p>
                      <p className="text-xs text-muted">{dueText(m, data.eventDate)}</p>
                    </div>
                    <p className="shrink-0 text-sm text-ink">{money(m.amountMinor, data.currency)}</p>
                  </li>
                ))}
              </ol>
            </div>

            {open && (
              <div className="mt-8 space-y-3">
                <Button className="w-full" onClick={() => setModal('accept')} disabled={previewing}>
                  Accept proposal
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="secondary" size="sm" onClick={() => setModal('revise')}>
                    Request changes
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setModal('reject')}>
                    Decline
                  </Button>
                </div>
                {data.validUntil && <p className="pt-1 text-center text-xs text-muted">This proposal is valid until {fmtDate(data.validUntil)}.</p>}
              </div>
            )}
          </Panel>
        </aside>
      </div>

      {open && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="container-site flex items-center justify-between gap-4 py-3">
            <div className="min-w-0" aria-live="polite">
              <p className="text-[0.62rem] uppercase text-muted" style={{ letterSpacing: '0.2em' }}>
                Total{previewing ? ' · updating' : ''}
              </p>
              <p className={cn('font-heading text-2xl leading-tight', previewing && 'opacity-50')}>{money(totals.totalMinor, data.currency)}</p>
            </div>
            <Button size="sm" onClick={() => setModal('accept')} disabled={previewing}>
              Accept
            </Button>
          </div>
        </div>
      )}

      <AcceptModal
        open={modal === 'accept'}
        onClose={() => setModal(null)}
        data={data}
        totalMinor={totals.totalMinor}
        selected={sel}
        onDone={() => {
          setModal(null);
          toast.success('Proposal accepted', 'Thank you! Your planner will be in touch with the agreement and next steps.');
          refresh();
        }}
      />
      <RespondModal
        mode={modal === 'revise' || modal === 'reject' ? modal : null}
        onClose={() => setModal(null)}
        id={id}
        onDone={(mode) => {
          setModal(null);
          toast.success(mode === 'revise' ? 'Request sent' : 'Proposal declined', mode === 'revise' ? 'Your planner will prepare an updated proposal.' : 'Thank you for letting us know.');
          refresh();
        }}
      />
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function StatusBanner({ data }: { data: ProposalData }) {
  switch (data.status) {
    case 'ACCEPTED':
    case 'CONVERTED':
      return (
        <Notice tone="success">
          <p className="text-ink">{data.status === 'CONVERTED' ? 'Your event is booked. This proposal is now part of your booking.' : 'You accepted this proposal. Our team is preparing your agreement and booking.'}</p>
          {data.bookingId && (
            <Link to={`/portal/bookings/${data.bookingId}`} className="mt-1 inline-block text-primary underline underline-offset-4">
              Go to your booking
            </Link>
          )}
        </Notice>
      );
    case 'REVISION_REQUESTED':
      return (
        <Notice>
          <p className="text-ink">You asked for changes — your planner is preparing an updated proposal.</p>
          {data.clientComment && <p className="mt-2 border-l-2 border-primary/50 pl-3 italic text-muted">“{data.clientComment}”</p>}
        </Notice>
      );
    case 'REJECTED':
      return (
        <Notice tone="error">
          <p className="text-ink">You declined this proposal.</p>
          {data.clientComment && <p className="mt-2 italic text-muted">“{data.clientComment}”</p>}
          <p className="mt-1 text-muted">Changed your mind? Contact your planner and we’ll gladly prepare a new proposal.</p>
        </Notice>
      );
    case 'EXPIRED':
      return (
        <Notice>
          <p className="text-ink">This proposal has expired.</p>
          <p className="mt-1 text-muted">
            Prices and availability may have changed.{' '}
            <Link to="/contact" className="text-primary underline underline-offset-4">
              Ask us for an updated proposal
            </Link>
            .
          </p>
        </Notice>
      );
    default:
      return null;
  }
}

function AcceptModal({ open, onClose, data, totalMinor, selected, onDone }: { open: boolean; onClose: () => void; data: ProposalData; totalMinor: number; selected: string[]; onDone: () => void }) {
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.post(`/portal/quotations/${data.id}/accept`, { selectedOptionalIds: selected, agree: true }),
    onSuccess: () => {
      setAgree(false);
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const chosen = data.lines.filter((l) => l.optional && selected.includes(l.id));
  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="site"
      size="md"
      title="Accept this proposal"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!agree} loading={m.isPending} onClick={() => m.mutate()}>
            Accept &amp; continue
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-5">
          <span className="text-sm text-muted">{data.title}</span>
          <span className="font-heading text-2xl">{money(totalMinor, data.currency)}</span>
        </div>
        {chosen.length > 0 ? (
          <div>
            <p className="field-label">Enhancements included</p>
            <ul className="space-y-1 text-sm">
              {chosen.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden /> {l.name}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          data.lines.some((l) => l.optional) && <p className="text-sm text-muted">No optional enhancements selected.</p>
        )}
        <p className="text-sm leading-relaxed text-muted">
          <FileText className="mr-1 inline h-4 w-4 align-[-2px]" aria-hidden />
          After you accept, your planner sends the agreement. Your first payment of <span className="text-ink">{money(Math.round((totalMinor * (data.totals.milestones[0]?.shareBps ?? 0)) / 10_000), data.currency)}</span> opens once the agreement is signed.
        </p>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--c-primary))]" />
          <span>I have read and agree to the terms and conditions of this proposal.</span>
        </label>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}

function RespondModal({ mode, onClose, id, onDone }: { mode: 'revise' | 'reject' | null; onClose: () => void; id: string; onDone: (mode: 'revise' | 'reject') => void }) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (action: 'revise' | 'reject') => api.post(`/portal/quotations/${id}/respond`, { action, comment: comment.trim() }),
    onSuccess: (_d, action) => {
      setComment('');
      setError(null);
      onDone(action);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const revise = mode === 'revise';
  const tooShort = revise && comment.trim().length < 5;
  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      tone="site"
      size="md"
      title={revise ? 'Request changes' : 'Decline proposal'}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={tooShort} loading={m.isPending} onClick={() => mode && m.mutate(mode)}>
            {revise ? 'Send request' : 'Decline proposal'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {revise ? 'Tell your planner what you’d like to adjust — dates, guest count, services or budget. We’ll send you an updated version.' : 'We’re sorry this one wasn’t right. If you’re happy to share why, it helps us improve.'}
        </p>
        <div>
          <label htmlFor="respond-comment" className="field-label">
            {revise ? 'What would you like to change? (required)' : 'Reason (optional)'}
          </label>
          <textarea
            id="respond-comment"
            rows={5}
            maxLength={3000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="field-input resize-y border px-3"
            aria-invalid={error ? true : undefined}
            aria-describedby={revise ? 'respond-hint' : undefined}
          />
          {revise && (
            <p id="respond-hint" className="mt-1.5 text-xs text-muted">
              At least 5 characters.
            </p>
          )}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
