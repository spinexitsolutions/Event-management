/**
 * Money is always stored and computed as integer minor units (paise for INR, cents for USD).
 * Never use floating-point arithmetic on stored amounts.
 */
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(minor: number, currency: string = 'INR', locale?: string): string {
  const loc = locale ?? (currency === 'INR' ? 'en-IN' : 'en-US');
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Converts a user-entered major amount ("1,250.50") to minor units. Returns null when invalid. */
export function parseMajor(input: string | number): number | null {
  const s = String(input).replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export const toMajorString = (minor: number) => (minor / 100).toFixed(2);

/** Rounds half away from zero for a non-negative rational (numerator / denominator) using integer math. */
export function roundDiv(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('denominator must be positive');
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const r = n - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

/** Applies a rate expressed in basis points (1% = 100 bps) to an amount. */
export const applyBps = (amountMinor: number, bps: number) => roundDiv(amountMinor * bps, 10_000);
