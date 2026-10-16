import { useQuery } from '@tanstack/react-query';
import type { InquiryStatus, QuotationStatus, QuotePricingInput } from '@maison/shared';
import { api, ApiError } from '@/lib/api';

/* ───── Shared types (mirror server responses) ───── */

export interface StaffMember { id: string; name: string; roleKey: string; title: string | null }

export interface InquiryRow {
  id: string;
  reference: string;
  clientId: string;
  name: string;
  email: string;
  phone: string;
  eventType: string;
  eventDate: string | null;
  location: string;
  guestCount: number;
  budgetRange: string;
  status: InquiryStatus;
  source: string;
  createdAt: string;
  assignedTo: { id: string; name: string } | null;
  category: { name: string } | null;
}

export interface AiClassification { category?: string; priority?: 'low' | 'medium' | 'high'; summary?: string; suggestedServices?: string[]; generatedAt?: string; reviewed?: boolean }
export interface Communication { id: string; kind: string; direction: string; subject: string; body: string; createdAt: string; authorId: string | null; authorName?: string | null }
export interface Consultation { id: string; scheduledAt: string; durationMin: number; mode: 'IN_PERSON' | 'VIDEO' | 'PHONE'; location: string; agenda: string; outcome: string; status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW'; owner: { name: string } | null }
export interface Reminder { id: string; dueAt: string; note: string; userId: string }

export interface InquiryDetail extends InquiryRow {
  preferredContact: string;
  alternativeDate: string | null;
  dateFlexible: boolean;
  venueRequirements: string;
  services: string[];
  themePreferences: string;
  cateringRequirements: string;
  notes: string;
  attachments: { mediaId: string; filename: string }[];
  aiClassification: AiClassification | null;
  lostReason: string;
  categoryId: string | null;
  client: { id: string; name: string; email: string; phone: string; company: string; userId: string | null };
  category: { id: string; name: string } | null;
  package: { id: string; name: string } | null;
  consultations: Consultation[];
  communications: Communication[];
  quotations: { id: string; number: string; title: string; status: QuotationStatus; currentVersion: number; createdAt: string; versions: { totalMinor: number }[] }[];
  bookings: { id: string; reference: string; status: string }[];
  reminders: Reminder[];
}

export interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  source: string;
  tags: string[];
  createdAt: string;
  relationshipManager: { id: string; name: string } | null;
  _count: { inquiries: number; bookings: number; quotations: number };
  user: { status: string } | null;
}

export interface ClientDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  source: string;
  preferences: Record<string, string>;
  notes: string;
  tags: string[];
  relationshipManagerId: string | null;
  createdAt: string;
  relationshipManager: { id: string; name: string } | null;
  user: { id: string; status: string; lastLoginAt: string | null } | null;
  inquiries: { id: string; reference: string; eventType: string; status: InquiryStatus; createdAt: string; eventDate: string | null }[];
  quotations: { id: string; number: string; title: string; status: QuotationStatus; createdAt: string; versions: { totalMinor: number }[] }[];
  bookings: { id: string; reference: string; title: string; status: string; eventDate: string; contractValueMinor: number; currency: string }[];
  communications: Communication[];
  payments: { id: string; amountMinor: number; refundedMinor: number; currency: string; method: string; paidAt: string | null; booking: { reference: string } }[] | null;
}

export interface QuotationRow {
  id: string;
  number: string;
  title: string;
  status: QuotationStatus;
  currency: string;
  currentVersion: number;
  eventDate: string | null;
  updatedAt: string;
  client: { id: string; name: string };
  versions: { totalMinor: number; version: number }[];
}

export interface QuotationVersion {
  id: string;
  version: number;
  intro: string;
  terms: string;
  notes: string;
  lines: QuotePricingInput['lines'];
  discountType: QuotePricingInput['discountType'];
  discountValue: number;
  taxes: QuotePricingInput['taxes'];
  fees: QuotePricingInput['fees'];
  milestones: QuotePricingInput['milestones'];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  feesMinor: number;
  totalMinor: number;
  aiDrafted: boolean;
  createdAt: string;
  lockedAt: string | null;
}

export interface QuotationFull {
  id: string;
  number: string;
  title: string;
  clientId: string;
  inquiryId: string | null;
  eventDate: string | null;
  venue: string;
  guestCount: number | null;
  currency: string;
  status: QuotationStatus;
  currentVersion: number;
  acceptedVersion: number | null;
  validUntil: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  clientComment: string;
  client: { id: string; name: string; email: string; phone: string; company: string };
  inquiry: { id: string; reference: string; eventType: string } | null;
  booking: { id: string; reference: string; status: string } | null;
  versions: QuotationVersion[];
}

export interface QuoteDefaults {
  currency: string;
  taxes: QuotePricingInput['taxes'];
  milestones: QuotePricingInput['milestones'];
  terms: string;
  validityDays: number;
  services: { id: string; name: string; summary: string; defaultPriceMinor: number | null; defaultUnit: string }[];
  packages: {
    id: string;
    name: string;
    tier: string;
    priceMinor: number | null;
    pricingModel: string;
    inclusions: string[];
    addOns: { name: string; description: string; priceMinor: number | null }[];
    services: { id: string; name: string; defaultPriceMinor: number | null; defaultUnit: string }[];
  }[];
  aiAvailable: boolean;
}

/* ───── Hooks ───── */

export function useStaff() {
  return useQuery({ queryKey: ['staff-directory'], queryFn: () => api.get<StaffMember[]>('/admin/staff-directory'), staleTime: 5 * 60_000 });
}

/* ───── Dates ───── */

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type RangePreset = 'month' | '30d' | 'quarter' | 'ytd' | '12m' | 'custom';
export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'ytd', label: 'Year to date' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom' },
];

export function presetRange(p: Exclude<RangePreset, 'custom'>, now = new Date()): { from: string; to: string } {
  const to = isoDay(now);
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case 'month':
      return { from: isoDay(new Date(y, m, 1)), to };
    case '30d':
      return { from: isoDay(new Date(y, m, now.getDate() - 29)), to };
    case 'quarter':
      return { from: isoDay(new Date(y, Math.floor(m / 3) * 3, 1)), to };
    case 'ytd':
      return { from: isoDay(new Date(y, 0, 1)), to };
    case '12m':
      return { from: isoDay(new Date(y, m - 11, 1)), to };
  }
}

/** "2026-07" → "Jul 26" */
export const monthLabel = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

/** datetime-local value → ISO with offset (server expects offset datetimes). */
export const localToIso = (v: string) => new Date(v).toISOString();
export const isoToLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${isoDay(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Field errors from a 422 (or empty). */
export const fieldErrorsOf = (err: unknown): Record<string, string> => (err instanceof ApiError ? err.fieldErrors : {});

/* ───── Chart palette (validated: gold + ink blue, CVD-safe on light surfaces) ───── */
export const CHART = { gold: '#B4893A', ink: '#2F5D9E', grid: '#ECE7DE', axis: '#8A8378' };

export const COMM_KINDS = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP'] as const;
export const SOURCES = ['website', 'phone', 'walk-in', 'referral', 'instagram', 'whatsapp', 'email', 'event', 'other'];
