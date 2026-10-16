import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cog, Mail, MessageCircle, NotebookPen, Phone, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDateTime, fromNow, titleCase } from '@/lib/format';
import { Card, Field, Input, Select, Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { AuditEntry, Communication } from '../types';
import { LoadError, SkeletonRows } from '../shared/ui';

const KIND_ICON = { NOTE: NotebookPen, CALL: Phone, EMAIL: Mail, MEETING: Users, WHATSAPP: MessageCircle, SYSTEM: Cog } as const;
const KINDS = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP'] as const;

type Item = { id: string; at: string; kind: 'comm'; c: Communication } | { id: string; at: string; kind: 'audit'; a: AuditEntry };

function describeAudit(a: AuditEntry) {
  const action = a.action.replace(/^booking\./, '').replace(/[._]/g, ' ');
  return titleCase(action);
}

export default function ActivityTab({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ['booking-activity', b.id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ communications: Communication[]; audit: AuditEntry[] }>(`/admin/bookings/${b.id}/activity`) });
  const [filter, setFilter] = useState<'all' | 'comms' | 'audit'>('all');
  const [form, setForm] = useState({ kind: 'NOTE', subject: '', body: '' });
  const add = useMutation({
    mutationFn: () => api.post(`/admin/bookings/${b.id}/communications`, { kind: form.kind, subject: form.subject.trim(), body: form.body.trim() }),
    onSuccess: () => {
      toast.success(form.kind === 'NOTE' ? 'Note added' : `${titleCase(form.kind)} logged`);
      setForm({ kind: form.kind, subject: '', body: '' });
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error('Not saved', errorMessage(err)),
  });

  const items: Item[] = [
    ...(q.data?.communications ?? []).map((c) => ({ id: `c${c.id}`, at: c.createdAt, kind: 'comm' as const, c })),
    ...(q.data?.audit ?? []).map((a) => ({ id: `a${a.id}`, at: a.createdAt, kind: 'audit' as const, a })),
  ]
    .filter((i) => filter === 'all' || (filter === 'comms' ? i.kind === 'comm' : i.kind === 'audit'))
    .sort((x, y) => y.at.localeCompare(x.at));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 order-2 lg:order-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Timeline</h2>
          <Select aria-label="Filter activity" className="!w-auto !py-1.5" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Everything</option>
            <option value="comms">Notes & communications</option>
            <option value="audit">Audit trail</option>
          </Select>
        </div>
        {q.isError ? (
          <LoadError error={q.error} onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <SkeletonRows rows={6} />
        ) : items.length === 0 ? (
          <p className="adm-card px-5 py-10 text-center text-sm text-adm-muted">Nothing recorded yet.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-adm-line pl-6">
            {items.map((i) => {
              const Icon = i.kind === 'audit' ? ShieldCheck : (KIND_ICON[i.c.kind as keyof typeof KIND_ICON] ?? NotebookPen);
              return (
                <li key={i.id} className="relative">
                  <span className={cn('absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border bg-white', i.kind === 'audit' ? 'border-adm-line text-adm-muted' : 'border-adm-gold/50 text-adm-gold')}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {i.kind === 'comm' ? (
                    <div className="adm-card px-4 py-3">
                      <p className="text-xs text-adm-muted">
                        <span className="font-medium text-adm-ink">{titleCase(i.c.kind)}</span>
                        {i.c.direction !== 'INTERNAL' && ` · ${i.c.direction.toLowerCase()}`} · <time title={fmtDateTime(i.at)}>{fromNow(i.at)}</time>
                      </p>
                      {i.c.subject && <p className="mt-1 text-sm font-medium">{i.c.subject}</p>}
                      <p className="mt-1 whitespace-pre-line text-sm">{i.c.body}</p>
                    </div>
                  ) : (
                    <div className="py-0.5">
                      <p className="text-sm">
                        <span className="font-medium">{i.a.actor?.name ?? 'System'}</span> <span className="text-adm-muted">· {describeAudit(i.a)}</span>
                      </p>
                      {i.a.summary && <p className="text-sm text-adm-muted">{i.a.summary}</p>}
                      <p className="text-xs text-adm-muted">
                        <time title={fmtDateTime(i.at)}>{fmtDateTime(i.at)}</time>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {can('bookings.manage') && (
        <div className="order-1 lg:order-2">
          <Card title="Log activity">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (form.body.trim()) add.mutate();
              }}
            >
              <Field label="Type">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k === 'NOTE' ? 'Internal note' : k === 'WHATSAPP' ? 'WhatsApp' : titleCase(k)}
                    </option>
                  ))}
                </Select>
              </Field>
              {form.kind !== 'NOTE' && (
                <Field label="Subject">
                  <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} />
                </Field>
              )}
              <Field label={form.kind === 'NOTE' ? 'Note' : 'Summary'} required>
                <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={5000} placeholder={form.kind === 'CALL' ? 'What was discussed, agreed next steps…' : ''} />
              </Field>
              <button className="adm-btn-primary !w-full" disabled={!form.body.trim() || add.isPending}>
                {add.isPending ? 'Saving…' : 'Add to timeline'}
              </button>
              <p className="text-xs text-adm-muted">Internal only — never shown to the client.</p>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
