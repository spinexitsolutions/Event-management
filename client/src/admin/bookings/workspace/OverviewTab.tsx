import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ExternalLink, Globe, Mail, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, money } from '@/lib/format';
import { Card, Field, Input, KeyValue, MoneyInput, Select, Textarea } from '@/admin/ui';
import type { TabProps } from '../pages/BookingWorkspace';
import type { BookingDetail, BookingServiceLine } from '../types';
import { fieldErrors, isConflict, useRefreshBooking } from '../shared/hooks';
import { useVenues } from '../shared/NewBookingModal';
import { Alert } from '../shared/ui';

type Form = {
  title: string;
  eventDate: string;
  eventEndDate: string;
  startTime: string;
  venueId: string;
  venueName: string;
  city: string;
  guestCount: string;
  categoryId: string;
  requirements: string;
  clientVisibleNotes: string;
};
const toForm = (b: BookingDetail): Form => ({
  title: b.title,
  eventDate: b.eventDate,
  eventEndDate: b.eventEndDate ?? '',
  startTime: b.startTime,
  venueId: b.venueId ?? '',
  venueName: b.venueName,
  city: b.city,
  guestCount: b.guestCount ? String(b.guestCount) : '',
  categoryId: b.categoryId ?? '',
  requirements: b.requirements,
  clientVisibleNotes: b.clientVisibleNotes,
});
const LABELS: Record<keyof Form, string> = {
  title: 'Title',
  eventDate: 'Event date',
  eventEndDate: 'End date',
  startTime: 'Start time',
  venueId: 'Venue',
  venueName: 'Venue name',
  city: 'City',
  guestCount: 'Guests',
  categoryId: 'Category',
  requirements: 'Requirements',
  clientVisibleNotes: 'Notes for client',
};

export default function OverviewTab({ booking: b }: TabProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <DetailsCard booking={b} />
        <ServicesCard booking={b} />
      </div>
      <aside className="space-y-6">
        <ClientCard booking={b} />
        <LinksCard booking={b} />
        {b.feedback && (
          <Card title="Client feedback">
            <div className="flex gap-0.5 text-adm-gold" aria-label={`${b.feedback.rating} out of 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4" fill={i < b.feedback!.rating ? 'currentColor' : 'none'} />
              ))}
            </div>
            {b.feedback.comment && <p className="mt-2 text-sm italic text-adm-muted">“{b.feedback.comment}”</p>}
          </Card>
        )}
      </aside>
    </div>
  );
}

function DetailsCard({ booking: b }: TabProps) {
  const { can } = useAuth();
  const { bootstrap } = useSite();
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const venues = useVenues();
  const editable = can('bookings.manage') && b.status !== 'CANCELLED';
  const canVenues = can('venues.manage');
  const initial = useMemo(() => toForm(b), [b]);
  const [f, setF] = useState<Form>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  useEffect(() => setF(initial), [initial]);
  const changed = (Object.keys(f) as (keyof Form)[]).filter((k) => f[k] !== initial[k]);
  const set = (k: keyof Form, v: string) => setF((x) => ({ ...x, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const k of changed) {
        const v = f[k];
        if (k === 'guestCount') body[k] = v ? Number(v) : null;
        else if (k === 'eventEndDate' || k === 'venueId' || k === 'categoryId') body[k] = v || null;
        else body[k] = typeof v === 'string' && k !== 'requirements' && k !== 'clientVisibleNotes' ? v.trim() : v;
      }
      if (body.venueId !== undefined && !f.venueId) body.venueName = f.venueName.trim();
      return api.patch(`/admin/bookings/${b.id}`, body);
    },
    onSuccess: () => {
      toast.success('Booking updated', `${changed.length} field${changed.length === 1 ? '' : 's'} changed — recorded in the audit log.`);
      setConflict(null);
      setErrors({});
      refresh();
    },
    onError: (err) => {
      if (isConflict(err)) return setConflict(errorMessage(err));
      setErrors(fieldErrors(err));
      toast.error('Could not save', errorMessage(err));
    },
  });
  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.title.trim()) e.title = 'Title is required';
    if (!f.eventDate) e.eventDate = 'Event date is required';
    if (f.eventEndDate && f.eventEndDate < f.eventDate) e.eventEndDate = 'Must be on or after the event date';
    if (f.guestCount && Number(f.guestCount) < 1) e.guestCount = 'At least 1';
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <Card
      title="Event details"
      actions={
        editable && changed.length > 0 ? (
          <>
            <button className="adm-btn-ghost !py-1.5" onClick={() => (setF(initial), setConflict(null), setErrors({}))}>
              Discard
            </button>
            <button className="adm-btn-primary !py-1.5" onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : `Save ${changed.length} change${changed.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : null
      }
    >
      <fieldset disabled={!editable} className="space-y-4">
        <Field label="Title" required error={errors.title}>
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} invalid={!!errors.title} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Event date" required error={errors.eventDate}>
            <Input type="date" value={f.eventDate} onChange={(e) => (set('eventDate', e.target.value), setConflict(null))} invalid={!!errors.eventDate} />
          </Field>
          <Field label="End date" error={errors.eventEndDate}>
            <Input type="date" value={f.eventEndDate} min={f.eventDate} onChange={(e) => (set('eventEndDate', e.target.value), setConflict(null))} invalid={!!errors.eventEndDate} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {canVenues && (
            <Field label="Venue" hint="Exclusive venues are checked for clashes on save.">
              <Select
                value={f.venueId}
                onChange={(e) => {
                  const v = venues.data?.find((x) => x.id === e.target.value);
                  setF((x) => ({ ...x, venueId: e.target.value, venueName: v?.name ?? x.venueName, city: v?.city || x.city }));
                  setConflict(null);
                }}
              >
                <option value="">Other (enter name)</option>
                {venues.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` — ${v.city}` : ''}
                  </option>
                ))}
                {b.venue && !venues.data?.some((v) => v.id === b.venue!.id) && <option value={b.venue.id}>{b.venue.name}</option>}
              </Select>
            </Field>
          )}
          <Field label="Venue name" hint={f.venueId ? 'Linked venue — name shown to the client.' : undefined}>
            <Input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} maxLength={200} />
          </Field>
          <Field label="City">
            <Input value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} />
          </Field>
          <Field label="Guests" error={errors.guestCount}>
            <Input inputMode="numeric" value={f.guestCount} onChange={(e) => set('guestCount', e.target.value.replace(/\D/g, ''))} invalid={!!errors.guestCount} />
          </Field>
          <Field label="Category">
            <Select value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">—</option>
              {bootstrap?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {b.category && !bootstrap?.categories.some((c) => c.id === b.category!.id) && <option value={b.category.id}>{b.category.name}</option>}
            </Select>
          </Field>
        </div>
        <Field label="Requirements" hint="Internal brief for the team.">
          <Textarea rows={4} value={f.requirements} onChange={(e) => set('requirements', e.target.value)} maxLength={10000} />
        </Field>
        <Field label="Notes visible to client" hint="Shown on the client’s portal page for this event.">
          <Textarea rows={3} value={f.clientVisibleNotes} onChange={(e) => set('clientVisibleNotes', e.target.value)} maxLength={5000} />
        </Field>
      </fieldset>
      {changed.length > 0 && editable && (
        <p className="mt-4 text-xs text-adm-muted" aria-live="polite">
          Unsaved: {changed.map((k) => LABELS[k]).join(', ')}. Saved changes are recorded with your name in the audit log.
        </p>
      )}
      {conflict && (
        <Alert tone="error" title="Venue not available" className="mt-4">
          {conflict}
        </Alert>
      )}
    </Card>
  );
}

function ServicesCard({ booking: b }: TabProps) {
  const { can } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBooking(b.id);
  const editable = can('bookings.manage') && b.status !== 'CANCELLED';
  const showMoney = can('finance.view');
  const initial = useMemo<BookingServiceLine[]>(() => b.services.map((s) => ({ serviceId: s.serviceId, name: s.name, description: s.description, amountMinor: Number(s.amountMinor) })), [b.services]);
  const [lines, setLines] = useState(initial);
  const [editing, setEditing] = useState(false);
  useEffect(() => setLines(initial), [initial]);
  const total = lines.reduce((s, l) => s + (l.amountMinor || 0), 0);
  const save = useMutation({
    mutationFn: () => api.put(`/admin/bookings/${b.id}/services`, { services: lines.map((l) => ({ ...l, name: l.name.trim(), description: l.description.trim() })) }),
    onSuccess: () => {
      toast.success('Services saved');
      setEditing(false);
      refresh();
    },
    onError: (err) => toast.error('Could not save services', errorMessage(err)),
  });
  const update = (i: number, patch: Partial<BookingServiceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) =>
    setLines((ls) => {
      const n = [...ls];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  const invalid = lines.some((l) => !l.name.trim());

  return (
    <Card
      title="Services"
      actions={
        editable &&
        (editing ? (
          <>
            <button className="adm-btn-ghost !py-1.5" onClick={() => (setLines(initial), setEditing(false))}>
              Cancel
            </button>
            <button className="adm-btn-primary !py-1.5" disabled={invalid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save services'}
            </button>
          </>
        ) : (
          <button className="adm-btn-secondary !py-1.5" onClick={() => setEditing(true)}>
            Edit
          </button>
        ))
      }
      bodyClassName="p-0"
    >
      {!editing ? (
        lines.length ? (
          <ul className="divide-y divide-adm-line">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{l.name}</p>
                  {l.description && <p className="mt-0.5 text-sm text-adm-muted">{l.description}</p>}
                </div>
                {showMoney && <span className="whitespace-nowrap text-sm tabular-nums">{money(l.amountMinor, b.currency)}</span>}
              </li>
            ))}
            {showMoney && (
              <li className="flex justify-between bg-adm-bg/50 px-5 py-3 text-sm">
                <span className="text-adm-muted">Services total {b.contractValueMinor !== null && total !== b.contractValueMinor ? '(contract value differs — includes tax/discounts)' : ''}</span>
                <span className="font-semibold tabular-nums">{money(total, b.currency)}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-adm-muted">No services listed for this booking yet.</p>
        )
      ) : (
        <div className="space-y-3 p-5">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-adm-line p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field label="Service" required error={!l.name.trim() ? 'Required' : undefined}>
                  <Input value={l.name} onChange={(e) => update(i, { name: e.target.value })} maxLength={160} />
                </Field>
                {showMoney ? (
                  <Field label="Amount">
                    <MoneyInput value={l.amountMinor} onChange={(v) => update(i, { amountMinor: v ?? 0 })} currency={b.currency} />
                  </Field>
                ) : (
                  <div />
                )}
              </div>
              <Field label="Description" className="mt-3">
                <Input value={l.description} onChange={(e) => update(i, { description: e.target.value })} maxLength={600} />
              </Field>
              <div className="mt-2 flex justify-end gap-1">
                <button type="button" className="adm-btn-ghost !px-2 !py-1" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l.name || 'service'} up`}>
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className="adm-btn-ghost !px-2 !py-1" disabled={i === lines.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${l.name || 'service'} down`}>
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button type="button" className="adm-btn-ghost !px-2 !py-1 text-red-600" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove ${l.name || 'service'}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" className="adm-btn-secondary !w-full" onClick={() => setLines((ls) => [...ls, { serviceId: null, name: '', description: '', amountMinor: 0 }])}>
            <Plus className="h-4 w-4" /> Add service
          </button>
          <p className="text-xs text-adm-muted">Editing services does not change the contract value. Use Finance → Change contract value for an approved change in scope.</p>
        </div>
      )}
    </Card>
  );
}

function ClientCard({ booking: b }: TabProps) {
  const { can } = useAuth();
  return (
    <Card title="Client" actions={can('clients.view') ? <Link to={`/admin/clients/${b.client.id}`} className="text-xs text-adm-gold hover:underline">Profile</Link> : undefined}>
      <p className="font-medium">{b.client.name}</p>
      {b.client.company && <p className="text-sm text-adm-muted">{b.client.company}</p>}
      <div className="mt-3 space-y-1.5 text-sm">
        <a href={`mailto:${b.client.email}`} className="flex items-center gap-2 text-adm-ink hover:text-adm-gold">
          <Mail className="h-4 w-4 text-adm-muted" /> <span className="truncate">{b.client.email}</span>
        </a>
        {b.client.phone && (
          <a href={`tel:${b.client.phone}`} className="flex items-center gap-2 text-adm-ink hover:text-adm-gold">
            <Phone className="h-4 w-4 text-adm-muted" /> {b.client.phone}
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-adm-muted">{b.client.userId ? 'Has client-portal access' : 'No portal account yet — invite from the client profile.'}</p>
    </Card>
  );
}

function LinksCard({ booking: b }: TabProps) {
  const { can } = useAuth();
  return (
    <Card title="Record">
      <KeyValue
        cols={1}
        items={[
          ['Created', fmtDateTime(b.createdAt)],
          ['Contract signed', b.contractSignedAt ? fmtDate(b.contractSignedAt) : 'Not yet'],
          ...(b.confirmedAt ? ([['Confirmed', fmtDate(b.confirmedAt)]] as [string, string][]) : []),
          ...(b.completedAt ? ([['Completed', fmtDate(b.completedAt)]] as [string, string][]) : []),
          [
            'Quotation',
            b.quotation ? (
              can('quotations.manage') ? (
                <Link to={`/admin/quotations/${b.quotation.id}`} className="text-adm-gold hover:underline">
                  {b.quotation.number}
                  {b.quotation.acceptedVersion ? ` · v${b.quotation.acceptedVersion} accepted` : ''}
                </Link>
              ) : (
                b.quotation.number
              )
            ) : (
              'Manual booking'
            ),
          ],
          ...(b.inquiry
            ? ([
                [
                  'Inquiry',
                  can('inquiries.view') ? (
                    <Link to={`/admin/inquiries/${b.inquiry.id}`} className="text-adm-gold hover:underline">
                      {b.inquiry.reference}
                    </Link>
                  ) : (
                    b.inquiry.reference
                  ),
                ],
              ] as [string, ReactNode][])
            : []),
          [
            'Event microsite',
            b.microsite ? (
              b.microsite.enabled ? (
                <a href={`/e/${b.microsite.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-adm-gold hover:underline">
                  <Globe className="h-3.5 w-3.5" /> /e/{b.microsite.slug} <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span>Draft (hidden) — /e/{b.microsite.slug}</span>
              )
            ) : (
              'Not set up'
            ),
          ],
        ]}
      />
    </Card>
  );
}
