import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CalendarPlus, Check, FilePlus2, Mail, Pencil, PhoneCall, Sparkles } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { INQUIRY_STATUS_LABELS, INQUIRY_STATUSES, type InquiryStatus } from '@maison/shared';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { Img } from '@/components/ui/Img';
import { Lightbox } from '@/components/ui/Lightbox';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fromNow, money, titleCase } from '@/lib/format';
import { Badge, Card, Input, KeyValue, PageHeader, Select, StatusBadge, Textarea } from '@/admin/ui';
import { ConsultationModal, LogCommunicationModal, ReminderModal, SendEmailModal } from '../components/ActivityModals';
import { PanelError, SkeletonBlock, Field } from '../components/common';
import { Timeline } from '../components/Timeline';
import { fieldErrorsOf, useStaff, type Consultation, type InquiryDetail as Inq } from '../lib';

type ModalKind = 'consult' | 'log' | 'email' | 'reminder' | 'lost' | null;

export default function InquiryDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const staff = useStaff();
  const { bootstrap } = useSite();
  const [modal, setModal] = useState<ModalKind>(null);
  const [editingConsult, setEditingConsult] = useState<Consultation | null>(null);
  const [lostReason, setLostReason] = useState('');
  const q = useQuery({ queryKey: ['inquiry', id], queryFn: () => api.get<Inq>(`/admin/inquiries/${id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['inquiry', id] });
    void qc.invalidateQueries({ queryKey: ['inquiries'] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/admin/inquiries/${id}`, body),
    onSuccess: () => {
      toast.success('Inquiry updated');
      refresh();
    },
    onError: (err) => toast.error('Could not update inquiry', errorMessage(err)),
  });
  const reminderDone = useMutation({
    mutationFn: (rid: string) => api.post(`/admin/inquiries/reminders/${rid}/done`),
    onSuccess: () => {
      toast.success('Reminder completed');
      refresh();
    },
    onError: (err) => toast.error('Could not update reminder', errorMessage(err)),
  });

  const nameMap = Object.fromEntries([...(staff.data ?? []).map((x) => [x.id, x.name]), ...(bootstrap?.categories ?? []).map((x) => [x.id, x.name])]);
  if (q.isError) return <PanelError error={q.error} onRetry={() => q.refetch()} />;
  const inq = q.data;
  if (!inq)
    return (
      <div className="space-y-4" aria-busy>
        <SkeletonBlock className="h-16 w-1/2" />
        <div className="grid gap-6 lg:grid-cols-3">
          <SkeletonBlock className="h-80 lg:col-span-2" />
          <SkeletonBlock className="h-80" />
        </div>
      </div>
    );
  const manage = can('inquiries.manage');

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/inquiries', label: 'Inquiries' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inq.name}
            <span className="font-mono text-sm font-normal text-adm-muted">{inq.reference}</span>
          </span>
        }
        subtitle={`${inq.eventType} · received ${fromNow(inq.createdAt)} via ${inq.source}`}
      >
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Status" className="w-full sm:w-56">
            {manage ? (
              <Select
                value={inq.status}
                disabled={patch.isPending}
                onChange={(e) => {
                  const s = e.target.value as InquiryStatus;
                  if (s === 'LOST') {
                    setLostReason(inq.lostReason);
                    setModal('lost');
                  } else patch.mutate({ status: s });
                }}
              >
                {INQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INQUIRY_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            ) : (
              <StatusBadge status={inq.status} label={INQUIRY_STATUS_LABELS[inq.status]} />
            )}
          </Field>
          <Field label="Assigned to" className="w-full sm:w-56">
            {manage ? (
              <Select value={inq.assignedTo?.id ?? ''} disabled={patch.isPending} onChange={(e) => patch.mutate({ assignedToId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="py-2 text-sm">{inq.assignedTo?.name ?? 'Unassigned'}</p>
            )}
          </Field>
          {manage && (
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button className="adm-btn-secondary" onClick={() => setModal('consult')}>
                <CalendarPlus className="h-4 w-4" /> Schedule consultation
              </button>
              <button className="adm-btn-secondary" onClick={() => setModal('log')}>
                <PhoneCall className="h-4 w-4" /> Log call / note
              </button>
              <button className="adm-btn-secondary" onClick={() => setModal('email')}>
                <Mail className="h-4 w-4" /> Send email
              </button>
              <button className="adm-btn-secondary" onClick={() => setModal('reminder')}>
                <Bell className="h-4 w-4" /> Set reminder
              </button>
              {can('quotations.manage') && (
                <Link to={`/admin/quotations/new?inquiryId=${inq.id}`} className="adm-btn-gold">
                  <FilePlus2 className="h-4 w-4" /> Create quotation
                </Link>
              )}
            </div>
          )}
        </div>
        {inq.status === 'LOST' && inq.lostReason && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span className="font-medium">Lost:</span> {inq.lostReason}
          </p>
        )}
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {inq.aiClassification && <AiPanel inq={inq} manage={manage} onReview={(v) => patch.mutate({ aiReviewed: v })} busy={patch.isPending} />}
          <EventDetails inq={inq} manage={manage} onSaved={refresh} />
          <Card title="Requirements">
            <KeyValue
              cols={1}
              items={[
                ['Services of interest', inq.services.length ? <div className="flex flex-wrap gap-1.5">{inq.services.map((s) => <Badge key={s} tone="gold">{s}</Badge>)}</div> : '—'],
                ['Package', inq.package?.name ?? '—'],
                ['Venue requirements', <Multiline key="v" text={inq.venueRequirements} />],
                ['Theme & style', <Multiline key="t" text={inq.themePreferences} />],
                ['Catering', <Multiline key="c" text={inq.cateringRequirements} />],
                ['Notes', <Multiline key="n" text={inq.notes} />],
              ]}
            />
          </Card>
          {inq.attachments.length > 0 && <ReferenceImages inq={inq} />}
          <Card title="Consultations" actions={manage && <button className="text-xs text-adm-gold hover:underline" onClick={() => setModal('consult')}>Schedule</button>} bodyClassName="p-0">
            {inq.consultations.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-adm-muted">No consultations yet.</p>
            ) : (
              <ul className="divide-y divide-adm-line">
                {inq.consultations.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {fmtDateTime(c.scheduledAt)}
                        <StatusBadge status={c.status === 'SCHEDULED' ? 'PENDING' : c.status === 'COMPLETED' ? 'DONE' : 'CANCELLED'} label={titleCase(c.status)} />
                      </p>
                      <p className="mt-0.5 text-xs text-adm-muted">
                        {titleCase(c.mode)} · {c.durationMin} min{c.owner ? ` · ${c.owner.name}` : ''}
                        {c.location && ` · ${c.location}`}
                      </p>
                      {c.agenda && <p className="mt-1.5 whitespace-pre-line text-sm">{c.agenda}</p>}
                      {c.outcome && (
                        <p className="mt-2 whitespace-pre-line rounded-lg bg-adm-bg px-3 py-2 text-sm">
                          <span className="text-xs font-medium text-adm-muted">Outcome · </span>
                          {c.outcome}
                        </p>
                      )}
                    </div>
                    {manage && (
                      <button
                        className="adm-btn-ghost px-2 py-1 text-xs"
                        onClick={() => {
                          setEditingConsult(c);
                          setModal('consult');
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> {c.status === 'SCHEDULED' ? 'Update / complete' : 'Edit'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Communication timeline" actions={manage && <button className="text-xs text-adm-gold hover:underline" onClick={() => setModal('log')}>Add entry</button>}>
            <Timeline items={inq.communications} names={nameMap} />
          </Card>
        </div>

        <aside className="min-w-0 space-y-6">
          <Card title="Client" actions={can('clients.view') && <Link to={`/admin/clients/${inq.client.id}`} className="text-xs text-adm-gold hover:underline">Open profile</Link>}>
            <p className="font-medium">{inq.client.name}</p>
            {inq.client.company && <p className="text-sm text-adm-muted">{inq.client.company}</p>}
            <dl className="mt-3 space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-adm-muted">Email</dt>
                <dd className="min-w-0 break-all">
                  <a href={`mailto:${inq.email}`} className="hover:underline">{inq.email}</a>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-adm-muted">Phone</dt>
                <dd>{inq.phone ? <a href={`tel:${inq.phone.replace(/\s/g, '')}`} className="hover:underline">{inq.phone}</a> : '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-adm-muted">Prefers</dt>
                <dd>{titleCase(inq.preferredContact)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-adm-muted">Portal</dt>
                <dd>{inq.client.userId ? 'Has an account' : 'No account yet'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Reminders" actions={manage && <button className="text-xs text-adm-gold hover:underline" onClick={() => setModal('reminder')}>Add</button>} bodyClassName="p-0">
            {inq.reminders.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-adm-muted">No open reminders.</p>
            ) : (
              <ul className="divide-y divide-adm-line">
                {inq.reminders.map((r) => {
                  const overdue = new Date(r.dueAt) < new Date();
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                      {manage && (
                        <button className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-adm-line hover:border-adm-gold hover:text-adm-gold" aria-label={`Mark reminder “${r.note}” done`} disabled={reminderDone.isPending} onClick={() => reminderDone.mutate(r.id)}>
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm">{r.note}</p>
                        <p className={overdue ? 'text-xs font-medium text-red-600' : 'text-xs text-adm-muted'}>
                          {overdue ? 'Overdue · ' : ''}
                          {fmtDateTime(r.dueAt)}
                          {r.userId && staff.data ? ` · ${staff.data.find((s) => s.id === r.userId)?.name ?? ''}` : ''}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Quotations" actions={can('quotations.manage') && manage && <Link to={`/admin/quotations/new?inquiryId=${inq.id}`} className="text-xs text-adm-gold hover:underline">New</Link>} bodyClassName="p-0">
            {inq.quotations.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-adm-muted">No quotations yet.</p>
            ) : (
              <ul className="divide-y divide-adm-line">
                {inq.quotations.map((x) => {
                  const row = (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{x.title}</p>
                        <p className="text-xs text-adm-muted">
                          {x.number} · v{x.currentVersion} · {money(x.versions[0]?.totalMinor)}
                        </p>
                      </div>
                      <StatusBadge status={x.status} />
                    </>
                  );
                  return (
                    <li key={x.id}>
                      {can('quotations.manage') ? (
                        <Link to={`/admin/quotations/${x.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-adm-bg/60">
                          {row}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-5 py-3">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {inq.bookings.length > 0 && (
            <Card title="Bookings" bodyClassName="p-0">
              <ul className="divide-y divide-adm-line">
                {inq.bookings.map((b) => (
                  <li key={b.id}>
                    <Link to={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-adm-bg/60">
                      <span className="font-mono text-xs">{b.reference}</span>
                      <StatusBadge status={b.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>

      <ConsultationModal
        open={modal === 'consult'}
        existing={editingConsult}
        inquiryId={inq.id}
        onDone={refresh}
        onClose={() => {
          setModal(null);
          setEditingConsult(null);
        }}
      />
      <LogCommunicationModal open={modal === 'log'} onClose={() => setModal(null)} path={`/admin/inquiries/${inq.id}/communications`} onDone={refresh} defaultKind="CALL" />
      <SendEmailModal open={modal === 'email'} onClose={() => setModal(null)} inquiryId={inq.id} to={inq.email} onDone={refresh} />
      <ReminderModal open={modal === 'reminder'} onClose={() => setModal(null)} inquiryId={inq.id} onDone={refresh} />
      <Modal
        open={modal === 'lost'}
        onClose={() => setModal(null)}
        title="Mark inquiry as lost"
        size="sm"
        footer={
          <>
            <button className="adm-btn-secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="adm-btn-danger"
              disabled={!lostReason.trim() || patch.isPending}
              onClick={() => patch.mutate({ status: 'LOST', lostReason: lostReason.trim() }, { onSuccess: () => setModal(null) })}
            >
              Mark as lost
            </button>
          </>
        }
      >
        <Field label="Reason" required hint="Helps reporting on why leads are lost (budget, date, competitor…).">
          <Textarea rows={3} maxLength={300} value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

function Multiline({ text }: { text: string }) {
  return text ? <span className="whitespace-pre-line">{text}</span> : <span className="text-adm-muted">—</span>;
}

function AiPanel({ inq, manage, onReview, busy }: { inq: Inq; manage: boolean; onReview: (v: boolean) => void; busy: boolean }) {
  const ai = inq.aiClassification!;
  return (
    <section className="rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-5" aria-label="AI suggestion">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-violet-900">
          <Sparkles className="h-4 w-4" /> AI suggestion — review before acting
        </p>
        {ai.reviewed ? (
          <span className="flex items-center gap-2">
            <Badge tone="green">Reviewed</Badge>
            {manage && (
              <button className="text-xs text-violet-700 hover:underline" disabled={busy} onClick={() => onReview(false)}>
                Undo
              </button>
            )}
          </span>
        ) : (
          manage && (
            <button className="adm-btn-secondary py-1 text-xs" disabled={busy} onClick={() => onReview(true)}>
              <Check className="h-3.5 w-3.5" /> Mark reviewed
            </button>
          )
        )}
      </div>
      {ai.summary && <p className="mt-3 text-sm text-violet-950/90">{ai.summary}</p>}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {ai.category && (
          <p>
            <span className="text-xs text-violet-800/70">Suggested category </span>
            {ai.category}
          </p>
        )}
        {ai.priority && (
          <p className="flex items-center gap-1.5">
            <span className="text-xs text-violet-800/70">Priority</span>
            <Badge tone={ai.priority === 'high' ? 'red' : ai.priority === 'medium' ? 'amber' : 'gray'}>{titleCase(ai.priority)}</Badge>
          </p>
        )}
      </div>
      {!!ai.suggestedServices?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ai.suggestedServices.map((s) => (
            <Badge key={s} tone="violet">
              {s}
            </Badge>
          ))}
        </div>
      )}
      {ai.generatedAt && <p className="mt-3 text-xs text-violet-800/60">Generated {fromNow(ai.generatedAt)}. Suggestions are never applied automatically.</p>}
    </section>
  );
}

function EventDetails({ inq, manage, onSaved }: { inq: Inq; manage: boolean; onSaved: () => void }) {
  const { bootstrap } = useSite();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const init = () => ({ eventType: inq.eventType, eventDate: inq.eventDate?.slice(0, 10) ?? '', location: inq.location, guestCount: String(inq.guestCount), budgetRange: inq.budgetRange, categoryId: inq.categoryId ?? '' });
  const [f, setF] = useState(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: () => api.patch(`/admin/inquiries/${inq.id}`, { eventType: f.eventType, eventDate: f.eventDate || null, location: f.location, guestCount: Number(f.guestCount), budgetRange: f.budgetRange, categoryId: f.categoryId || null }),
    onSuccess: () => {
      toast.success('Event details saved');
      setEditing(false);
      onSaved();
    },
    onError: (err) => {
      setErrs(fieldErrorsOf(err));
      toast.error('Could not save', errorMessage(err));
    },
  });
  const bind = (k: keyof ReturnType<typeof init>) => ({ value: f[k], invalid: !!errs[k], onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const actions: ReactNode = manage && !editing && (
    <button
      className="adm-btn-ghost px-2 py-1 text-xs"
      onClick={() => {
        setF(init());
        setErrs({});
        setEditing(true);
      }}
    >
      <Pencil className="h-3.5 w-3.5" /> Edit
    </button>
  );
  return (
    <Card title="Event details" actions={actions}>
      {editing ? (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Event type" required error={errs.eventType}>
            <Input required maxLength={80} {...bind('eventType')} />
          </Field>
          <Field label="Category" error={errs.categoryId}>
            <Select {...bind('categoryId')}>
              <option value="">Uncategorised</option>
              {bootstrap?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Event date" hint="Empty = flexible" error={errs.eventDate}>
            <Input type="date" {...bind('eventDate')} />
          </Field>
          <Field label="Location" required error={errs.location}>
            <Input required maxLength={160} {...bind('location')} />
          </Field>
          <Field label="Guests" required error={errs.guestCount}>
            <Input type="number" min={1} max={100000} required {...bind('guestCount')} />
          </Field>
          <Field label="Budget" error={errs.budgetRange}>
            <Input maxLength={60} {...bind('budgetRange')} />
          </Field>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="adm-btn-secondary" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="adm-btn-primary" disabled={m.isPending}>
              {m.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      ) : (
        <KeyValue
          cols={3}
          items={[
            ['Event type', inq.eventType],
            ['Category', inq.category?.name ?? 'Uncategorised'],
            ['Event date', inq.eventDate ? fmtDate(inq.eventDate.slice(0, 10)) + (inq.dateFlexible ? ' (flexible)' : '') : 'Flexible'],
            ['Alternative date', inq.alternativeDate ? fmtDate(inq.alternativeDate.slice(0, 10)) : '—'],
            ['Location', inq.location],
            ['Guests', inq.guestCount.toLocaleString()],
            ['Budget', inq.budgetRange],
            ['Source', titleCase(inq.source)],
            ['Received', fmtDateTime(inq.createdAt)],
          ]}
        />
      )}
    </Card>
  );
}

function ReferenceImages({ inq }: { inq: Inq }) {
  const [idx, setIdx] = useState<number | null>(null);
  const images = inq.attachments.map((a) => ({ url: api.url(`/admin/inquiries/${inq.id}/attachments/${a.mediaId}`), alt: a.filename || 'Reference image', caption: a.filename }));
  return (
    <Card title={`Reference images (${images.length})`}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.url}>
            <button className="group block aspect-square w-full overflow-hidden rounded-lg bg-adm-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-adm-gold" onClick={() => setIdx(i)} aria-label={`View ${img.alt}`}>
              <Img src={img.url} alt={img.alt} width={300} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" fallbackClassName="bg-adm-bg" />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox images={images} index={idx} onClose={() => setIdx(null)} onIndex={setIdx} />
    </Card>
  );
}
