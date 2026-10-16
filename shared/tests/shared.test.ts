import { describe, expect, it } from 'vitest';
import {
  calculateQuote,
  canTransitionBooking,
  createSection,
  DEFAULT_MILESTONES,
  DEFAULT_THEME,
  formatMoney,
  inquirySubmitSchema,
  milestoneDueDate,
  parseMajor,
  quotePricingInputSchema,
  roundDiv,
  SECTION_META,
  SECTION_TYPES,
  sectionPropsSchemas,
  THEME_PRESETS,
  themeTokensSchema,
  validateSections,
  safeHref,
  mediaUrl,
} from '../src';

const line = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'l1',
  serviceId: null,
  name: 'Decor',
  description: '',
  quantityX100: 100,
  unit: '',
  unitPriceMinor: 100_000_00,
  discountBps: 0,
  optional: false,
  selected: true,
  taxable: true,
  ...over,
});

describe('money', () => {
  it('rounds half away from zero with integers', () => {
    expect(roundDiv(5, 10)).toBe(1);
    expect(roundDiv(4, 10)).toBe(0);
    expect(roundDiv(-5, 10)).toBe(-1);
  });
  it('parses major amounts exactly', () => {
    expect(parseMajor('1,250.5')).toBe(125050);
    expect(parseMajor('0.1')).toBe(10);
    expect(parseMajor('12.345')).toBeNull();
    expect(parseMajor('abc')).toBeNull();
  });
  it('formats INR', () => {
    expect(formatMoney(150000_00, 'INR')).toContain('1,50,000');
  });
});

describe('quotation pricing', () => {
  const base = { discountType: 'NONE' as const, discountValue: 0, taxes: [], fees: [], milestones: DEFAULT_MILESTONES };

  it('computes lines, discounts, taxes, fees and milestones with exact integers', () => {
    const input = quotePricingInputSchema.parse({
      ...base,
      lines: [line(), line({ id: 'l2', name: 'Lighting', quantityX100: 250, unitPriceMinor: 33_333, discountBps: 1000 })],
      discountType: 'PERCENT',
      discountValue: 500,
      taxes: [{ name: 'GST', rateBps: 1800 }],
      fees: [{ name: 'Travel', amountMinor: 5_000_00, taxable: false }],
    });
    const t = calculateQuote(input);
    // l2: 2.5 × 333.33 = 833.325 → 83333 (rounded) ; 10% off = 8333 → 75000
    expect(t.lines[1]).toMatchObject({ grossMinor: 83_333, discountMinor: 8_333, netMinor: 75_000 });
    expect(t.subtotalMinor).toBe(100_000_00 + 75_000);
    expect(t.discountMinor).toBe(Math.round((100_000_00 + 75_000) * 0.05));
    expect(t.taxMinor).toBe(Math.round(t.taxableBaseMinor * 0.18));
    expect(t.totalMinor).toBe(t.subtotalMinor - t.discountMinor + t.taxMinor + 5_000_00);
    expect(t.milestones.reduce((s, m) => s + m.amountMinor, 0)).toBe(t.totalMinor);
  });

  it('excludes unselected optional lines', () => {
    const t = calculateQuote(quotePricingInputSchema.parse({ ...base, lines: [line(), line({ id: 'o', optional: true, selected: false })] }));
    expect(t.subtotalMinor).toBe(100_000_00);
    expect(t.lines[1].included).toBe(false);
  });

  it('caps fixed discounts at the subtotal', () => {
    const t = calculateQuote(quotePricingInputSchema.parse({ ...base, lines: [line({ unitPriceMinor: 1000 })], discountType: 'AMOUNT', discountValue: 999_999 }));
    expect(t.totalMinor).toBe(0);
  });

  it('rejects milestones that do not add up to 100%', () => {
    const r = quotePricingInputSchema.safeParse({ ...base, lines: [line()], milestones: [{ label: 'All', shareBps: 5000, due: 'ON_ACCEPTANCE' }] });
    expect(r.success).toBe(false);
  });

  it('resolves milestone due dates relative to the event', () => {
    expect(milestoneDueDate({ due: 'DAYS_BEFORE_EVENT', days: 30, date: '' }, '2027-02-14')).toBe('2027-01-15');
    expect(milestoneDueDate({ due: 'DAYS_AFTER_EVENT', days: 3, date: '' }, '2027-02-14')).toBe('2027-02-17');
    expect(milestoneDueDate({ due: 'ON_ACCEPTANCE', days: 0, date: '' }, null, new Date('2026-10-01T10:00:00Z'))).toBe('2026-10-01');
  });
});

describe('booking workflow', () => {
  it('only allows defined transitions', () => {
    expect(canTransitionBooking('AWAITING_ADVANCE', 'CONFIRMED')).toBe(true);
    expect(canTransitionBooking('COMPLETED', 'CANCELLED')).toBe(false);
    expect(canTransitionBooking('AWAITING_CONTRACT', 'COMPLETED')).toBe(false);
  });
});

describe('inquiry schema', () => {
  const valid = {
    name: 'Asha Rao',
    email: 'ASHA@example.com',
    phone: '+91 98765 43210',
    eventType: 'Luxury Wedding',
    eventDate: '2027-02-14',
    location: 'Udaipur',
    guestCount: '250',
    budgetRange: '₹50L – ₹1Cr',
    consent: true,
  };
  it('accepts a valid inquiry and normalises values', () => {
    const r = inquirySubmitSchema.parse(valid);
    expect(r.email).toBe('asha@example.com');
    expect(r.guestCount).toBe(250);
  });
  it('rejects honeypot and missing consent', () => {
    expect(inquirySubmitSchema.safeParse({ ...valid, website: 'spam' }).success).toBe(false);
    expect(inquirySubmitSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
  });
});

describe('theme', () => {
  it('ships five valid presets', () => {
    expect(Object.keys(THEME_PRESETS)).toHaveLength(5);
    for (const p of Object.values(THEME_PRESETS)) expect(themeTokensSchema.safeParse(p.tokens).success).toBe(true);
    expect(DEFAULT_THEME.colors.primary).toBe('#C6A76B');
  });
});

describe('sections', () => {
  it('has metadata for every type', () => {
    for (const t of SECTION_TYPES) expect(SECTION_META[t]).toBeDefined();
  });
  it('validates published sections and reports issues', () => {
    const ok = createSection('faq');
    const bad = { id: 'abcd1234', type: 'hero', enabled: true, props: { headline: '', slides: [] } };
    const r = validateSections([ok, bad]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].index).toBe(1);
  });
  it('applies defaults on parse', () => {
    const p = sectionPropsSchemas.services.parse({});
    expect(p.variant).toBe('cards');
  });
  it('blocks script URLs', () => {
    expect(safeHref.safeParse('javascript:alert(1)').success).toBe(false);
    expect(mediaUrl.safeParse('http://insecure.example/x.jpg').success).toBe(false);
    expect(mediaUrl.safeParse('https://images.unsplash.com/photo-1').success).toBe(true);
  });
});
