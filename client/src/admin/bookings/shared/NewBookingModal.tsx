import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthProvider';
import { useSite } from '@/app/SiteProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, errorMessage } from '@/lib/api';
import { Field, Input, MoneyInput, Select } from '@/admin/ui';
import { fieldErrors, isConflict, todayIso, useStaff } from './hooks';
import { Alert, ClientPicker, type ClientLite } from './ui';

export interface VenueOption {
  id: string;
  name: string;
  city: string;
  capacityMax: number | null;
  exclusive: boolean;
}

export function useVenues(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['venue-options'],
    queryFn: () => api.get<VenueOption[]>('/admin/content/venues', { limit: 200 }),
    enabled: enabled && can('venues.manage'),
    staleTime: 5 * 60_000,
  });
}

const empty = { title: '', eventDate: '', eventEndDate: '', startTime: '', venueId: '', venueName: '', city: '', guestCount: '', categoryId: '', contractValueMinor: 0 as number | null, managerId: '' };

/** Manual booking for a contract agreed outside the quotation flow. */
export function NewBookingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can, user } = useAuth();
  const { bootstrap } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const staff = useStaff();
  const venues = useVenues(open);
  const canVenues = can('venues.manage');
  const [client, setClient] = useState<ClientLite | null>(null);
  const [f, setF] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setClient(null);
    setF({ ...empty, managerId: user?.id ?? '' });
    setErrors({});
    setConflict(null);
    setServerError(null);
  }, [open, user?.id]);

  const set = (k: keyof typeof empty, v: string | number | null) => {
    setF((x) => ({ ...x, [k]: v }));
    if (k === 'venueId' || k === 'eventDate' || k === 'eventEndDate') setConflict(null);
  };

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; reference: string }>('/admin/bookings', {
        clientId: client!.id,
        title: f.title.trim(),
        eventDate: f.eventDate,
        eventEndDate: f.eventEndDate || null,
        startTime: f.startTime,
        venueId: f.venueId || null,
        venueName: f.venueName.trim(),
        city: f.city.trim(),
        guestCount: f.guestCount ? Number(f.guestCount) : null,
        categoryId: f.categoryId || null,
        contractValueMinor: f.contractValueMinor ?? 0,
        managerId: f.managerId || null,
      }),
    onSuccess: (b) => {
      toast.success(`Booking ${b.reference} created`, 'Add the instalment schedule in the Finance tab.');
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      onClose();
      nav(`/admin/bookings/${b.id}?tab=${can('finance.view') ? 'finance' : 'overview'}`);
    },
    onError: (err) => {
      if (isConflict(err)) return setConflict(errorMessage(err));
      setErrors(fieldErrors(err));
      setServerError(errorMessage(err));
    },
  });

  const submit = () => {
    const e: Record<string, string> = {};
    if (!client) e.clientId = 'Choose the client';
    if (!f.title.trim()) e.title = 'Give the booking a title';
    if (!f.eventDate) e.eventDate = 'Choose the event date';
    if (f.eventEndDate && f.eventDate && f.eventEndDate < f.eventDate) e.eventEndDate = 'End date must be on or after the start date';
    if (f.guestCount && (!/^\d+$/.test(f.guestCount) || Number(f.guestCount) < 1)) e.guestCount = 'Enter a whole number';
    if (f.contractValueMinor === null || f.contractValueMinor < 0) e.contractValueMinor = 'Enter the agreed contract value';
    setErrors(e);
    if (Object.keys(e).length) return;
    setServerError(null);
    create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New booking"
      size="lg"
      footer={
        <>
          <button className="adm-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="adm-btn-primary" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create booking'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-adm-muted">For contracts agreed outside the quotation flow. Bookings created from accepted quotations are converted from the quotation itself.</p>
        <ClientPicker value={client} onChange={setClient} required error={errors.clientId} />
        <Field label="Event title" required error={errors.title}>
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Mehta–Kapoor wedding weekend" maxLength={160} invalid={!!errors.title} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Event date" required error={errors.eventDate}>
            <Input type="date" value={f.eventDate} min={todayIso()} onChange={(e) => set('eventDate', e.target.value)} invalid={!!errors.eventDate} />
          </Field>
          <Field label="End date" error={errors.eventEndDate} hint="Multi-day events">
            <Input type="date" value={f.eventEndDate} min={f.eventDate || undefined} onChange={(e) => set('eventEndDate', e.target.value)} invalid={!!errors.eventEndDate} />
          </Field>
          <Field label="Start time">
            <Input type="time" value={f.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {canVenues ? (
            <Field label="Venue" hint={venues.isError ? 'Venues could not be loaded — type the venue name instead.' : 'Exclusive venues are checked for date conflicts.'}>
              <Select
                value={f.venueId}
                onChange={(e) => {
                  const v = venues.data?.find((x) => x.id === e.target.value);
                  setF((x) => ({ ...x, venueId: e.target.value, city: v?.city || x.city }));
                  setConflict(null);
                }}
              >
                <option value="">Other / not decided</option>
                {venues.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.city ? ` — ${v.city}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {(!canVenues || !f.venueId) && (
            <Field label="Venue name">
              <Input value={f.venueName} onChange={(e) => set('venueName', e.target.value)} maxLength={200} />
            </Field>
          )}
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
            </Select>
          </Field>
          <Field label="Contract value" required error={errors.contractValueMinor} hint="Instalments must add up to this amount.">
            <MoneyInput value={f.contractValueMinor} onChange={(v) => set('contractValueMinor', v)} invalid={!!errors.contractValueMinor} />
          </Field>
          <Field label="Event manager">
            <Select value={f.managerId} onChange={(e) => set('managerId', e.target.value)}>
              <option value="">Unassigned</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {conflict && (
          <Alert tone="error" title="Venue not available">
            {conflict}. Choose another date or venue.
          </Alert>
        )}
        {serverError && !conflict && <Alert tone="error">{serverError}</Alert>}
      </div>
    </Modal>
  );
}
