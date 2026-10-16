import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { businessSettingsSchema, type BusinessSettings } from '@maison/shared';
import { AlertTriangle, CheckCircle2, Mail, MessageCircle, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Card, ConfirmDialog, DataTable, Field, Input, KeyValue, PageHeader, Pagination, SearchInput, Select, StatusBadge, Tabs, Textarea, Toggle, type Column } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow, titleCase } from '@/lib/format';
import { AdmError, ChipsInput, RequirePerm, SkeletonRows } from '../shared';

type Tab = 'templates' | 'automations' | 'outbox' | 'providers';

interface Template {
  key: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  customised: boolean;
  variables: string[];
}
interface OutboundMessage {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP';
  to: string;
  templateKey: string | null;
  subject: string;
  body: string;
  status: 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  attempts: number;
  lastError: string;
  providerId: string | null;
  nextAttemptAt: string;
  sentAt: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}
interface ProviderStatus {
  email: { provider: string; configured: boolean; from: string };
  whatsapp: { provider: string; configured: boolean };
  counts?: { channel: string; status: string; count: number }[];
}

/* ───────────── Template preview ───────────── */

const SAMPLE: Record<string, string> = {
  name: 'Aanya Kapoor',
  reference: 'INQ-2026-0148',
  eventType: 'Wedding',
  trackUrl: 'https://example.com/track/INQ-2026-0148',
  email: 'aanya@example.com',
  phone: '+91 98200 00000',
  eventDate: '14 Feb 2027',
  location: 'Udaipur',
  guestCount: '250',
  budgetRange: '₹40–60 lakh',
  adminUrl: 'https://example.com/admin',
  when: 'Sat, 14 Nov 2026 · 4:00 pm',
  mode: 'Video call',
  number: 'QT-2026-0042',
  title: 'Kapoor – Mehta wedding',
  total: '₹48,50,000',
  validUntil: '30 Nov 2026',
  portalUrl: 'https://example.com/portal',
  manager: 'Riya Sharma',
  amount: '₹19,40,000',
  balance: '₹29,10,000',
  label: 'Second instalment',
  dueDate: '15 Jan 2027',
  days: '14',
  vendor: 'Sample Florals Co.',
  service: 'Mandap florals',
  url: 'https://example.com/link',
  role: 'Event Manager',
  code: '482913',
};

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `[${k}]`);

/** Inline renderer for **bold** and [label](url). */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${key}-b${i++}`}>{m[1]}</strong>);
    else
      out.push(
        <a key={`${key}-a${i++}`} href={m[3]} onClick={(e) => e.preventDefault()} className="inline-block rounded-md bg-[#1B1916] px-3 py-1.5 text-xs font-medium text-white no-underline">
          {m[2]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function renderEmail(body: string): ReactNode {
  return body
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p, pi) => (
      <p key={pi} className="mb-3 last:mb-0">
        {p.split('\n').map((line, li, arr) => (
          <Fragment key={li}>
            {inline(line, `${pi}-${li}`)}
            {li < arr.length - 1 && <br />}
          </Fragment>
        ))}
      </p>
    ));
}

function TemplatesTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { site } = useSite();
  const q = useQuery({ queryKey: ['email-templates'], queryFn: () => api.get<Template[]>('/admin/cms/email-templates') });
  const [selected, setSelected] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastFocus = useRef<'subject' | 'body'>('body');
  const tpl = q.data?.find((t) => t.key === selected);

  useEffect(() => {
    if (q.data?.length && !selected) setSelected(q.data[0].key);
  }, [q.data, selected]);
  useEffect(() => {
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body);
      setEnabled(tpl.enabled);
    }
  }, [tpl]);

  const dirty = !!tpl && (subject !== tpl.subject || body !== tpl.body || enabled !== tpl.enabled);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/cms/email-templates/${selected}`, { subject, body, enabled }),
    onSuccess: () => {
      toast.success('Template saved');
      qc.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (err) => toast.error('Could not save the template', errorMessage(err)),
  });
  const reset = useMutation({
    mutationFn: () => api.delete(`/admin/cms/email-templates/${selected}`),
    onSuccess: () => {
      toast.success('Template reset to the default wording');
      setConfirmReset(false);
      qc.invalidateQueries({ queryKey: ['email-templates'] });
    },
    onError: (err) => toast.error('Could not reset', errorMessage(err)),
  });

  const insert = (v: string) => {
    const token = `{{${v}}}`;
    if (lastFocus.current === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const s = el.selectionStart ?? subject.length;
      const e = el.selectionEnd ?? s;
      setSubject(subject.slice(0, s) + token + subject.slice(e));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s + token.length, s + token.length);
      });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const s = el.selectionStart ?? body.length;
      const e = el.selectionEnd ?? s;
      setBody(body.slice(0, s) + token + body.slice(e));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s + token.length, s + token.length);
      });
    }
  };

  const vars = useMemo(() => ({ ...SAMPLE, brand: site?.brand?.name || 'Maison Events' }), [site]);
  const unknownVars = tpl ? [...new Set((subject + body).match(/\{\{\s*(\w+)\s*\}\}/g) ?? [])].map((x) => x.replace(/[{}\s]/g, '')).filter((x) => !tpl.variables.includes(x)) : [];

  if (q.isLoading) return <SkeletonRows rows={6} />;
  if (q.isError) return <AdmError error={q.error} onRetry={() => q.refetch()} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <nav aria-label="Email templates" className="adm-card h-fit overflow-hidden">
        <label className="block p-3 lg:hidden">
          <span className="sr-only">Template</span>
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {q.data!.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
        <ul className="hidden divide-y divide-adm-line/70 lg:block">
          {q.data!.map((t) => (
            <li key={t.key}>
              <button
                className={cn('flex w-full items-start gap-2 px-4 py-3 text-left text-sm transition hover:bg-adm-bg', selected === t.key && 'bg-adm-bg font-medium')}
                aria-current={selected === t.key ? 'true' : undefined}
                onClick={() => {
                  if (dirty && !window.confirm('Discard unsaved changes to this template?')) return;
                  setSelected(t.key);
                }}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', t.enabled ? 'bg-emerald-500' : 'bg-neutral-300')} aria-label={t.enabled ? 'Enabled' : 'Disabled'} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{t.name}</span>
                  {t.customised && <span className="text-[11px] font-normal text-adm-gold">Customised</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {tpl && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card
            title={tpl.name}
            actions={
              <>
                {tpl.customised && (
                  <button className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => setConfirmReset(true)}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reset
                  </button>
                )}
                <button className="adm-btn-primary px-3 py-1.5" onClick={() => save.mutate()} disabled={!dirty || save.isPending || !subject.trim() || !body.trim()}>
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <Toggle checked={enabled} onChange={setEnabled} label={enabled ? 'Enabled — this message is sent' : 'Disabled — this message is skipped'} />
              <Field label="Subject" error={!subject.trim() ? 'Subject is required' : undefined}>
                <Input ref={subjectRef} value={subject} maxLength={250} onChange={(e) => setSubject(e.target.value)} onFocus={() => (lastFocus.current = 'subject')} />
              </Field>
              <Field label="Body" hint="Blank line = new paragraph · **bold** · [Button label](url)" error={!body.trim() ? 'Body is required' : undefined}>
                <Textarea ref={bodyRef} rows={12} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} onFocus={() => (lastFocus.current = 'body')} className="font-mono text-[13px] leading-relaxed" />
              </Field>
              <div>
                <p className="adm-label">Insert a variable</p>
                <div className="flex flex-wrap gap-1.5">
                  {tpl.variables.map((v) => (
                    <button key={v} type="button" onClick={() => insert(v)} className="rounded-md bg-adm-bg px-2 py-1 font-mono text-[11px] text-adm-ink ring-1 ring-inset ring-adm-line transition hover:bg-[#F5EEDF] hover:ring-[#E6D7B5]">
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
                {unknownVars.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> Not available for this message: {unknownVars.join(', ')} — they will appear blank.
                  </p>
                )}
              </div>
            </div>
          </Card>
          <div className="xl:sticky xl:top-20 xl:self-start">
            <p className="adm-label">Live preview (sample values)</p>
            <div className="overflow-hidden rounded-xl border border-adm-line bg-[#F3F1EC]">
              <div className="border-b border-adm-line bg-white px-5 py-3 text-xs text-adm-muted">
                <p>
                  <span className="inline-block w-14">Subject</span> <span className="font-medium text-adm-ink">{fill(subject, vars)}</span>
                </p>
              </div>
              <div className="p-5">
                <div className="mx-auto max-w-md rounded-lg bg-white px-6 py-7 text-[14px] leading-relaxed text-[#1B1916] shadow-sm">
                  <p className="mb-5 font-serif text-lg tracking-wide">{vars.brand}</p>
                  {renderEmail(fill(body, vars))}
                </div>
                {!enabled && <p className="mt-3 text-center text-xs text-adm-muted">This template is disabled and won’t be sent.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirmReset} title="Reset to default?" body="Your custom subject and body will be replaced by the built-in wording." confirmLabel="Reset template" loading={reset.isPending} onConfirm={() => reset.mutate()} onClose={() => setConfirmReset(false)} />
    </div>
  );
}

/* ───────────── Automations ───────────── */

const AUTOMATIONS: { key: keyof BusinessSettings['notifications']['automations']; label: string; desc: string }[] = [
  { key: 'inquiryConfirmation', label: 'Inquiry confirmation', desc: 'Email the client a thank-you with their reference and tracking link when they submit an inquiry.' },
  { key: 'adminInquiryAlert', label: 'New inquiry alert', desc: 'Email the admin alert addresses below as soon as a new inquiry arrives.' },
  { key: 'consultationReminder', label: 'Consultation reminder', desc: 'Remind the client shortly before a scheduled consultation.' },
  { key: 'quotationSent', label: 'Quotation sent', desc: 'Email the client a link to review and accept their proposal when a quotation is sent.' },
  { key: 'bookingConfirmation', label: 'Booking confirmation', desc: 'Tell the client their event is confirmed once the contract and advance payment are in.' },
  { key: 'paymentConfirmation', label: 'Payment receipt', desc: 'Confirm every successful payment with the amount and remaining balance.' },
  { key: 'paymentDueReminder', label: 'Payment due reminders', desc: 'Remind clients before an instalment falls due (days set below).' },
  { key: 'eventReminder', label: 'Event countdown reminders', desc: 'Send the client a reminder as the event approaches (days set below).' },
  { key: 'vendorTaskReminder', label: 'Vendor delivery reminders', desc: 'Alert the event manager ahead of a scheduled vendor delivery.' },
  { key: 'eventCompletion', label: 'Event completed', desc: 'Send a thank-you when the booking is marked completed.' },
  { key: 'feedbackRequest', label: 'Feedback request', desc: 'Ask the client for feedback after the event is completed.' },
];

function DaysInput({ value, onChange, label }: { value: number[]; onChange: (v: number[]) => void; label: string }) {
  return (
    <ChipsInput
      value={value.map(String)}
      onChange={(arr) => {
        const nums = [...new Set(arr.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort((a, b) => b - a).slice(0, 5);
        onChange(nums);
      }}
      max={5}
      placeholder={`${label} — type a number, press Enter`}
    />
  );
}

function AutomationsTab() {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const allowed = can('settings.manage');
  const q = useQuery({ queryKey: ['business-settings'], queryFn: () => api.get<BusinessSettings>('/admin/settings/business'), enabled: allowed });
  const [draft, setDraft] = useState<BusinessSettings | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);
  const save = useMutation({
    mutationFn: (b: BusinessSettings) => api.put<BusinessSettings>('/admin/settings/business', b),
    onSuccess: (row) => {
      qc.setQueryData(['business-settings'], row);
      toast.success('Automations saved');
    },
    onError: (err) => toast.error('Could not save', errorMessage(err)),
  });
  if (!allowed)
    return (
      <div className="adm-card px-6 py-10 text-center text-sm text-adm-muted">
        Automation settings are part of the business settings. Ask someone with the <code>settings.manage</code> permission to view or change them.
      </div>
    );
  if (q.isLoading || !draft) return q.isError ? <AdmError error={q.error} onRetry={() => q.refetch()} /> : <SkeletonRows rows={8} />;
  const n = draft.notifications;
  const setN = (patch: Partial<BusinessSettings['notifications']>) => setDraft({ ...draft, notifications: { ...n, ...patch } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(q.data);
  const submit = () => {
    const parsed = businessSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue.path.join('.')}: ${issue.message}`);
      return;
    }
    setError('');
    save.mutate(parsed.data);
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card title="Automatic messages" bodyClassName="p-0">
        <ul className="divide-y divide-adm-line/70">
          {AUTOMATIONS.map((a) => (
            <li key={a.key} className="flex items-start justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{a.label}</p>
                <p className="text-xs text-adm-muted">{a.desc}</p>
              </div>
              <Toggle checked={n.automations[a.key]} onChange={(v) => setN({ automations: { ...n.automations, [a.key]: v } })} label={<span className="sr-only">{a.label}</span>} />
            </li>
          ))}
        </ul>
      </Card>
      <div className="space-y-6">
        <Card title="Schedule & recipients">
          <div className="space-y-4">
            <Field label="Admin alert emails" hint="Who receives new-inquiry alerts (max 10).">
              <ChipsInput
                value={n.adminEmails}
                max={10}
                onChange={(arr) => {
                  const bad = arr.find((e) => !/^\S+@\S+\.\S+$/.test(e));
                  if (bad) return toast.error('Invalid email', bad);
                  setN({ adminEmails: arr.map((e) => e.toLowerCase()) });
                }}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Payment reminders — days before due" hint="e.g. 7 and 1 (up to 5 values, 0–60).">
              <DaysInput value={n.paymentReminderDays} onChange={(v) => setN({ paymentReminderDays: v })} label="Days" />
            </Field>
            <Field label="Event reminders — days before the event" hint="e.g. 14 and 2.">
              <DaysInput value={n.eventReminderDays} onChange={(v) => setN({ eventReminderDays: v })} label="Days" />
            </Field>
            <div>
              <Toggle checked={n.whatsappEnabled} onChange={(v) => setN({ whatsappEnabled: v })} label="Also send WhatsApp messages" />
              <p className="mt-1 pl-[46px] text-xs text-adm-muted">Requires WhatsApp credentials on the server — see the Providers tab.</p>
            </div>
          </div>
        </Card>
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="adm-btn-secondary" disabled={!dirty} onClick={() => setDraft(q.data!)}>
            Discard
          </button>
          <button className="adm-btn-primary" disabled={!dirty || save.isPending} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save automations'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Outbox ───────────── */

function OutboxTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<OutboundMessage | null>(null);
  const query = { status, channel, q, page, limit: 25 };
  const list = useQuery({ queryKey: ['outbox', query], queryFn: () => api.getPaged<OutboundMessage[]>('/admin/outbox', query), placeholderData: keepPreviousData });
  const meta = list.data?.meta as unknown as { page: number; pages: number; total: number; providers: ProviderStatus } | undefined;
  const retry = useMutation({
    mutationFn: (id: string) => api.post<OutboundMessage>(`/admin/outbox/${id}/retry`),
    onSuccess: (row) => {
      setOpen(row);
      qc.invalidateQueries({ queryKey: ['outbox'] });
      qc.invalidateQueries({ queryKey: ['outbox-status'] });
      if (row.status === 'SENT') toast.success('Message sent');
      else toast.info(`Retry finished: ${titleCase(row.status)}`, row.lastError || undefined);
    },
    onError: (err) => toast.error(err instanceof ApiError && err.code === 'PROVIDER_NOT_CONFIGURED' ? 'No provider configured' : 'Retry not possible', errorMessage(err)),
  });
  const columns: Column<OutboundMessage>[] = [
    { key: 'when', header: 'Created', cell: (m) => <span title={fmtDateTime(m.createdAt)} className="whitespace-nowrap">{fromNow(m.createdAt)}</span> },
    { key: 'ch', header: 'Channel', className: 'hidden sm:table-cell', cell: (m) => (m.channel === 'EMAIL' ? <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5 text-adm-muted" /> Email</span> : <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-adm-muted" /> WhatsApp</span>) },
    { key: 'to', header: 'To', cell: (m) => <span className="block max-w-[200px] truncate">{m.to}</span> },
    { key: 'subject', header: 'Message', cell: (m) => <span className="block max-w-[320px] truncate">{m.subject || m.body.slice(0, 80)}<span className="block text-xs text-adm-muted">{m.templateKey ? titleCase(m.templateKey) : 'Ad-hoc'}</span></span> },
    { key: 'status', header: 'Status', cell: (m) => <span><StatusBadge status={m.status} />{m.attempts > 1 && <span className="block text-xs text-adm-muted">{m.attempts} attempts</span>}</span> },
  ];
  const providers = meta?.providers;
  return (
    <div>
      {providers && (!providers.email.configured || !providers.whatsapp.configured) && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {!providers.email.configured ? 'No email provider is configured, so emails are logged here as “skipped” instead of being sent.' : 'WhatsApp is not configured; WhatsApp messages are skipped.'}
        </p>
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_170px]">
        <SearchInput value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Search recipient, subject or template…" />
        <Select value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status">
          <option value="">Any status</option>
          {['QUEUED', 'SENT', 'FAILED', 'SKIPPED'].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
        <Select value={channel} onChange={(e) => (setChannel(e.target.value), setPage(1))} aria-label="Channel">
          <option value="">All channels</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
        </Select>
      </div>
      {list.isError ? (
        <AdmError error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <>
          <DataTable columns={columns} rows={list.data?.data} rowKey={(m) => m.id} loading={list.isLoading} onRowClick={setOpen} empty="No messages match." />
          {meta && <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />}
        </>
      )}
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        side
        title="Message details"
        footer={
          open && (open.status === 'FAILED' || open.status === 'SKIPPED') ? (
            <button className="adm-btn-primary" onClick={() => retry.mutate(open.id)} disabled={retry.isPending}>
              <RefreshCw className={cn('h-4 w-4', retry.isPending && 'animate-spin')} /> {retry.isPending ? 'Retrying…' : 'Retry now'}
            </button>
          ) : undefined
        }
      >
        {open && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge status={open.status} />
              <span className="text-xs text-adm-muted">
                {open.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} · {open.attempts} attempt{open.attempts === 1 ? '' : 's'}
              </span>
            </div>
            <KeyValue
              items={[
                ['To', open.to],
                ['Template', open.templateKey ? titleCase(open.templateKey) : 'Ad-hoc'],
                ['Created', fmtDateTime(open.createdAt)],
                ['Sent', open.sentAt ? fmtDateTime(open.sentAt) : '—'],
                ['Provider id', open.providerId ?? '—'],
                ['Related', open.entityType ? `${open.entityType}${open.entityId ? ` · ${open.entityId}` : ''}` : '—'],
              ]}
            />
            {open.lastError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <p className="font-medium">Last error</p>
                <p className="break-words">{open.lastError}</p>
              </div>
            )}
            {open.subject && (
              <div>
                <p className="adm-label">Subject</p>
                <p className="text-sm font-medium">{open.subject}</p>
              </div>
            )}
            <div>
              <p className="adm-label">Body</p>
              <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-adm-bg p-3 font-admin text-[13px] leading-relaxed">{open.body}</pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ───────────── Providers ───────────── */

function ProvidersTab() {
  const q = useQuery({ queryKey: ['outbox-status'], queryFn: () => api.get<ProviderStatus>('/admin/outbox/status') });
  if (q.isLoading) return <SkeletonRows rows={3} />;
  if (q.isError) return <AdmError error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;
  const count = (ch: string, st: string) => s.counts?.find((c) => c.channel === ch && c.status === st)?.count ?? 0;
  const card = (title: string, icon: ReactNode, ok: boolean, provider: string, extra: ReactNode, channel: string, hint: string) => (
    <Card title={<span className="inline-flex items-center gap-2">{icon} {title}</span>} actions={ok ? <Badge tone="green"><CheckCircle2 className="mr-1 h-3 w-3" /> Connected</Badge> : <Badge tone="amber"><XCircle className="mr-1 h-3 w-3" /> Not configured</Badge>}>
      <KeyValue items={[['Provider', provider === 'none' ? 'None' : titleCase(provider)], ...(extra ? [['Sender', extra] as [ReactNode, ReactNode]] : [])]} />
      <div className="mt-5 grid grid-cols-4 gap-2 text-center">
        {['SENT', 'QUEUED', 'FAILED', 'SKIPPED'].map((st) => (
          <div key={st} className="rounded-lg bg-adm-bg px-2 py-2.5">
            <p className={cn('text-lg font-semibold tabular-nums', st === 'FAILED' && count(channel, st) > 0 && 'text-red-700')}>{count(channel, st)}</p>
            <p className="text-[11px] text-adm-muted">{titleCase(st)}</p>
          </div>
        ))}
      </div>
      {!ok && <p className="mt-4 text-xs text-adm-muted">{hint}</p>}
    </Card>
  );
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {card('Email', <Mail className="h-4 w-4 text-adm-muted" />, s.email.configured, s.email.provider, s.email.from, 'EMAIL', 'Set EMAIL_PROVIDER to smtp (with SMTP_HOST, SMTP_USER, SMTP_PASS) or resend (RESEND_API_KEY) on the server, then restart. Messages are never shown as sent without a provider.')}
      {card('WhatsApp', <MessageCircle className="h-4 w-4 text-adm-muted" />, s.whatsapp.configured, s.whatsapp.provider, null, 'WHATSAPP', 'Set WHATSAPP_PROVIDER=meta with the WhatsApp Cloud API token and phone number id on the server, then enable WhatsApp in Automations.')}
      <p className="text-xs text-adm-muted md:col-span-2">
        More integration details are on the <Link to="/admin/settings/integrations" className="text-adm-gold hover:underline">Integrations</Link> page.
      </p>
    </div>
  );
}

function NotificationsScreen() {
  const [sp, setSp] = useSearchParams();
  const t = sp.get('tab') as Tab | null;
  const tab: Tab = t && (['templates', 'automations', 'outbox', 'providers'] as Tab[]).includes(t) ? t : 'templates';
  return (
    <div>
      <PageHeader title="Emails & automations" subtitle="Edit message wording, choose what is sent automatically and audit every message that left the system." />
      <Tabs
        className="mb-6"
        value={tab}
        onChange={(next) => setSp({ tab: next }, { replace: true })}
        tabs={[
          { value: 'templates', label: 'Templates' },
          { value: 'automations', label: 'Automations' },
          { value: 'outbox', label: 'Outbox' },
          { value: 'providers', label: 'Provider status' },
        ]}
      />
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'automations' && <AutomationsTab />}
      {tab === 'outbox' && <OutboxTab />}
      {tab === 'providers' && <ProvidersTab />}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <RequirePerm any={['notifications.manage']}>
      <NotificationsScreen />
    </RequirePerm>
  );
}
