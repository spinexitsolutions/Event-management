import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Ban, CalendarCheck, Copy, FileDown, History, Info, MessageSquare, Plus, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { calculateQuote, CURRENCIES, quotePricingInputSchema, type QuotePricingInput } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate, fmtDateTime, money, pct, titleCase } from '@/lib/format';
import { Badge, Card, ConfirmDialog, Input, PageHeader, Select, StatusBadge, Textarea, Toggle } from '@/admin/ui';
import { Field as KitField } from '@/admin/ui';
import { CopyField, PanelError, SkeletonBlock, MoneyInput, SearchInput, Field } from '../components/common';
import { newLineId, Scaled100Input } from '../components/quoteInputs';
import { dueLabel, QuoteTotals } from '../components/QuoteTotals';
import { isoDay, useStaff, type ClientRow, type InquiryDetail, type QuotationFull, type QuotationVersion, type QuoteDefaults } from '../lib';

type Line = QuotePricingInput['lines'][number];
type Milestone = QuotePricingInput['milestones'][number];
interface Meta { title: string; eventDate: string; venue: string; guestCount: string; currency: string; validUntil: string }
interface Content { intro: string; terms: string; notes: string; pricing: QuotePricingInput }

const EDITABLE = ['DRAFT', 'SENT', 'VIEWED', 'REVISION_REQUESTED', 'REJECTED', 'EXPIRED'];
const SENDABLE = ['DRAFT', 'REVISION_REQUESTED', 'SENT', 'VIEWED', 'EXPIRED', 'REJECTED'];
const DUE_OPTIONS = [
  { value: 'ON_ACCEPTANCE', label: 'On acceptance' },
  { value: 'DAYS_BEFORE_EVENT', label: 'Before event' },
  { value: 'ON_EVENT_DAY', label: 'On event day' },
  { value: 'DAYS_AFTER_EVENT', label: 'After event' },
  { value: 'FIXED_DATE', label: 'Fixed date' },
];

const blankLine = (p: Partial<Line> = {}): Line => ({ id: newLineId(), serviceId: null, name: '', description: '', quantityX100: 100, unit: '', unitPriceMinor: 0, discountBps: 0, optional: false, selected: true, taxable: true, ...p });
const versionToContent = (v: QuotationVersion): Content => ({
  intro: v.intro,
  terms: v.terms,
  notes: v.notes,
  pricing: { lines: v.lines.map((l) => ({ ...blankLine(), ...l })), discountType: v.discountType, discountValue: v.discountValue, taxes: v.taxes, fees: v.fees.map((f) => ({ ...f, taxable: f.taxable ?? false })), milestones: v.milestones.map((m) => ({ ...m, days: m.days ?? 0, date: m.date ?? '' })) },
});
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

export default function QuotationEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const isNew = !id;
  const inquiryParam = sp.get('inquiryId');
  const clientParam = sp.get('clientId');

  const defaults = useQuery({ queryKey: ['quote-defaults'], queryFn: () => api.get<QuoteDefaults>('/admin/quotations/defaults'), staleTime: 5 * 60_000 });
  const quote = useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<QuotationFull>(`/admin/quotations/${id}`), enabled: !!id, refetchOnWindowFocus: false });
  const inquiry = useQuery({ queryKey: ['inquiry', inquiryParam], queryFn: () => api.get<InquiryDetail>(`/admin/inquiries/${inquiryParam}`), enabled: isNew && !!inquiryParam });
  const client = useQuery({ queryKey: ['client-lite', clientParam], queryFn: () => api.get<{ id: string; name: string; email: string }>(`/admin/clients/${clientParam}`), enabled: isNew && !!clientParam && !inquiryParam });

  const err = defaults.error ?? quote.error ?? inquiry.error ?? client.error;
  if (err) return <PanelError error={err} onRetry={() => [defaults, quote, inquiry, client].forEach((x) => x.isError && x.refetch())} />;
  const ready = defaults.data && (isNew ? (!inquiryParam || inquiry.data) && (!clientParam || inquiryParam || client.data) : quote.data);
  if (!ready)
    return (
      <div className="space-y-4" aria-busy>
        <SkeletonBlock className="h-14 w-1/2" />
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <SkeletonBlock className="h-[520px]" />
          <SkeletonBlock className="h-80" />
        </div>
      </div>
    );
  return (
    <Editor
      key={quote.data ? `${quote.data.id}:${quote.data.currentVersion}:${quote.data.status}` : 'new'}
      defaults={defaults.data!}
      quote={quote.data ?? null}
      inquiry={inquiry.data ?? null}
      presetClient={inquiry.data ? { id: inquiry.data.client.id, name: inquiry.data.client.name, email: inquiry.data.client.email } : (client.data ?? null)}
    />
  );
}

function Editor({ defaults, quote, inquiry, presetClient }: { defaults: QuoteDefaults; quote: QuotationFull | null; inquiry: InquiryDetail | null; presetClient: { id: string; name: string; email: string } | null }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const current = quote?.versions.find((v) => v.version === quote.currentVersion) ?? null;

  const [meta, setMeta] = useState<Meta>(() =>
    quote
      ? { title: quote.title, eventDate: quote.eventDate ?? '', venue: quote.venue, guestCount: quote.guestCount ? String(quote.guestCount) : '', currency: quote.currency, validUntil: quote.validUntil ?? '' }
      : {
          title: inquiry ? `${inquiry.eventType} — ${inquiry.name}` : '',
          eventDate: inquiry?.eventDate?.slice(0, 10) ?? '',
          venue: inquiry?.location ?? '',
          guestCount: inquiry ? String(inquiry.guestCount) : '',
          currency: defaults.currency,
          validUntil: addDays(defaults.validityDays),
        },
  );
  const [content, setContent] = useState<Content>(() =>
    current
      ? versionToContent(current)
      : { intro: '', terms: defaults.terms, notes: '', pricing: { lines: [blankLine()], discountType: 'NONE', discountValue: 0, taxes: defaults.taxes, fees: [], milestones: defaults.milestones } },
  );
  const [clientSel, setClientSel] = useState(presetClient);
  const [dirty, setDirty] = useState(false);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<'send' | 'withdraw' | 'convert' | 'history' | null>(null);
  const [sendResult, setSendResult] = useState<{ deliveredByEmail: boolean; portalInviteUrl: string | null } | null>(null);
  const [viewVersion, setViewVersion] = useState<QuotationVersion | null>(null);

  const status = quote?.status ?? 'DRAFT';
  const editable = !quote || EDITABLE.includes(status);
  const locked = !!current?.lockedAt;
  const currency = meta.currency;
  const pricing = content.pricing;
  const totals = useMemo(() => calculateQuote(pricing), [pricing]);
  const milestoneSum = pricing.milestones.reduce((s, m) => s + m.shareBps, 0);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const upd = (fn: (c: Content) => Content) => {
    setContent(fn);
    setDirty(true);
  };
  const updPricing = (fn: (p: QuotePricingInput) => QuotePricingInput) => upd((c) => ({ ...c, pricing: fn(c.pricing) }));
  const updLine = (i: number, patch: Partial<Line>) => updPricing((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const setM = (patch: Partial<Meta>) => {
    setMeta((m) => ({ ...m, ...patch }));
    setDirty(true);
  };

  const metaBody = () => ({ title: meta.title, eventDate: meta.eventDate || null, venue: meta.venue, guestCount: meta.guestCount ? Number(meta.guestCount) : null, currency: meta.currency, validUntil: meta.validUntil || null });

  const validate = (): boolean => {
    const out: Record<string, string> = {};
    if (!meta.title.trim()) out['meta.title'] = 'Add a title';
    if (!quote && !clientSel) out.clientId = 'Choose a client';
    const r = quotePricingInputSchema.safeParse(pricing);
    if (!r.success) for (const i of r.error.issues) out[`content.pricing.${i.path.join('.')}`] ??= i.message;
    setErrs(out);
    if (Object.keys(out).length) {
      toast.error('Please fix the highlighted fields', Object.values(out)[0]);
      return false;
    }
    return true;
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { meta: metaBody(), content };
      if (quote) return api.put<{ id: string; currentVersion: number }>(`/admin/quotations/${quote.id}`, body);
      return api.post<{ id: string; currentVersion: number }>('/admin/quotations', { ...body, clientId: clientSel!.id, inquiryId: inquiry?.id ?? null, aiDrafted });
    },
    onSuccess: (r) => {
      setDirty(false);
      setErrs({});
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      if (!quote) {
        toast.success('Quotation created', 'Saved as a draft.');
        nav(`/admin/quotations/${r.id}`, { replace: true });
      } else {
        toast.success(r.currentVersion > quote.currentVersion ? `Saved as version ${r.currentVersion}` : 'Quotation saved', r.currentVersion > quote.currentVersion ? 'The sent version is preserved in the history.' : undefined);
        void qc.invalidateQueries({ queryKey: ['quotation', quote.id] });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrs(e.fieldErrors);
      toast.error('Could not save quotation', errorMessage(e));
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      if (dirty) await api.put(`/admin/quotations/${quote!.id}`, { meta: metaBody(), content });
      return api.post<{ ok: boolean; deliveredByEmail: boolean; portalInviteUrl: string | null }>(`/admin/quotations/${quote!.id}/send`);
    },
    onSuccess: (r) => {
      setDirty(false);
      setSendResult(r);
      setModal('send');
      void qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrs(e.fieldErrors);
      toast.error('Could not send quotation', errorMessage(e));
    },
  });
  const duplicate = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/admin/quotations/${quote!.id}/duplicate`),
    onSuccess: (r) => {
      toast.success('Duplicated', 'You are now editing the copy.');
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      nav(`/admin/quotations/${r.id}`);
    },
    onError: (e) => toast.error('Could not duplicate', errorMessage(e)),
  });
  const withdraw = useMutation({
    mutationFn: () => api.post(`/admin/quotations/${quote!.id}/cancel`),
    onSuccess: () => {
      toast.success('Quotation withdrawn', 'It is now marked as expired.');
      setModal(null);
      void qc.invalidateQueries({ queryKey: ['quotation', quote!.id] });
      void qc.invalidateQueries({ queryKey: ['quotations'] });
    },
    onError: (e) => toast.error('Could not withdraw', errorMessage(e)),
  });
  const ai = useMutation({
    mutationFn: () => api.post<{ intro: string; lines: Line[]; note: string }>('/admin/quotations/ai-draft', { inquiryId: quote?.inquiryId ?? inquiry!.id }),
    onSuccess: (r) => {
      if (!r.lines.length) return toast.info('No suggestions', 'The AI could not match catalogue services to this inquiry.');
      upd((c) => {
        const keep = c.pricing.lines.filter((l) => l.name.trim());
        return { ...c, intro: c.intro || r.intro, pricing: { ...c.pricing, lines: [...keep, ...r.lines.map((l) => ({ ...blankLine(), ...l, id: newLineId() }))] } };
      });
      setAiDrafted(true);
      setAiNote(r.note);
      toast.success('AI draft added', 'Review every line before saving.');
    },
    onError: (e) => toast.error('AI draft unavailable', errorMessage(e)),
  });

  const err = (path: string) => errs[path];
  const generalErrors = Object.entries(errs).filter(([k]) => !/^content\.pricing\.(lines|taxes|fees)\.\d+\./.test(k) && !k.startsWith('content.pricing.milestones.') && k !== 'meta.title' && k !== 'clientId');

  const addService = (sid: string) => {
    const s = defaults.services.find((x) => x.id === sid);
    if (!s) return;
    updPricing((p) => ({ ...p, lines: [...p.lines.filter((l) => l.name.trim() || l.unitPriceMinor), blankLine({ serviceId: s.id, name: s.name, unit: s.defaultUnit, unitPriceMinor: Number(s.defaultPriceMinor ?? 0) })] }));
  };
  const importPackage = (pid: string) => {
    const pk = defaults.packages.find((x) => x.id === pid);
    if (!pk) return;
    const lines = [
      ...pk.services.map((s) => blankLine({ serviceId: s.id, name: s.name, unit: s.defaultUnit, unitPriceMinor: Number(s.defaultPriceMinor ?? 0), description: `${pk.name} package` })),
      ...pk.addOns.map((a) => blankLine({ name: a.name, description: a.description, unitPriceMinor: Number(a.priceMinor ?? 0), optional: true, selected: false })),
    ];
    if (!lines.length) return toast.info('Nothing to import', 'This package has no linked services or add-ons.');
    updPricing((p) => ({ ...p, lines: [...p.lines.filter((l) => l.name.trim() || l.unitPriceMinor), ...lines] }));
    toast.success(`Imported “${pk.name}”`, `${pk.services.length} services${pk.addOns.length ? `, ${pk.addOns.length} optional add-ons` : ''}.`);
  };
  const move = (i: number, d: -1 | 1) => updPricing((p) => {
    const lines = [...p.lines];
    const j = i + d;
    if (j < 0 || j >= lines.length) return p;
    [lines[i], lines[j]] = [lines[j], lines[i]];
    return { ...p, lines };
  });

  const ro = !editable;
  const canAi = defaults.aiAvailable && editable && !!(quote?.inquiryId ?? inquiry?.id);

  return (
    <div className="pb-24 xl:pb-0">
      <PageHeader
        back={{ to: '/admin/quotations', label: 'Quotations' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {quote ? quote.number : 'New quotation'}
            {quote && <StatusBadge status={status} />}
            {quote && <span className="text-sm font-normal text-adm-muted">v{quote.currentVersion}</span>}
            {dirty && <Badge tone="amber">Unsaved changes</Badge>}
          </span>
        }
        subtitle={
          quote ? (
            <>
              For{' '}
              <Link to={`/admin/clients/${quote.client.id}`} className="text-adm-ink hover:underline">
                {quote.client.name}
              </Link>
              {quote.inquiry && (
                <>
                  {' · '}
                  <Link to={`/admin/inquiries/${quote.inquiry.id}`} className="hover:underline">
                    {quote.inquiry.reference}
                  </Link>
                </>
              )}
              {quote.sentAt && ` · sent ${fmtDate(quote.sentAt)}`}
              {quote.booking && (
                <>
                  {' · booking '}
                  <Link to={`/admin/bookings/${quote.booking.id}`} className="text-adm-gold hover:underline">
                    {quote.booking.reference}
                  </Link>
                </>
              )}
            </>
          ) : (
            'Build the proposal; totals are recalculated on the server when you save.'
          )
        }
        actions={
          <>
            {canAi && (
              <button className="adm-btn-secondary" disabled={ai.isPending} onClick={() => ai.mutate()}>
                <Sparkles className="h-4 w-4" /> {ai.isPending ? 'Drafting…' : 'AI draft'}
              </button>
            )}
            {quote && (
              <>
                <button className="adm-btn-secondary" onClick={() => setModal('history')}>
                  <History className="h-4 w-4" /> Versions ({quote.versions.length})
                </button>
                <a className="adm-btn-secondary" href={api.url(`/admin/quotations/${quote.id}/pdf`, { version: quote.currentVersion })} target="_blank" rel="noopener">
                  <FileDown className="h-4 w-4" /> PDF
                </a>
                <button className="adm-btn-secondary" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
                  <Copy className="h-4 w-4" /> Duplicate
                </button>
                {!['ACCEPTED', 'CONVERTED', 'EXPIRED'].includes(status) && (
                  <button className="adm-btn-ghost text-red-700 hover:text-red-800" onClick={() => setModal('withdraw')}>
                    <Ban className="h-4 w-4" /> Withdraw
                  </button>
                )}
              </>
            )}
          </>
        }
      />

      {quote && <ResponseBanner quote={quote} />}
      {editable && locked && (
        <Notice tone="info" icon={<Info className="h-4 w-4" />}>
          Version {quote!.currentVersion} was sent to the client and is locked. Saving changes creates <strong>version {quote!.currentVersion + 1}</strong> as a draft — the sent version stays in the history. Send again to share the new version.
        </Notice>
      )}
      {ro && (
        <Notice tone="neutral" icon={<Info className="h-4 w-4" />}>
          This quotation is {titleCase(status).toLowerCase()} and can no longer be edited. Duplicate it to start a new proposal.
        </Notice>
      )}
      {(aiDrafted || current?.aiDrafted) && (
        <Notice tone="violet" icon={<Sparkles className="h-4 w-4" />}>
          <strong>AI draft</strong> — {aiNote ?? 'lines were suggested by AI from the approved catalogue.'} Check quantities, prices and wording before sending.
        </Notice>
      )}
      {generalErrors.length > 0 && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5">
            {generalErrors.map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card title="Details">
            <fieldset disabled={ro} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {!quote && (
                <KitField label="Client" required error={errs.clientId} className="sm:col-span-2 lg:col-span-3">
                  {clientSel ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-adm-line bg-adm-bg/50 px-3 py-2">
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium">{clientSel.name}</span> <span className="text-adm-muted">· {clientSel.email}</span>
                        {inquiry && <span className="text-adm-muted"> · for inquiry {inquiry.reference}</span>}
                      </span>
                      {!inquiry && (
                        <button type="button" className="text-xs text-adm-gold hover:underline" onClick={() => setClientSel(null)}>
                          Change
                        </button>
                      )}
                    </div>
                  ) : (
                    <ClientPicker onPick={(c) => setClientSel(c)} />
                  )}
                </KitField>
              )}
              <Field label="Title" required error={err('meta.title')} className="sm:col-span-2 lg:col-span-3">
                <Input value={meta.title} maxLength={160} invalid={!!err('meta.title')} onChange={(e) => setM({ title: e.target.value })} placeholder="e.g. Lakeside wedding weekend" />
              </Field>
              <Field label="Event date" error={err('meta.eventDate')}>
                <Input type="date" value={meta.eventDate} onChange={(e) => setM({ eventDate: e.target.value })} />
              </Field>
              <Field label="Venue" error={err('meta.venue')}>
                <Input value={meta.venue} maxLength={200} onChange={(e) => setM({ venue: e.target.value })} />
              </Field>
              <Field label="Guests" error={err('meta.guestCount')}>
                <Input type="number" min={1} max={100000} value={meta.guestCount} onChange={(e) => setM({ guestCount: e.target.value })} />
              </Field>
              <Field label="Currency">
                <Select value={meta.currency} onChange={(e) => setM({ currency: e.target.value })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </Field>
              <Field label="Valid until" error={err('meta.validUntil')} hint={quote ? undefined : `Default ${defaults.validityDays} days`}>
                <Input type="date" value={meta.validUntil} onChange={(e) => setM({ validUntil: e.target.value })} />
              </Field>
            </fieldset>
          </Card>

          <Card
            title={`Line items (${pricing.lines.length})`}
            bodyClassName="p-0"
            actions={
              !ro && (
                <div className="hidden flex-wrap items-center gap-2 md:flex">
                  <CatalogueSelects defaults={defaults} onService={addService} onPackage={importPackage} />
                </div>
              )
            }
          >
            {!ro && (
              <div className="flex flex-wrap gap-2 border-b border-adm-line px-4 py-3 md:hidden">
                <CatalogueSelects defaults={defaults} onService={addService} onPackage={importPackage} />
              </div>
            )}
            {err('content.pricing.lines') && <p className="px-5 pt-3 text-xs text-red-600" role="alert">{err('content.pricing.lines')}</p>}
            <ol className="divide-y divide-adm-line">
              {pricing.lines.map((l, i) => {
                const t = totals.lines[i];
                const e = (k: string) => err(`content.pricing.lines.${i}.${k}`);
                return (
                  <li key={l.id} className={cn('px-4 py-4 sm:px-5', l.optional && 'bg-[#FBF8F1]')}>
                    <fieldset disabled={ro} className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-[minmax(0,1fr)_88px_88px_150px_84px]">
                      <div className="col-span-2 md:col-span-1">
                        <label className="sr-only" htmlFor={`ln-${l.id}`}>
                          Line {i + 1} name
                        </label>
                        <Input id={`ln-${l.id}`} value={l.name} maxLength={160} placeholder="Service or item name" invalid={!!e('name')} onChange={(ev) => updLine(i, { name: ev.target.value })} className="font-medium" />
                        {e('name') && <p className="mt-1 text-xs text-red-600">{e('name')}</p>}
                        <Textarea rows={1} value={l.description} maxLength={600} placeholder="Description (optional)" aria-label={`Line ${i + 1} description`} onChange={(ev) => updLine(i, { description: ev.target.value })} className="mt-2 min-h-[38px] resize-y text-xs" />
                      </div>
                      <Field label="Qty" error={e('quantityX100')}>
                        <Scaled100Input value={l.quantityX100} min={1} max={10_000_000} aria-label={`Line ${i + 1} quantity`} invalid={!!e('quantityX100')} onChange={(v) => updLine(i, { quantityX100: v })} />
                      </Field>
                      <Field label="Unit">
                        <Input value={l.unit} maxLength={20} placeholder="event" aria-label={`Line ${i + 1} unit`} onChange={(ev) => updLine(i, { unit: ev.target.value })} />
                      </Field>
                      <Field label="Unit price" error={e('unitPriceMinor')}>
                        <MoneyInput value={l.unitPriceMinor} currency={currency} invalid={!!e('unitPriceMinor')} onChange={(v) => updLine(i, { unitPriceMinor: v ?? 0 })} />
                      </Field>
                      <Field label="Disc." error={e('discountBps')}>
                        <Scaled100Input value={l.discountBps} max={10_000} suffix="%" aria-label={`Line ${i + 1} discount percent`} onChange={(v) => updLine(i, { discountBps: v })} />
                      </Field>
                    </fieldset>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <Toggle checked={l.optional} disabled={ro} onChange={(v) => updLine(i, { optional: v, selected: v ? false : true })} label={<span className="text-xs">Optional</span>} />
                      {l.optional && <Toggle checked={l.selected} disabled={ro} onChange={(v) => updLine(i, { selected: v })} label={<span className="text-xs">Selected by default</span>} />}
                      <Toggle checked={l.taxable} disabled={ro} onChange={(v) => updLine(i, { taxable: v })} label={<span className="text-xs">Taxable</span>} />
                      {l.serviceId && <Badge tone="gold">Catalogue</Badge>}
                      <div className="ml-auto flex items-center gap-3">
                        <span className="text-right text-sm tabular-nums">
                          {t && t.discountMinor > 0 && <span className="mr-2 text-xs text-adm-muted line-through">{money(t.grossMinor, currency)}</span>}
                          <span className={cn('font-medium', !t?.included && 'text-adm-muted')}>{money(t?.netMinor ?? 0, currency)}</span>
                        </span>
                        {!ro && (
                          <span className="flex items-center">
                            <button type="button" className="adm-btn-ghost p-1.5" aria-label={`Move line ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button type="button" className="adm-btn-ghost p-1.5" aria-label={`Move line ${i + 1} down`} disabled={i === pricing.lines.length - 1} onClick={() => move(i, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button type="button" className="adm-btn-ghost p-1.5 hover:text-red-700" aria-label={`Delete line ${i + 1}`} onClick={() => updPricing((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }))}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {!ro && (
              <div className="border-t border-adm-line px-4 py-3 sm:px-5">
                <button type="button" className="adm-btn-ghost px-2 py-1 text-sm" onClick={() => updPricing((p) => ({ ...p, lines: [...p.lines, blankLine()] }))}>
                  <Plus className="h-4 w-4" /> Custom line
                </button>
              </div>
            )}
          </Card>

          <div className="grid gap-6 2xl:grid-cols-2">
            <Card title="Discount, taxes & fees">
              <fieldset disabled={ro} className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quotation discount">
                    <Select value={pricing.discountType} onChange={(e) => updPricing((p) => ({ ...p, discountType: e.target.value as QuotePricingInput['discountType'], discountValue: 0 }))}>
                      <option value="NONE">None</option>
                      <option value="PERCENT">Percentage</option>
                      <option value="AMOUNT">Fixed amount</option>
                    </Select>
                  </Field>
                  {pricing.discountType === 'PERCENT' && (
                    <Field label="Percent" error={err('content.pricing.discountValue')}>
                      <Scaled100Input value={pricing.discountValue} max={10_000} suffix="%" aria-label="Discount percent" onChange={(v) => updPricing((p) => ({ ...p, discountValue: v }))} />
                    </Field>
                  )}
                  {pricing.discountType === 'AMOUNT' && (
                    <Field label="Amount" error={err('content.pricing.discountValue')}>
                      <MoneyInput value={pricing.discountValue} currency={currency} onChange={(v) => updPricing((p) => ({ ...p, discountValue: v ?? 0 }))} />
                    </Field>
                  )}
                </div>
                <div>
                  <span className="adm-label">Taxes</span>
                  <div className="space-y-2">
                    {pricing.taxes.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <Input aria-label={`Tax ${i + 1} name`} value={t.name} maxLength={40} placeholder="GST" invalid={!!err(`content.pricing.taxes.${i}.name`)} onChange={(e) => updPricing((p) => ({ ...p, taxes: p.taxes.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                        <div className="w-28 shrink-0">
                          <Scaled100Input value={t.rateBps} max={10_000} suffix="%" aria-label={`Tax ${i + 1} rate`} onChange={(v) => updPricing((p) => ({ ...p, taxes: p.taxes.map((x, j) => (j === i ? { ...x, rateBps: v } : x)) }))} />
                        </div>
                        <button type="button" className="adm-btn-ghost px-2" aria-label={`Remove tax ${i + 1}`} onClick={() => updPricing((p) => ({ ...p, taxes: p.taxes.filter((_, j) => j !== i) }))}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {pricing.taxes.length < 5 && (
                      <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => updPricing((p) => ({ ...p, taxes: [...p.taxes, { name: '', rateBps: 0 }] }))}>
                        <Plus className="h-3.5 w-3.5" /> Add tax
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <span className="adm-label">Fees</span>
                  <div className="space-y-2">
                    {pricing.fees.map((f, i) => (
                      <div key={i} className="space-y-2 rounded-lg border border-adm-line p-2.5">
                        <div className="flex gap-2">
                          <Input aria-label={`Fee ${i + 1} name`} value={f.name} maxLength={60} placeholder="e.g. Travel & logistics" invalid={!!err(`content.pricing.fees.${i}.name`)} onChange={(e) => updPricing((p) => ({ ...p, fees: p.fees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                          <button type="button" className="adm-btn-ghost px-2" aria-label={`Remove fee ${i + 1}`} onClick={() => updPricing((p) => ({ ...p, fees: p.fees.filter((_, j) => j !== i) }))}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <MoneyInput value={f.amountMinor} currency={currency} onChange={(v) => updPricing((p) => ({ ...p, fees: p.fees.map((x, j) => (j === i ? { ...x, amountMinor: v ?? 0 } : x)) }))} />
                          </div>
                          <Toggle checked={f.taxable} onChange={(v) => updPricing((p) => ({ ...p, fees: p.fees.map((x, j) => (j === i ? { ...x, taxable: v } : x)) }))} label={<span className="text-xs">Taxable</span>} />
                        </div>
                      </div>
                    ))}
                    {pricing.fees.length < 10 && (
                      <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => updPricing((p) => ({ ...p, fees: [...p.fees, { name: '', amountMinor: 0, taxable: false }] }))}>
                        <Plus className="h-3.5 w-3.5" /> Add fee
                      </button>
                    )}
                  </div>
                </div>
              </fieldset>
            </Card>

            <Card
              title="Payment milestones"
              actions={
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', milestoneSum === 10_000 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')} aria-live="polite">
                  {pct(milestoneSum)} of 100%
                </span>
              }
            >
              {err('content.pricing.milestones') && (
                <p className="mb-3 flex items-center gap-1.5 text-xs text-red-600" role="alert">
                  <AlertTriangle className="h-3.5 w-3.5" /> {err('content.pricing.milestones')}
                </p>
              )}
              <fieldset disabled={ro} className="space-y-3">
                {pricing.milestones.map((m, i) => {
                  const setMs = (patch: Partial<Milestone>) => updPricing((p) => ({ ...p, milestones: p.milestones.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
                  const e = (k: string) => err(`content.pricing.milestones.${i}.${k}`);
                  return (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-center gap-2 rounded-lg border border-adm-line p-3 sm:grid-cols-[minmax(0,1.3fr)_96px_minmax(0,1.2fr)_auto_auto_auto]">
                      <Input aria-label={`Milestone ${i + 1} label`} className="col-span-3 sm:col-span-1" value={m.label} maxLength={80} placeholder="Advance" invalid={!!e('label')} onChange={(ev) => setMs({ label: ev.target.value })} />
                      <Scaled100Input value={m.shareBps} max={10_000} suffix="%" aria-label={`Milestone ${i + 1} share`} invalid={!!e('shareBps') || milestoneSum !== 10_000} onChange={(v) => setMs({ shareBps: v })} />
                      <button type="button" className="adm-btn-ghost col-span-2 justify-self-end px-2 sm:order-last sm:col-span-1" aria-label={`Remove milestone ${i + 1}`} disabled={pricing.milestones.length <= 1} onClick={() => updPricing((p) => ({ ...p, milestones: p.milestones.filter((_, j) => j !== i) }))}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <Select aria-label={`Milestone ${i + 1} due`} value={m.due} className="col-span-3 sm:col-span-1" onChange={(ev) => setMs({ due: ev.target.value as Milestone['due'] })} options={DUE_OPTIONS} />
                      {m.due === 'DAYS_BEFORE_EVENT' || m.due === 'DAYS_AFTER_EVENT' ? (
                        <div className="flex items-center gap-1.5">
                          <Input type="number" min={0} max={365} className="w-[72px]" aria-label={`Milestone ${i + 1} days`} value={m.days} onChange={(ev) => setMs({ days: Math.max(0, Math.min(365, Number(ev.target.value) || 0)) })} />
                          <span className="text-xs text-adm-muted">days</span>
                        </div>
                      ) : m.due === 'FIXED_DATE' ? (
                        <Input type="date" className="w-auto" aria-label={`Milestone ${i + 1} date`} value={m.date} invalid={!!e('date')} onChange={(ev) => setMs({ date: ev.target.value })} />
                      ) : (
                        <span className="hidden sm:block" />
                      )}
                      <span className="col-span-full text-right text-sm tabular-nums text-adm-muted sm:col-span-1 sm:min-w-[96px]">{money(totals.milestones[i]?.amountMinor ?? 0, currency)}</span>
                      {e('date') && <p className="col-span-full text-xs text-red-600">{e('date')}</p>}
                    </div>
                  );
                })}
                {pricing.milestones.length < 8 && (
                  <button
                    type="button"
                    className="adm-btn-ghost px-2 py-1 text-xs"
                    onClick={() => updPricing((p) => ({ ...p, milestones: [...p.milestones, { label: '', shareBps: Math.max(1, 10_000 - p.milestones.reduce((s, x) => s + x.shareBps, 0)), due: 'DAYS_BEFORE_EVENT', days: 7, date: '' }] }))}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add milestone
                  </button>
                )}
              </fieldset>
            </Card>
          </div>

          <Card title="Proposal text">
            <fieldset disabled={ro} className="space-y-4">
              <Field label="Introduction" hint="Shown at the top of the proposal and PDF.">
                <Textarea rows={4} maxLength={5000} value={content.intro} onChange={(e) => upd((c) => ({ ...c, intro: e.target.value }))} />
              </Field>
              <Field label="Terms & conditions" hint="Prefilled from Business settings.">
                <Textarea rows={6} maxLength={10000} value={content.terms} onChange={(e) => upd((c) => ({ ...c, terms: e.target.value }))} />
              </Field>
              <Field label="Internal notes" hint="Never shown to the client.">
                <Textarea rows={3} maxLength={5000} value={content.notes} onChange={(e) => upd((c) => ({ ...c, notes: e.target.value }))} />
              </Field>
            </fieldset>
          </Card>
        </div>

        <aside className="min-w-0">
          <div className="space-y-4 xl:sticky xl:top-24">
            <Card title="Totals" actions={<span className="text-[11px] text-adm-muted">live preview</span>}>
              <QuoteTotals pricing={pricing} currency={currency} />
              <p className="mt-4 text-[11px] leading-relaxed text-adm-muted">Preview only — the server recalculates every amount from the line items when saving.</p>
            </Card>
            <div className="adm-card space-y-2 p-4">
              {editable && (
                <button className="adm-btn-primary w-full" disabled={save.isPending || (!dirty && !!quote)} onClick={() => validate() && save.mutate()}>
                  <Save className="h-4 w-4" /> {save.isPending ? 'Saving…' : !quote ? 'Create draft' : locked && dirty ? `Save as v${quote.currentVersion + 1}` : dirty ? 'Save changes' : 'Saved'}
                </button>
              )}
              {quote && SENDABLE.includes(status) && (
                <button className="adm-btn-gold w-full" disabled={send.isPending} onClick={() => validate() && send.mutate()}>
                  <Send className="h-4 w-4" /> {send.isPending ? 'Sending…' : dirty ? 'Save & send to client' : status === 'DRAFT' ? 'Send to client' : 'Resend to client'}
                </button>
              )}
              {quote && status === 'ACCEPTED' && can('bookings.manage') && (
                <button className="adm-btn-gold w-full" onClick={() => setModal('convert')}>
                  <CalendarCheck className="h-4 w-4" /> Convert to booking
                </button>
              )}
              {quote?.validUntil && <p className="pt-1 text-center text-xs text-adm-muted">Valid until {fmtDate(quote.validUntil)}</p>}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      {(editable || (quote && SENDABLE.includes(status))) && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-adm-line bg-white/95 px-4 py-3 backdrop-blur xl:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-adm-muted">Total</p>
            <p className="truncate font-semibold tabular-nums">{money(totals.totalMinor, currency)}</p>
          </div>
          {editable && (
            <button className="adm-btn-primary" disabled={save.isPending || (!dirty && !!quote)} onClick={() => validate() && save.mutate()}>
              <Save className="h-4 w-4" /> {!quote ? 'Create' : 'Save'}
            </button>
          )}
          {quote && SENDABLE.includes(status) && (
            <button className="adm-btn-gold" disabled={send.isPending} onClick={() => validate() && send.mutate()}>
              <Send className="h-4 w-4" /> Send
            </button>
          )}
        </div>
      )}

      {quote && (
        <>
          <Modal open={modal === 'send'} onClose={() => setModal(null)} title="Quotation sent" size="sm" footer={<button className="adm-btn-primary" onClick={() => { setModal(null); void qc.invalidateQueries({ queryKey: ['quotation', quote.id] }); }}>Done</button>}>
            <div aria-live="polite" className="space-y-3 text-sm">
              {sendResult?.deliveredByEmail ? (
                <p>The proposal has been emailed to {quote.client.email} with a link to review it in the client portal.</p>
              ) : (
                <>
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    The quotation is marked as sent and is visible in the client portal, but <strong>no email was delivered</strong> because email isn’t configured on this server. Let the client know yourself.
                  </p>
                  {sendResult?.portalInviteUrl ? (
                    <>
                      <p>The client doesn’t have a portal account yet. Share this one-time activation link (valid 72 hours) so they can sign in and review the proposal:</p>
                      <CopyField value={sendResult.portalInviteUrl} label="Portal activation link" />
                    </>
                  ) : (
                    <p>The client already has a portal account and can review it after signing in.</p>
                  )}
                </>
              )}
            </div>
          </Modal>
          <ConfirmDialog open={modal === 'withdraw'} onClose={() => setModal(null)} title="Withdraw quotation?" body="The quotation will be marked as expired and the client can no longer accept it. You can duplicate it later to start again." confirmLabel="Withdraw" danger loading={withdraw.isPending} onConfirm={() => withdraw.mutate()} />
          <VersionHistory open={modal === 'history'} onClose={() => setModal(null)} quote={quote} onView={(v) => setViewVersion(v)} />
          <VersionViewer version={viewVersion} quote={quote} onClose={() => setViewVersion(null)} />
          {modal === 'convert' && <ConvertModal quote={quote} onClose={() => setModal(null)} />}
        </>
      )}
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: 'info' | 'neutral' | 'violet'; icon: ReactNode; children: ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', neutral: 'border-adm-line bg-white text-adm-ink', violet: 'border-violet-200 bg-violet-50 text-violet-900' }[tone];
  return (
    <div className={cn('mb-4 flex gap-2.5 rounded-lg border px-4 py-3 text-sm', cls)}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function ResponseBanner({ quote }: { quote: QuotationFull }) {
  if (!quote.respondedAt && !quote.clientComment && quote.status !== 'VIEWED') return null;
  if (quote.status === 'VIEWED') return <Notice tone="info" icon={<Info className="h-4 w-4" />}>The client opened this proposal{quote.viewedAt ? ` on ${fmtDateTime(quote.viewedAt)}` : ''} and hasn’t responded yet.</Notice>;
  const tone = { ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-900', CONVERTED: 'border-emerald-200 bg-emerald-50 text-emerald-900', REJECTED: 'border-red-200 bg-red-50 text-red-900', REVISION_REQUESTED: 'border-amber-200 bg-amber-50 text-amber-900' }[quote.status as string] ?? 'border-adm-line bg-white';
  const label = { ACCEPTED: `Accepted by the client${quote.acceptedVersion ? ` (v${quote.acceptedVersion})` : ''}`, CONVERTED: 'Accepted and converted to a booking', REJECTED: 'Declined by the client', REVISION_REQUESTED: 'The client requested changes' }[quote.status as string] ?? `Client response: ${titleCase(quote.status)}`;
  return (
    <div className={cn('mb-4 rounded-lg border px-4 py-3 text-sm', tone)} role="status">
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <MessageSquare className="h-4 w-4" /> {label}
        {quote.respondedAt && <span className="font-normal opacity-75">· {fmtDateTime(quote.respondedAt)}</span>}
      </p>
      {quote.clientComment && <p className="mt-1.5 whitespace-pre-line pl-6">“{quote.clientComment}”</p>}
    </div>
  );
}

function CatalogueSelects({ defaults, onService, onPackage }: { defaults: QuoteDefaults; onService: (id: string) => void; onPackage: (id: string) => void }) {
  return (
    <>
      <Select aria-label="Add service from catalogue" value="" className="w-auto min-w-0 max-w-[220px] flex-1 py-1.5 text-xs" onChange={(e) => e.target.value && onService(e.target.value)}>
        <option value="">+ Add from catalogue…</option>
        {defaults.services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.defaultPriceMinor ? ` — ${money(s.defaultPriceMinor)}${s.defaultUnit ? `/${s.defaultUnit}` : ''}` : ''}
          </option>
        ))}
      </Select>
      {defaults.packages.length > 0 && (
        <Select aria-label="Import a package" value="" className="w-auto min-w-0 max-w-[200px] flex-1 py-1.5 text-xs" onChange={(e) => e.target.value && onPackage(e.target.value)}>
          <option value="">+ Import package…</option>
          {defaults.packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.tier ? ` (${p.tier})` : ''}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}

function ClientPicker({ onPick }: { onPick: (c: { id: string; name: string; email: string }) => void }) {
  const [q, setQ] = useState('');
  const r = useQuery({ queryKey: ['client-search', q], queryFn: () => api.get<ClientRow[]>('/admin/clients', { q, limit: 8 }), enabled: q.length >= 1 });
  return (
    <div className="relative">
      <SearchInput value={q} onChange={setQ} placeholder="Search clients by name, email or company…" />
      {q && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-adm-line bg-white shadow-xl" role="listbox" aria-label="Matching clients">
          {r.isLoading && <li className="px-3 py-2 text-sm text-adm-muted">Searching…</li>}
          {r.isError && <li className="px-3 py-2 text-sm text-red-600">{errorMessage(r.error)}</li>}
          {r.data?.length === 0 && (
            <li className="px-3 py-2 text-sm text-adm-muted">
              No clients found. <Link to="/admin/clients" className="text-adm-gold hover:underline">Create one</Link>
            </li>
          )}
          {r.data?.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={false} className="block w-full px-3 py-2 text-left text-sm hover:bg-adm-bg" onClick={() => onPick({ id: c.id, name: c.name, email: c.email })}>
                <span className="font-medium">{c.name}</span> <span className="text-adm-muted">· {c.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VersionHistory({ open, onClose, quote, onView }: { open: boolean; onClose: () => void; quote: QuotationFull; onView: (v: QuotationVersion) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Version history" size="md">
      <ol className="-my-2 divide-y divide-adm-line">
        {quote.versions.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Version {v.version}
                {v.version === quote.currentVersion && <Badge tone="gold">Current</Badge>}
                {v.version === quote.acceptedVersion && <Badge tone="green">Accepted</Badge>}
                {v.lockedAt ? <Badge tone="blue">Sent {fmtDate(v.lockedAt)}</Badge> : <Badge>Draft</Badge>}
                {v.aiDrafted && <Badge tone="violet">AI draft</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-adm-muted">
                {money(v.totalMinor, quote.currency)} · {v.lines.length} lines · created {fmtDateTime(v.createdAt)}
              </p>
            </div>
            <button className="adm-btn-secondary px-2.5 py-1 text-xs" onClick={() => onView(v)}>
              View
            </button>
            <a className="adm-btn-ghost px-2.5 py-1 text-xs" href={api.url(`/admin/quotations/${quote.id}/pdf`, { version: v.version })} target="_blank" rel="noopener">
              <FileDown className="h-3.5 w-3.5" /> PDF
            </a>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

function VersionViewer({ version, quote, onClose }: { version: QuotationVersion | null; quote: QuotationFull; onClose: () => void }) {
  const content = version ? versionToContent(version) : null;
  return (
    <Modal open={!!version} onClose={onClose} title={version ? `${quote.number} · version ${version.version} (read-only)` : ''} size="lg">
      {version && content && (
        <div className="space-y-5">
          {version.intro && <p className="whitespace-pre-line text-sm">{version.intro}</p>}
          <div className="-mx-6 overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Unit price</th>
                  <th className="text-right">Disc.</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {content.pricing.lines.map((l) => {
                  const t = calculateQuote(content.pricing).lines.find((x) => x.id === l.id);
                  return (
                    <tr key={l.id} className={l.optional ? 'bg-[#FBF8F1]' : undefined}>
                      <td>
                        <p className="font-medium">
                          {l.name} {l.optional && <Badge tone="gold">Optional{l.selected ? ' · selected' : ''}</Badge>}
                        </p>
                        {l.description && <p className="text-xs text-adm-muted">{l.description}</p>}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        {l.quantityX100 / 100} {l.unit}
                      </td>
                      <td className="text-right tabular-nums">{money(l.unitPriceMinor, quote.currency)}</td>
                      <td className="text-right tabular-nums">{l.discountBps ? pct(l.discountBps) : '—'}</td>
                      <td className="text-right tabular-nums">{money(t?.netMinor ?? 0, quote.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="ml-auto max-w-sm">
            <QuoteTotals pricing={content.pricing} currency={quote.currency} compact />
          </div>
          <p className="text-xs text-adm-muted">
            Milestones: {content.pricing.milestones.map((m) => `${m.label} ${pct(m.shareBps)} (${dueLabel(m.due, m.days, m.date)})`).join(' · ')}
          </p>
          {version.terms && (
            <div>
              <p className="adm-label">Terms</p>
              <p className="whitespace-pre-line text-xs text-adm-muted">{version.terms}</p>
            </div>
          )}
          <div className="flex justify-end">
            <a className="adm-btn-secondary" href={api.url(`/admin/quotations/${quote.id}/pdf`, { version: version.version })} target="_blank" rel="noopener">
              <FileDown className="h-4 w-4" /> Download PDF (v{version.version})
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ConvertModal({ quote, onClose }: { quote: QuotationFull; onClose: () => void }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useStaff();
  const venues = useQuery({ queryKey: ['venues-all'], queryFn: () => api.get<{ id: string; name: string; city: string; capacityMax: number | null }[]>('/admin/content/venues', { limit: 200 }), enabled: can('venues.manage') });
  const [f, setF] = useState({ managerId: '', venueId: '', startTime: '', eventEndDate: '' });
  const m = useMutation({
    mutationFn: () => api.post<{ id: string; reference: string }>(`/admin/quotations/${quote.id}/convert`, { managerId: f.managerId || null, venueId: f.venueId || null, startTime: f.startTime, eventEndDate: f.eventEndDate || null }),
    onSuccess: (b) => {
      toast.success(`Booking ${b.reference} created`);
      void qc.invalidateQueries({ queryKey: ['quotations'] });
      void qc.invalidateQueries({ queryKey: ['quotation', quote.id] });
      nav(`/admin/bookings/${b.id}`);
    },
    onError: (e) => toast.error('Could not convert', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Convert to booking"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-gold" type="submit" form="convert" disabled={m.isPending || !quote.eventDate}>
            {m.isPending ? 'Creating booking…' : 'Create booking'}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-adm-muted">
        Creates a booking from accepted version {quote.acceptedVersion} with its payment schedule. The booking starts as <em>Awaiting contract</em> — it is only confirmed after the contract and advance payment.
      </p>
      {!quote.eventDate && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Set the event date on the quotation before converting.</p>}
      <form
        id="convert"
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <Field label="Event manager">
          <Select value={f.managerId} onChange={(e) => setF((x) => ({ ...x, managerId: e.target.value }))}>
            <option value="">Assign later</option>
            {staff.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Venue" hint={can('venues.manage') ? 'Reserving checks availability.' : 'You need venue access to reserve a venue.'}>
          <Select value={f.venueId} disabled={!can('venues.manage')} onChange={(e) => setF((x) => ({ ...x, venueId: e.target.value }))}>
            <option value="">{quote.venue ? `Not reserved (${quote.venue})` : 'Not reserved'}</option>
            {venues.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.city ? ` — ${v.city}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Event date">
          <Input value={quote.eventDate ? fmtDate(quote.eventDate) : '—'} disabled />
        </Field>
        <Field label="End date" hint="For multi-day events">
          <Input type="date" min={quote.eventDate ?? undefined} value={f.eventEndDate} onChange={(e) => setF((x) => ({ ...x, eventEndDate: e.target.value }))} />
        </Field>
        <Field label="Start time">
          <Input type="time" value={f.startTime} onChange={(e) => setF((x) => ({ ...x, startTime: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}
