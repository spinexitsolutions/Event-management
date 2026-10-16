import { DEFAULT_THEME, FONT_OPTIONS, type ThemeTokens } from '@maison/shared';

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `${ch(16)} ${ch(8)} ${ch(0)}`;
};

/** WCAG contrast ratio between two hex colours (used by the theme editor to warn about poor contrast). */
export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Pure mapping from theme tokens to CSS custom properties. */
export function themeToCssVars(t: ThemeTokens): Record<string, string> {
  const c = t.colors;
  const btnRadius = t.buttonShape === 'pill' ? '999px' : t.buttonShape === 'rounded' ? `${Math.max(6, t.radius)}px` : '0px';
  const sectionY = t.sectionSpacing === 'compact' ? 'clamp(3.5rem, 7vw, 5.5rem)' : t.sectionSpacing === 'spacious' ? 'clamp(6rem, 12vw, 10rem)' : 'clamp(4.5rem, 9vw, 7.5rem)';
  const tracking = t.typography.letterSpacing === 'tight' ? '-0.02em' : t.typography.letterSpacing === 'wide' ? '0.06em' : '-0.005em';
  return {
    '--c-primary': hexToRgb(c.primary),
    '--c-secondary': hexToRgb(c.secondary),
    '--c-accent': hexToRgb(c.accent),
    '--c-background': hexToRgb(c.background),
    '--c-surface': hexToRgb(c.surface),
    '--c-surface-2': mix(c.surface, c.text, t.mode === 'dark' ? 0.06 : 0.035),
    '--c-text': hexToRgb(c.text),
    '--c-muted': hexToRgb(c.muted),
    '--c-border': hexToRgb(c.border),
    '--c-contrast': hexToRgb(c.contrast),
    '--c-on-contrast': hexToRgb(c.onContrast),
    '--c-success': hexToRgb(c.success),
    '--c-warning': hexToRgb(c.warning),
    '--c-danger': hexToRgb(c.danger),
    '--c-on-primary': luminance(c.primary) > 0.4 ? '17 17 17' : '255 255 255',
    '--font-heading': `'${t.fonts.heading}'`,
    '--font-body': `'${t.fonts.body}'`,
    '--heading-scale': String(t.typography.headingScale),
    '--body-size': `${t.typography.bodySize}px`,
    '--heading-weight': t.typography.headingWeight,
    '--heading-case': t.typography.headingCase,
    '--heading-tracking': tracking,
    '--radius': `${t.radius}px`,
    '--btn-radius': btnRadius,
    '--section-y': sectionY,
    '--bg-image': t.background.imageUrl ? `url("${t.background.imageUrl.replace(/"/g, '')}")` : 'none',
    '--bg-image-opacity': String(t.background.imageOpacity),
  };
}

const loaded = new Set<string>();
export function loadFonts(t: ThemeTokens, doc: Document = document) {
  const allowed = [...FONT_OPTIONS.heading, ...FONT_OPTIONS.body] as string[];
  const families = [...new Set([t.fonts.heading, t.fonts.body])].filter((f) => allowed.includes(f));
  const key = families.join('|');
  if (loaded.has(key) && doc === document) return;
  loaded.add(key);
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400`).join('&')}&display=swap`;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  doc.head.appendChild(link);
}

/** Applies a theme to an element (default :root). Used for the live site and the admin live preview. */
export function applyTheme(t: ThemeTokens = DEFAULT_THEME, el: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(themeToCssVars(t))) el.style.setProperty(k, v);
  el.dataset.mode = t.mode;
  el.dataset.card = t.cardStyle;
  el.dataset.btn = t.buttonStyle;
  el.dataset.pattern = t.background.pattern;
  el.dataset.motion = t.motion.intensity;
  el.style.colorScheme = t.mode;
  el.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.colors.background);
  loadFonts(t, el.ownerDocument);
}
