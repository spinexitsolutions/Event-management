import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Search, Trash2, X } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, Field, Input, Select, Textarea, Toggle } from '@/admin/ui';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { api, apiRequest, ApiError, errorMessage } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { addDaysLocal, fieldErrorsOf, toLocalInput, useStaffDirectory, ymd } from '../shared';
import { ENTRY_TYPE_LABELS, ENTRY_TYPES, type EntryType } from './model';

interface BookingRef {
  id: string;
  reference: string;
  title: string;
}
interface EntryRow {
  id: string;
  title: string;
  type: EntryType;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  bookingId: string | null;
  venueId: string | null;
  assigneeId: string | null;
  notes: string;
  booking: BookingRef | null;
  venue: { id: string; name: string } | null;
}
interface VenueBookingWarning {
  id: string;
  reference: string;
  title: string;
  eventDate: string | null;
  eventEndDate: string | null;
  status: string;
}

export interface EntryDraftSeed {
  date?: Date;
  hour?: number;
}

/** Booking search (requires bookings.view). */
function BookingPicker({ value, onChange }: { value: BookingRef | null; onChange: (b: BookingRef | null) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const listId = useId();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ['booking-search', debounced],
    queryFn: () => api.get<BookingRef[]>('/admin/bookings', { q: debounced, limit: 8, scope: 'all' }),
    enabled: debounced.length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-adm-line bg-adm-bg/50 px-3 py-2 text-sm">
        <span className="min-w-0 truncate">
          <span className="font-medium">{value.reference}</span> · {value.title}
        </span>
        <button type="button" className="text-adm-muted hover:text-red-600" onClick={() => onChange(null)} aria-label="Remove linked booking">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adm-muted" aria-hidden />
      <input className="adm-input !pl-9" placeholder="Search by reference, title or client…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search bookings" aria-controls={listId} />
      {debounced.length >= 2 && (
        <ul id={listId} className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-adm-line bg-white py-1 shadow-xl" role="listbox">
          {results.isLoading && <li className="px-3 py-2 text-xs text-adm-muted">Searching…</li>}
          {results.isError && <li className="px-3 py-2 text-xs text-red-600">{errorMessage(results.error)}</li>}
          {results.data?.length === 0 && <li className="px-3 py-2 text-xs text-adm-muted">No bookings match “{debounced}”.</li>}
          {results.data?.map((b) => (
            <li key={b.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-adm-bg focus:bg-adm-bg focus:outline-none"
                onClick={() => {
                  onChange({ id: b.id, reference: b.reference, title: b.title });
                  setQ('');
                }}
              >
                <span className="font-medium">{b.reference}</span> · {b.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Create / edit a manual calendar entry with venue clash handling. */
export function EntryForm({ open, entryId, seed, onClose }: { open: boolean; entryId: string | null; seed: EntryDraftSeed | null; onClose: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useStaffDirectory();
  const venues = useQuery({
    queryKey: ['venues-select'],
    queryFn: () => api.get<{ id: string; name: string; city: string; exclusive: boolean }[]>('/admin/content/venues', { limit: 200 }),
    enabled: open && can('venues.manage'),
    staleTime: 5 * 60_000,
  });
  const existing = useQuery({ queryKey: ['calendar-entry', entryId], queryFn: () => api.get<EntryRow>(`/admin/calendar/entries/${entryId}`), enabled: open && !!entryId });

  const [title, setTitle] = useState('');
  const [type, setType] = useState<EntryType>('MEETING');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [booking, setBooking] = useState<BookingRef | null>(null);
  const [venueId, setVenueId] = useState('');
  const [venueName, setVenueName] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState('');
  const [warnings, setWarnings] = useState<VenueBookingWarning[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Initialise the form when opened.
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setConflict('');
    setWarnings(null);
    if (entryId) return;
    const base = seed?.date ?? new Date();
    const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), seed?.hour ?? 10, 0);
    setTitle('');
    setType('MEETING');
    setAllDay(false);
    setStartDate(ymd(base));
    setEndDate(ymd(base));
    setStart(toLocalInput(s));
    setEnd(toLocalInput(new Date(s.getTime() + 60 * 60_000)));
    setBooking(null);
    setVenueId('');
    setVenueName('');
    setAssigneeId('');
    setNotes('');
  }, [open, entryId, seed]);

  useEffect(() => {
    const e = existing.data;
    if (!open || !entryId || !e) return;
    setTitle(e.title);
    setType(e.type);
    setAllDay(e.allDay);
    const s = new Date(e.startsAt);
    const en = new Date(e.endsAt);
    if (e.allDay) {
      setStartDate(e.startsAt.slice(0, 10));
      setEndDate(e.endsAt.slice(0, 10));
      setStart(`${e.startsAt.slice(0, 10)}T10:00`);
      setEnd(`${e.startsAt.slice(0, 10)}T11:00`);
    } else {
      setStart(toLocalInput(s));
      setEnd(toLocalInput(en));
      setStartDate(ymd(s));
      setEndDate(ymd(en));
    }
    setBooking(e.booking);
    setVenueId(e.venueId ?? '');
    setVenueName(e.venue?.name ?? '');
    setAssigneeId(e.assigneeId ?? '');
    setNotes(e.notes);
  }, [existing.data, open, entryId]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        type,
        allDay,
        startsAt: allDay ? startDate : new Date(start).toISOString(),
        endsAt: allDay ? endDate || startDate : new Date(end).toISOString(),
        bookingId: booking?.id ?? null,
        venueId: venueId || null,
        assigneeId: assigneeId || null,
        notes: notes.trim(),
      };
      return apiRequest<EntryRow>(entryId ? `/admin/calendar/entries/${entryId}` : '/admin/calendar/entries', { method: entryId ? 'PUT' : 'POST', body });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['calendar-feed'] });
      qc.invalidateQueries({ queryKey: ['calendar-entry'] });
      const w = ((res.meta as { warnings?: { venueBookings?: VenueBookingWarning[] } } | undefined)?.warnings?.venueBookings ?? []) as VenueBookingWarning[];
      toast.success(entryId ? 'Entry updated' : 'Entry added to the calendar');
      if (w.length) setWarnings(w);
      else onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(err.message);
        return;
      }
      setErrors(fieldErrorsOf(err));
      toast.error('Could not save the entry', errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/calendar/entries/${entryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-feed'] });
      toast.success('Entry deleted');
      setConfirmDelete(false);
      onClose();
    },
    onError: (err) => toast.error('Could not delete the entry', errorMessage(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Title is required';
    if (allDay) {
      if (!startDate) errs.startsAt = 'Choose a start date';
      if (endDate && startDate && endDate < startDate) errs.endsAt = 'The end date must be on or after the start date';
    } else {
      if (!start) errs.startsAt = 'Choose a start time';
      if (!end) errs.endsAt = 'Choose an end time';
      if (start && end && new Date(end) <= new Date(start)) errs.endsAt = 'The end time must be after the start time';
    }
    setErrors(errs);
    setConflict('');
    if (Object.keys(errs).length) return;
    save.mutate();
  };

  const loading = !!entryId && existing.isLoading;
  const venueOptions = venues.data ?? [];

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={warnings ? 'Saved — please review' : entryId ? 'Edit calendar entry' : 'New calendar entry'}
        size="md"
        footer={
          warnings ? (
            <button className="adm-btn-primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <>
              {entryId && (
                <button type="button" className="adm-btn-ghost mr-auto text-red-600 hover:text-red-700" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
              <button type="button" className="adm-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" form="entry-form" className="adm-btn-primary" disabled={save.isPending || loading}>
                {save.isPending ? 'Saving…' : entryId ? 'Save changes' : 'Add entry'}
              </button>
            </>
          )
        }
      >
        {warnings ? (
          <div className="space-y-3 text-sm" aria-live="polite">
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>The entry was saved, but this venue also has active bookings on those dates. Check that they don’t clash.</p>
            </div>
            <ul className="divide-y divide-adm-line rounded-lg border border-adm-line">
              {warnings.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{b.reference}</span> · {b.title}
                    <span className="block text-xs text-adm-muted">
                      {fmtDate(b.eventDate)}
                      {b.eventEndDate && b.eventEndDate !== b.eventDate ? ` – ${fmtDate(b.eventEndDate)}` : ''}
                    </span>
                  </span>
                  <Link to={`/admin/bookings/${b.id}`} className="text-xs font-medium text-adm-gold hover:underline">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : loading ? (
          <div className="space-y-3" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-adm-line/60" />
            ))}
          </div>
        ) : existing.isError ? (
          <p className="text-sm text-red-600" role="alert">
            {errorMessage(existing.error)}
          </p>
        ) : (
          <form id="entry-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            {conflict && (
              <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div>
                  <p className="font-medium">Venue already booked</p>
                  <p>{conflict}. Choose another time or venue.</p>
                </div>
              </div>
            )}
            <Field label="Title" required error={errors.title} className="sm:col-span-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} invalid={!!errors.title} placeholder="e.g. Venue walkthrough with decorator" />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as EntryType)} options={ENTRY_TYPES.map((t) => ({ value: t, label: ENTRY_TYPE_LABELS[t] }))} aria-label="Entry type" />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle checked={allDay} onChange={setAllDay} label="All-day" />
            </div>
            {allDay ? (
              <>
                <Field label="Start date" required error={errors.startsAt}>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    invalid={!!errors.startsAt}
                  />
                </Field>
                <Field label="End date" error={errors.endsAt}>
                  <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} invalid={!!errors.endsAt} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Starts" required error={errors.startsAt}>
                  <Input
                    type="datetime-local"
                    value={start}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v && start && end) {
                        const dur = new Date(end).getTime() - new Date(start).getTime();
                        if (dur > 0) setEnd(toLocalInput(new Date(new Date(v).getTime() + dur)));
                      }
                      setStart(v);
                    }}
                    invalid={!!errors.startsAt}
                  />
                </Field>
                <Field label="Ends" required error={errors.endsAt}>
                  <Input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} invalid={!!errors.endsAt} />
                </Field>
              </>
            )}
            {can('bookings.view') ? (
              <Field label="Linked booking" className="sm:col-span-2" error={errors.bookingId}>
                <BookingPicker value={booking} onChange={setBooking} />
              </Field>
            ) : booking ? (
              <Field label="Linked booking" className="sm:col-span-2">
                <p className="text-sm">
                  {booking.reference} · {booking.title}
                </p>
              </Field>
            ) : null}
            {can('venues.manage') ? (
              <Field label="Venue" error={errors.venueId} hint="Exclusive venues cannot hold two entries at the same time.">
                <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Venue">
                  <option value="">No venue</option>
                  {venueOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.city ? ` — ${v.city}` : ''}
                    </option>
                  ))}
                  {venueId && !venueOptions.some((v) => v.id === venueId) && <option value={venueId}>{venueName || 'Current venue'}</option>}
                </Select>
              </Field>
            ) : venueName ? (
              <Field label="Venue">
                <p className="py-2 text-sm">{venueName}</p>
              </Field>
            ) : null}
            <Field label="Assignee" error={errors.assigneeId}>
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Assignee">
                <option value="">Unassigned</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
              <Textarea rows={3} value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, contacts, access instructions…" />
            </Field>
            {allDay && startDate && (
              <p className="text-xs text-adm-muted sm:col-span-2">
                Spans {Math.round((new Date(endDate || startDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1} day(s), ending {fmtDate(addDaysLocal(new Date(`${endDate || startDate}T00:00`), 0))}.
              </p>
            )}
          </form>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        body="It will be removed from everyone’s calendar. This cannot be undone."
        confirmLabel="Delete entry"
        danger
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
