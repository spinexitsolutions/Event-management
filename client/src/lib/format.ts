import { formatMoney } from '@maison/shared';

export const money = (minor: number | null | undefined, currency = 'INR') => (minor === null || minor === undefined ? '—' : formatMoney(Number(minor), currency));

export function fmtDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!d) return '—';
  const date = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, opts);
}
export const fmtDateTime = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export function fromNow(d: string | Date) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(d);
}
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
export const toMinor = (major: string | number) => Math.round(Number(String(major).replace(/,/g, '')) * 100);
export const toMajor = (minor: number | null | undefined) => (minor === null || minor === undefined ? '' : (Number(minor) / 100).toString());
