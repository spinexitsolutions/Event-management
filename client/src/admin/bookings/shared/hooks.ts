import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import type { BookingDetail, StaffMember } from '../types';

export const bookingKey = (id: string) => ['admin-booking', id] as const;

export function useBooking(id: string) {
  return useQuery({ queryKey: bookingKey(id), queryFn: () => api.get<BookingDetail>(`/admin/bookings/${id}`), enabled: !!id });
}

/** Invalidates the booking detail plus any per-booking sub-resources (tasks, guests, …) and list views. */
export function useRefreshBooking(id: string) {
  const qc = useQueryClient();
  return useCallback(
    (...extra: string[]) => {
      qc.invalidateQueries({ queryKey: bookingKey(id) });
      qc.invalidateQueries({ queryKey: ['admin-bookings'] });
      for (const k of extra) qc.invalidateQueries({ queryKey: [k, id] });
    },
    [qc, id],
  );
}

export function useStaff() {
  return useQuery({ queryKey: ['staff-directory'], queryFn: () => api.get<StaffMember[]>('/admin/staff-directory'), staleTime: 5 * 60_000 });
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const monthStartIso = () => `${todayIso().slice(0, 8)}01`;
export const dateOnly = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');

/** ISO → value for <input type="datetime-local"> (local time). */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Whole days from today until a YYYY-MM-DD date (negative = past). */
export function daysUntil(date: string) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 864e5);
}
export function countdownLabel(date: string) {
  const n = daysUntil(date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 0) return `in ${n} days`;
  if (n === -1) return 'Yesterday';
  return `${-n} days ago`;
}

export const isConflict = (err: unknown) => err instanceof ApiError && err.status === 409;
export const fieldErrors = (err: unknown) => (err instanceof ApiError ? err.fieldErrors : {});

export const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'card_terminal', label: 'Card terminal' },
  { value: 'other', label: 'Other' },
];
export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? (m ? m.replace(/_/g, ' ') : '—');
export const providerLabel = (p: string) => ({ razorpay: 'Razorpay', sandbox: 'Sandbox', manual: 'Manual' })[p] ?? p;

/** Opens an authenticated file (cookie auth) in a new tab. */
export const openFile = (path: string) => window.open(api.url(path), '_blank', 'noopener');
