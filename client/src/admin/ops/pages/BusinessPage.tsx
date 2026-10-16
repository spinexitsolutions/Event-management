import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessSettingsSchema, CURRENCIES, type BusinessSettings, type Milestone } from '@maison/shared';
import { ArrowUpRight, ListChecks, Plug, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Field, Input, PageHeader, Select, Textarea } from '@/admin/ui';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AddRowButton, AdmError, fieldErrorsOf, RequirePerm, SkeletonRows } from '../shared';

const DUE_LABELS: Record<Milestone['due'], string> = {
  ON_ACCEPTANCE: 'On acceptance',
  DAYS_BEFORE_EVENT: 'Days before event',
  ON_EVENT_DAY: 'On event day',
  DAYS_AFTER_EVENT: 'Days after event',
  FIXED_DATE: 'Fixed date',
};

/** Percentage input that stores basis points (1% = 100). */
function PctInput({ value, onChange, invalid, label }: { value: number; onChange: (bps: number) => void; invalid?: boolean; label: string }) {
  const [text, setText] = useState(() => String(value / 100));
  useEffect(() => {
    if (Math.round(Number(text) * 100) !== value) setText(String(value / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        className="adm-input pr-8 tabular-nums"
        inputMode="decimal"
        value={text}
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, '');
          setText(v);
          if (/^\d+(\.\d{0,2})?$/.test(v)) onChange(Math.round(Number(v) * 100));
          else if (v === '') onChange(0);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-adm-muted">%</span>
    </div>
  );
}

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    return [];
  }
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-adm-line pb-8 pt-2 last:border-b-0 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {desc && <p className="mt-1 text-xs leading-relaxed text-adm-muted">{desc}</p>}
      </div>
      <div className="adm-card p-5">{children}</div>
    </section>
  );
}

function BusinessScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['business-settings'], queryFn: () => api.get<BusinessSettings>('/admin/settings/business') });
  const [b, setB] = useState<BusinessSettings | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (q.data) setB(q.data);
  }, [q.data]);
  const tzs = useMemo(timezones, []);
  const save = useMutation({
    mutationFn: (body: BusinessSettings) => api.put<BusinessSettings>('/admin/settings/business', body),
    onSuccess: (row) => {
      qc.setQueryData(['business-settings'], row);
      setB(row);
      setErrors({});
      toast.success('Business settings saved');
    },
    onError: (err) => {
      setErrors(fieldErrorsOf(err));
      toast.error('Could not save', errorMessage(err));
    },
  });

  if (q.isLoading || (!b && !q.isError)) return <SkeletonRows rows={10} />;
  if (q.isError || !b) return <AdmError error={q.error} onRetry={() => q.refetch()} />;

  const dirty = JSON.stringify(b) !== JSON.stringify(q.data);
  const msSum = b.quotation.defaultMilestones.reduce((s, m) => s + m.shareBps, 0);
  const setQ = (patch: Partial<BusinessSettings['quotation']>) => setB({ ...b, quotation: { ...b.quotation, ...patch } });
  const setInv = (patch: Partial<BusinessSettings['invoice']>) => setB({ ...b, invoice: { ...b.invoice, ...patch } });
  const setMs = (i: number, patch: Partial<Milestone>) => setQ({ defaultMilestones: b.quotation.defaultMilestones.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const e = (p: string) => errors[p];

  const submit = () => {
    const errs: Record<string, string> = {};
    const parsed = businessSettingsSchema.safeParse(b);
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
    if (msSum !== 10_000) errs['quotation.defaultMilestones'] = `Milestones must add up to 100% (currently ${(msSum / 100).toFixed(2)}%)`;
    b.quotation.defaultMilestones.forEach((m, i) => {
      if (m.due === 'FIXED_DATE' && !m.date) errs[`quotation.defaultMilestones.${i}.date`] = 'Choose a date';
    });
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success) {
      toast.error('Please fix the highlighted fields', Object.values(errs)[0]);
      return;
    }
    save.mutate(parsed.data);
  };

  return (
    <div className="pb-20">
      <PageHeader
        title="Business settings"
        subtitle="Legal details, quotation and invoice defaults, policies and data retention. Not shown publicly unless printed on documents."
        actions={
          <>
            <button className="adm-btn-secondary" disabled={!dirty} onClick={() => (setB(q.data!), setErrors({}))}>
              Discard
            </button>
            <button className="adm-btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </>
        }
      />
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Link to="/admin/settings/integrations" className="adm-card group flex items-center gap-3 p-4 transition hover:border-adm-gold/60">
          <Plug className="h-5 w-5 text-adm-gold" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Integrations</span>
            <span className="block text-xs text-adm-muted">Payments, email, WhatsApp, storage and more</span>
          </span>
          <ArrowUpRight className="h-4 w-4 text-adm-muted transition group-hover:text-adm-ink" />
        </Link>
        <Link to="/admin/settings/task-templates" className="adm-card group flex items-center gap-3 p-4 transition hover:border-adm-gold/60">
          <ListChecks className="h-5 w-5 text-adm-gold" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Task templates</span>
            <span className="block text-xs text-adm-muted">Reusable planning checklists per event type</span>
          </span>
          <ArrowUpRight className="h-4 w-4 text-adm-muted transition group-hover:text-adm-ink" />
        </Link>
      </div>

      <div className="space-y-8">
        <Section title="Company" desc="Printed on quotations and invoices.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name" error={e('legalName')}>
              <Input value={b.legalName} maxLength={160} onChange={(x) => setB({ ...b, legalName: x.target.value })} />
            </Field>
            <Field label="Tax ID (GSTIN / VAT)" error={e('taxId')}>
              <Input value={b.taxId} maxLength={30} onChange={(x) => setB({ ...b, taxId: x.target.value.toUpperCase() })} />
            </Field>
            <Field label="Currency" error={e('currency')} hint="Default for new quotations and reports.">
              <Select value={b.currency} onChange={(x) => setB({ ...b, currency: x.target.value as BusinessSettings['currency'] })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} aria-label="Currency" />
            </Field>
            <Field label="Timezone" error={e('timezone')} hint="Used for reminders and scheduled jobs.">
              <Input value={b.timezone} list="tz-list" maxLength={60} onChange={(x) => setB({ ...b, timezone: x.target.value })} />
              <datalist id="tz-list">
                {tzs.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
          </div>
        </Section>

        <Section title="Quotations" desc="Defaults applied to every new quotation. Staff can still change them per quotation.">
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number prefix" error={e('quotation.prefix')} hint={`Example: ${b.quotation.prefix || 'QT'}-2026-0042`}>
                <Input value={b.quotation.prefix} maxLength={8} onChange={(x) => setQ({ prefix: x.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
              </Field>
              <Field label="Valid for (days)" error={e('quotation.validityDays')}>
                <Input type="number" min={1} max={180} value={b.quotation.validityDays} onChange={(x) => setQ({ validityDays: Math.round(Number(x.target.value) || 0) })} invalid={!!e('quotation.validityDays')} />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="adm-label mb-0">Default taxes</p>
                <AddRowButton disabled={b.quotation.defaultTaxes.length >= 5} onClick={() => setQ({ defaultTaxes: [...b.quotation.defaultTaxes, { name: 'GST', rateBps: 1800 }] })}>
                  Add tax
                </AddRowButton>
              </div>
              {b.quotation.defaultTaxes.length === 0 && <p className="text-xs text-adm-muted">No default taxes.</p>}
              <div className="space-y-2">
                {b.quotation.defaultTaxes.map((t, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2">
                    <Field error={e(`quotation.defaultTaxes.${i}.name`)}>
                      <Input value={t.name} maxLength={40} placeholder="Tax name" aria-label={`Tax ${i + 1} name`} onChange={(x) => setQ({ defaultTaxes: b.quotation.defaultTaxes.map((y, j) => (j === i ? { ...y, name: x.target.value } : y)) })} />
                    </Field>
                    <PctInput label={`Tax ${i + 1} rate`} value={t.rateBps} onChange={(bps) => setQ({ defaultTaxes: b.quotation.defaultTaxes.map((y, j) => (j === i ? { ...y, rateBps: bps } : y)) })} />
                    <button className="adm-btn-ghost px-2 text-red-600" onClick={() => setQ({ defaultTaxes: b.quotation.defaultTaxes.filter((_, j) => j !== i) })} aria-label={`Remove tax ${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="adm-label mb-0">Default payment milestones</p>
                <AddRowButton disabled={b.quotation.defaultMilestones.length >= 8} onClick={() => setQ({ defaultMilestones: [...b.quotation.defaultMilestones, { label: 'Instalment', shareBps: Math.max(0, 10_000 - msSum) || 1000, due: 'DAYS_BEFORE_EVENT', days: 15, date: '' }] })}>
                  Add milestone
                </AddRowButton>
              </div>
              <div className="space-y-2">
                {b.quotation.defaultMilestones.map((m, i) => (
                  <div key={i} className="grid gap-2 rounded-lg border border-adm-line p-2 sm:grid-cols-[minmax(0,1.4fr)_100px_minmax(0,1.2fr)_110px_auto] sm:border-0 sm:p-0">
                    <Field error={e(`quotation.defaultMilestones.${i}.label`)}>
                      <Input value={m.label} maxLength={80} placeholder="Label" aria-label={`Milestone ${i + 1} label`} onChange={(x) => setMs(i, { label: x.target.value })} />
                    </Field>
                    <PctInput label={`Milestone ${i + 1} share`} value={m.shareBps} onChange={(bps) => setMs(i, { shareBps: bps })} invalid={msSum !== 10_000} />
                    <Select value={m.due} onChange={(x) => setMs(i, { due: x.target.value as Milestone['due'] })} aria-label={`Milestone ${i + 1} due`}>
                      {(Object.keys(DUE_LABELS) as Milestone['due'][]).map((d) => (
                        <option key={d} value={d}>
                          {DUE_LABELS[d]}
                        </option>
                      ))}
                    </Select>
                    {m.due === 'FIXED_DATE' ? (
                      <Field error={e(`quotation.defaultMilestones.${i}.date`)}>
                        <Input type="date" value={m.date} onChange={(x) => setMs(i, { date: x.target.value })} aria-label={`Milestone ${i + 1} date`} />
                      </Field>
                    ) : m.due === 'DAYS_BEFORE_EVENT' || m.due === 'DAYS_AFTER_EVENT' ? (
                      <div className="relative">
                        <Input type="number" min={0} max={365} value={m.days} onChange={(x) => setMs(i, { days: Math.max(0, Math.round(Number(x.target.value) || 0)) })} aria-label={`Milestone ${i + 1} days`} className="pr-12" />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-adm-muted">days</span>
                      </div>
                    ) : (
                      <span />
                    )}
                    <button className="adm-btn-ghost px-2 text-red-600" disabled={b.quotation.defaultMilestones.length <= 1} onClick={() => setQ({ defaultMilestones: b.quotation.defaultMilestones.filter((_, j) => j !== i) })} aria-label={`Remove milestone ${m.label}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className={cn('mt-2 text-xs font-medium', msSum === 10_000 ? 'text-emerald-700' : 'text-red-600')} aria-live="polite">
                Total {(msSum / 100).toFixed(2).replace(/\.00$/, '')}% {msSum === 10_000 ? '✓' : '— must equal 100%'}
              </p>
            </div>

            <Field label="Default terms & conditions" error={e('quotation.terms')} hint="Shown on every quotation PDF and in the client portal.">
              <Textarea rows={8} value={b.quotation.terms} maxLength={8000} onChange={(x) => setQ({ terms: x.target.value })} />
            </Field>
          </div>
        </Section>

        <Section title="Invoices" desc="Printed on every invoice PDF.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Number prefix" error={e('invoice.prefix')} hint={`Example: ${b.invoice.prefix || 'INV'}-2026-0007`}>
              <Input value={b.invoice.prefix} maxLength={8} onChange={(x) => setInv({ prefix: x.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
            </Field>
            <div />
            <Field label="Bank details" error={e('invoice.bankDetails')} hint="Account name, number, IFSC / SWIFT.">
              <Textarea rows={4} value={b.invoice.bankDetails} maxLength={1000} onChange={(x) => setInv({ bankDetails: x.target.value })} />
            </Field>
            <Field label="Footer note" error={e('invoice.footer')}>
              <Textarea rows={4} value={b.invoice.footer} maxLength={1000} onChange={(x) => setInv({ footer: x.target.value })} />
            </Field>
          </div>
        </Section>

        <Section title="Cancellations & refunds" desc="The refund table suggests the refundable share of amounts paid when a client cancels. Refunds always need approval.">
          <div className="space-y-5">
            <Field label="Cancellation policy" error={e('cancellationPolicy')}>
              <Textarea rows={6} value={b.cancellationPolicy} maxLength={5000} onChange={(x) => setB({ ...b, cancellationPolicy: x.target.value })} />
            </Field>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="adm-label mb-0">Refund rules</p>
                <AddRowButton disabled={b.refundRules.length >= 8} onClick={() => setB({ ...b, refundRules: [...b.refundRules, { daysBefore: 30, refundBps: 5000 }] })}>
                  Add rule
                </AddRowButton>
              </div>
              {b.refundRules.length === 0 ? (
                <p className="text-xs text-adm-muted">No refund rules — refunds are decided case by case.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-adm-muted">
                      <th className="pb-1 font-medium">Cancelled at least … days before</th>
                      <th className="pb-1 font-medium">Refund of amount paid</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {[...b.refundRules]
                      .map((r, i) => ({ r, i }))
                      .sort((x, y) => y.r.daysBefore - x.r.daysBefore)
                      .map(({ r, i }) => (
                        <tr key={i}>
                          <td className="py-1 pr-2">
                            <Input type="number" min={0} max={730} value={r.daysBefore} aria-label="Days before event" onChange={(x) => setB({ ...b, refundRules: b.refundRules.map((y, j) => (j === i ? { ...y, daysBefore: Math.max(0, Math.round(Number(x.target.value) || 0)) } : y)) })} />
                          </td>
                          <td className="py-1 pr-2">
                            <PctInput label="Refund percentage" value={r.refundBps} onChange={(bps) => setB({ ...b, refundRules: b.refundRules.map((y, j) => (j === i ? { ...y, refundBps: Math.min(10_000, bps) } : y)) })} />
                          </td>
                          <td className="w-10 py-1">
                            <button className="adm-btn-ghost px-2 text-red-600" onClick={() => setB({ ...b, refundRules: b.refundRules.filter((_, j) => j !== i) })} aria-label="Remove rule">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </Section>

        <Section title="Data retention" desc="Closed (lost or archived) inquiries that never became a quotation or booking are deleted by the nightly cleanup job once they are older than this.">
          <Field label="Keep closed inquiries for (months)" error={e('dataRetentionMonths')} hint="Between 6 and 120 months.">
            <Input type="number" min={6} max={120} value={b.dataRetentionMonths} onChange={(x) => setB({ ...b, dataRetentionMonths: Math.round(Number(x.target.value) || 0) })} className="max-w-[160px]" invalid={!!e('dataRetentionMonths')} />
          </Field>
        </Section>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-adm-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-[1400px] items-center justify-end gap-3">
            <span className="mr-auto text-sm text-adm-muted" aria-live="polite">
              You have unsaved changes
            </span>
            <button className="adm-btn-secondary" onClick={() => (setB(q.data!), setErrors({}))}>
              Discard
            </button>
            <button className="adm-btn-primary" disabled={save.isPending} onClick={submit}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BusinessPage() {
  return (
    <RequirePerm any={['settings.manage']}>
      <BusinessScreen />
    </RequirePerm>
  );
}
