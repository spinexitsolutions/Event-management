import { describe, expect, it } from 'vitest';
import { THEME_PRESETS } from '@maison/shared';
import { applyTheme, contrastRatio, themeToCssVars } from '@/lib/theme';
import { sized, srcSet } from '@/lib/image';
import { money, pct, toMinor } from '@/lib/format';

describe('theme engine', () => {
  it('maps every preset to CSS variables', () => {
    for (const p of Object.values(THEME_PRESETS)) {
      const v = themeToCssVars(p.tokens);
      expect(v['--c-primary']).toMatch(/^\d+ \d+ \d+$/);
      expect(v['--font-heading']).toContain(p.tokens.fonts.heading);
      expect(v['--btn-radius']).toBeDefined();
    }
  });
  it('picks readable text on the primary colour', () => {
    const gold = themeToCssVars(THEME_PRESETS['luxury-black-gold'].tokens);
    expect(gold['--c-on-primary']).toBe('17 17 17');
    const charcoal = themeToCssVars(THEME_PRESETS['modern-white-charcoal'].tokens);
    expect(charcoal['--c-on-primary']).toBe('255 255 255');
  });
  it('applies tokens and data attributes to the root', () => {
    applyTheme(THEME_PRESETS['ivory-champagne'].tokens);
    const root = document.documentElement;
    expect(root.dataset.mode).toBe('light');
    expect(root.style.getPropertyValue('--c-background')).toBe('250 248 243');
  });
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrastRatio('#C6A76B', '#111111')).toBeGreaterThan(4.5);
  });
});

describe('images', () => {
  it('requests responsive sizes from image CDNs', () => {
    const u = 'https://images.unsplash.com/photo-1?auto=format&fit=crop&w=2000&q=80';
    expect(sized(u, 800)).toContain('w=800');
    expect(srcSet(u)?.split(',').length).toBe(5);
    expect(sized('/uploads/a.webp', 600)).toBe('/uploads/a-sm.webp');
    expect(srcSet('https://example.com/x.jpg')).toBeUndefined();
  });
});

describe('formatting', () => {
  it('formats minor units', () => {
    expect(money(150000, 'INR')).toContain('1,500');
    expect(money(null)).toBe('—');
    expect(pct(1850)).toBe('18.50%');
    expect(toMinor('1,250.50')).toBe(125050);
  });
});
