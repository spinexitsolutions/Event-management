import { VENDOR_CATEGORIES } from '@maison/shared';
import { useState, type FormEvent } from 'react';
import { Field, Input, Select, Textarea } from '@/admin/ui';
import { ChipsInput, InternalNote, Stars } from '../shared';

export const VENDOR_STATUSES = ['ACTIVE', 'PREFERRED', 'INACTIVE', 'BLOCKED'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];
export const VENDOR_STATUS_LABEL: Record<VendorStatus, string> = { ACTIVE: 'Active', PREFERRED: 'Preferred', INACTIVE: 'Inactive', BLOCKED: 'Blocked' };
export const VENDOR_STATUS_TONE = { ACTIVE: 'green', PREFERRED: 'gold', INACTIVE: 'gray', BLOCKED: 'red' } as const;

export interface VendorInput {
  name: string;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  serviceAreas: string[];
  services: string[];
  priceNotes: string;
  availabilityNotes: string;
  rating: number | null;
  notes: string;
  status: VendorStatus;
}

export const emptyVendor: VendorInput = {
  name: '',
  category: VENDOR_CATEGORIES[0],
  contactName: '',
  email: '',
  phone: '',
  website: '',
  serviceAreas: [],
  services: [],
  priceNotes: '',
  availabilityNotes: '',
  rating: null,
  notes: '',
  status: 'ACTIVE',
};

export const pickVendorInput = (v: VendorInput): VendorInput => ({
  name: v.name,
  category: v.category,
  contactName: v.contactName,
  email: v.email,
  phone: v.phone,
  website: v.website,
  serviceAreas: v.serviceAreas,
  services: v.services,
  priceNotes: v.priceNotes,
  availabilityNotes: v.availabilityNotes,
  rating: v.rating,
  notes: v.notes,
  status: v.status,
});

/** Shared vendor form (used by "New vendor" and the profile editor). */
export function VendorForm({ id, initial, errors, onSubmit, disabled, areaSuggestions }: { id: string; initial: VendorInput; errors: Record<string, string>; onSubmit: (v: VendorInput) => void; disabled?: boolean; areaSuggestions?: string[] }) {
  const [v, setV] = useState<VendorInput>(initial);
  const [local, setLocal] = useState<Record<string, string>>({});
  const set = <K extends keyof VendorInput>(k: K, val: VendorInput[K]) => setV((x) => ({ ...x, [k]: val }));
  const err = (k: string) => local[k] ?? errors[k];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const l: Record<string, string> = {};
    if (!v.name.trim()) l.name = 'Name is required';
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) l.email = 'Enter a valid email';
    if (v.website && !/^https?:\/\/\S+$/.test(v.website)) l.website = 'Use a full URL, e.g. https://example.com';
    setLocal(l);
    if (Object.keys(l).length) return;
    onSubmit({ ...v, name: v.name.trim(), website: v.website.trim(), email: v.email.trim() });
  };
  return (
    <form id={id} onSubmit={submit} noValidate>
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Vendor name" required error={err('name')} className="sm:col-span-2">
          <Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={160} invalid={!!err('name')} />
        </Field>
        <Field label="Category" error={err('category')}>
          <Select value={v.category} onChange={(e) => set('category', e.target.value)} options={VENDOR_CATEGORIES.map((c) => ({ value: c, label: c }))} aria-label="Category" />
        </Field>
        <Field label="Status" error={err('status')} hint={v.status === 'BLOCKED' ? 'Blocked vendors cannot be assigned to bookings.' : undefined}>
          <Select value={v.status} onChange={(e) => set('status', e.target.value as VendorStatus)} options={VENDOR_STATUSES.map((s) => ({ value: s, label: VENDOR_STATUS_LABEL[s] }))} aria-label="Status" />
        </Field>
        <Field label="Contact person" error={err('contactName')}>
          <Input value={v.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Phone" error={err('phone')}>
          <Input value={v.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} type="tel" autoComplete="off" />
        </Field>
        <Field label="Email" error={err('email')}>
          <Input value={v.email} onChange={(e) => set('email', e.target.value)} type="email" maxLength={200} invalid={!!err('email')} autoComplete="off" />
        </Field>
        <Field label="Website" error={err('website')}>
          <Input value={v.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" maxLength={300} invalid={!!err('website')} />
        </Field>
        <Field label="Services offered" error={err('services')} hint="Press Enter after each service." className="sm:col-span-2">
          <ChipsInput value={v.services} onChange={(x) => set('services', x)} placeholder="e.g. Mandap décor, Stage lighting" />
        </Field>
        <Field label="Service areas" error={err('serviceAreas')} hint="Cities or regions they cover." className="sm:col-span-2">
          <ChipsInput id={`${id}-areas`} value={v.serviceAreas} onChange={(x) => set('serviceAreas', x)} placeholder="e.g. Mumbai, Goa" suggestions={areaSuggestions} />
        </Field>
        <div className="sm:col-span-2">
          <span className="adm-label">Rating</span>
          <Stars value={v.rating} onChange={(r) => set('rating', r)} label="Vendor rating" size="md" />
        </div>
        <div className="space-y-4 rounded-xl border border-dashed border-[#E6D7B5] bg-[#FDFBF6] p-4 sm:col-span-2">
          <InternalNote>Internal — not visible to clients. Pricing, availability and notes are only shown to staff with vendor access.</InternalNote>
          <Field label="Price notes (internal)" error={err('priceNotes')}>
            <Textarea rows={3} value={v.priceNotes} onChange={(e) => set('priceNotes', e.target.value)} maxLength={4000} placeholder="Rate card, negotiated discounts, payment terms…" />
          </Field>
          <Field label="Availability notes" error={err('availabilityNotes')}>
            <Textarea rows={2} value={v.availabilityNotes} onChange={(e) => set('availabilityNotes', e.target.value)} maxLength={4000} placeholder="Blackout dates, lead time, peak-season limits…" />
          </Field>
          <Field label="Notes" error={err('notes')}>
            <Textarea rows={3} value={v.notes} onChange={(e) => set('notes', e.target.value)} maxLength={8000} />
          </Field>
        </div>
      </fieldset>
    </form>
  );
}
