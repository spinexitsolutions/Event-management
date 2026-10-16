import { z } from 'zod';
import { applyBps, roundDiv } from './money';

/**
 * Quotation pricing. All amounts are integer minor units; rates are basis points (18% = 1800).
 * The server recomputes totals from line items on every save — totals sent by a client are ignored.
 * The client uses the same function for a live preview only.
 */
const minor = z.number().int().min(0).max(1_000_000_000_00); // up to 1 billion in major units

export const quoteLineSchema = z.object({
  id: z.string().min(1).max(40),
  serviceId: z.string().max(40).nullable().default(null),
  name: z.string().trim().min(1, 'Line item name is required').max(160),
  description: z.string().trim().max(600).default(''),
  /** Quantity in hundredths so fractional quantities (e.g. 2.5 days) stay exact. 100 = 1. */
  quantityX100: z.number().int().min(1).max(100_000_00),
  unit: z.string().trim().max(20).default(''),
  unitPriceMinor: minor,
  discountBps: z.number().int().min(0).max(10_000).default(0),
  /** Optional lines are offered to the client and only count when `selected` is true. */
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
  taxable: z.boolean().default(true),
});
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export const quoteTaxSchema = z.object({
  name: z.string().trim().min(1).max(40),
  rateBps: z.number().int().min(0).max(10_000),
});
export const quoteFeeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  amountMinor: minor,
  taxable: z.boolean().default(false),
});

export const milestoneSchema = z.object({
  label: z.string().trim().min(1).max(80),
  /** Share of the total in basis points. All milestones must add up to 10,000 (100%). */
  shareBps: z.number().int().min(1).max(10_000),
  due: z.enum(['ON_ACCEPTANCE', 'DAYS_BEFORE_EVENT', 'ON_EVENT_DAY', 'DAYS_AFTER_EVENT', 'FIXED_DATE']),
  days: z.number().int().min(0).max(365).default(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).default(''),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const quotePricingInputSchema = z
  .object({
    lines: z.array(quoteLineSchema).min(1, 'Add at least one line item').max(150),
    discountType: z.enum(['NONE', 'PERCENT', 'AMOUNT']).default('NONE'),
    discountValue: z.number().int().min(0).default(0),
    taxes: z.array(quoteTaxSchema).max(5).default([]),
    fees: z.array(quoteFeeSchema).max(10).default([]),
    milestones: z.array(milestoneSchema).min(1).max(8),
  })
  .superRefine((v, ctx) => {
    const sum = v.milestones.reduce((s, m) => s + m.shareBps, 0);
    if (sum !== 10_000) ctx.addIssue({ code: 'custom', path: ['milestones'], message: `Payment milestones must add up to 100% (currently ${(sum / 100).toFixed(2)}%)` });
    if (v.discountType === 'PERCENT' && v.discountValue > 10_000) ctx.addIssue({ code: 'custom', path: ['discountValue'], message: 'Discount cannot exceed 100%' });
    v.milestones.forEach((m, i) => {
      if (m.due === 'FIXED_DATE' && !m.date) ctx.addIssue({ code: 'custom', path: ['milestones', i, 'date'], message: 'Choose a due date' });
    });
  });
export type QuotePricingInput = z.infer<typeof quotePricingInputSchema>;

export interface QuoteTotals {
  lines: { id: string; grossMinor: number; discountMinor: number; netMinor: number; included: boolean }[];
  subtotalMinor: number; // sum of included line nets
  discountMinor: number; // quotation-level discount
  taxableBaseMinor: number;
  taxes: { name: string; rateBps: number; amountMinor: number }[];
  taxMinor: number;
  feesMinor: number;
  totalMinor: number;
  milestones: { label: string; shareBps: number; amountMinor: number; due: Milestone['due']; days: number; date: string }[];
}

export function lineGross(l: Pick<QuoteLine, 'quantityX100' | 'unitPriceMinor'>) {
  return roundDiv(l.quantityX100 * l.unitPriceMinor, 100);
}

export function calculateQuote(input: QuotePricingInput): QuoteTotals {
  const lines = input.lines.map((l) => {
    const grossMinor = lineGross(l);
    const discountMinor = applyBps(grossMinor, l.discountBps);
    return { id: l.id, grossMinor, discountMinor, netMinor: grossMinor - discountMinor, included: !l.optional || l.selected, taxable: l.taxable };
  });
  const included = lines.filter((l) => l.included);
  const subtotalMinor = included.reduce((s, l) => s + l.netMinor, 0);

  let discountMinor = 0;
  if (input.discountType === 'PERCENT') discountMinor = applyBps(subtotalMinor, input.discountValue);
  else if (input.discountType === 'AMOUNT') discountMinor = Math.min(input.discountValue, subtotalMinor);

  // The quotation-level discount is allocated proportionally to the taxable share of the subtotal.
  const taxableLines = included.filter((l) => l.taxable).reduce((s, l) => s + l.netMinor, 0);
  const taxableDiscount = subtotalMinor > 0 ? roundDiv(discountMinor * taxableLines, subtotalMinor) : 0;
  const taxableFees = input.fees.filter((f) => f.taxable).reduce((s, f) => s + f.amountMinor, 0);
  const taxableBaseMinor = Math.max(0, taxableLines - taxableDiscount + taxableFees);

  const taxes = input.taxes.map((t) => ({ name: t.name, rateBps: t.rateBps, amountMinor: applyBps(taxableBaseMinor, t.rateBps) }));
  const taxMinor = taxes.reduce((s, t) => s + t.amountMinor, 0);
  const feesMinor = input.fees.reduce((s, f) => s + f.amountMinor, 0);
  const totalMinor = subtotalMinor - discountMinor + taxMinor + feesMinor;

  // Split the total across milestones; the last milestone absorbs rounding so the parts always sum to the total.
  let allocated = 0;
  const milestones = input.milestones.map((m, i) => {
    const amountMinor = i === input.milestones.length - 1 ? totalMinor - allocated : applyBps(totalMinor, m.shareBps);
    allocated += amountMinor;
    return { label: m.label, shareBps: m.shareBps, amountMinor, due: m.due, days: m.days, date: m.date };
  });

  return {
    lines: lines.map(({ taxable: _t, ...l }) => l),
    subtotalMinor,
    discountMinor,
    taxableBaseMinor,
    taxes,
    taxMinor,
    feesMinor,
    totalMinor,
    milestones,
  };
}

/** Resolves a milestone due date relative to the event date (YYYY-MM-DD strings, UTC). */
export function milestoneDueDate(m: Pick<Milestone, 'due' | 'days' | 'date'>, eventDate: string | null, acceptedAt: Date = new Date()): string | null {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (s: string, n: number) => {
    const d = new Date(`${s}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  };
  switch (m.due) {
    case 'ON_ACCEPTANCE':
      return iso(acceptedAt);
    case 'FIXED_DATE':
      return m.date || null;
    case 'ON_EVENT_DAY':
      return eventDate;
    case 'DAYS_BEFORE_EVENT':
      return eventDate ? addDays(eventDate, -m.days) : null;
    case 'DAYS_AFTER_EVENT':
      return eventDate ? addDays(eventDate, m.days) : null;
  }
}

export const DEFAULT_MILESTONES: Milestone[] = [
  { label: 'Advance on confirmation', shareBps: 4000, due: 'ON_ACCEPTANCE', days: 0, date: '' },
  { label: 'Second instalment', shareBps: 4000, due: 'DAYS_BEFORE_EVENT', days: 30, date: '' },
  { label: 'Final settlement', shareBps: 2000, due: 'DAYS_AFTER_EVENT', days: 3, date: '' },
];
