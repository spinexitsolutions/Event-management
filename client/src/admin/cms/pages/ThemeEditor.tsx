import { useQuery } from '@tanstack/react-query';
import { Brush, Check, Frame, LayoutPanelTop, PanelBottom, Palette, Sparkles, Type, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_THEME, FONT_OPTIONS, THEME_PRESETS, themeTokensSchema, type ThemeTokens } from '@maison/shared';
import { ConfirmDialog, Field, Input, Select, Toggle } from '@/admin/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { contrastRatio, loadFonts, themeToCssVars } from '@/lib/theme';
import { Callout, FieldGroup, RangeField, Segmented } from '../components/bits';
import { ConfigWorkspace, type Panel } from '../components/ConfigWorkspace';
import { ColorField, LinkInput } from '../components/inputs';
import { ImageField } from '../components/MediaFields';
import { useConfigEditor } from '../lib/config';
import type { ConfigDoc } from '../lib/types';
import { errorUnder, fillMissing, issuesToMap, setAt } from '../lib/util';

type ColorKey = keyof ThemeTokens['colors'];
const COLOR_FIELDS: { key: ColorKey; label: string; help: string }[] = [
  { key: 'background', label: 'Page background', help: 'The main background of every page.' },
  { key: 'surface', label: 'Surface', help: 'Cards, panels and tinted sections.' },
  { key: 'text', label: 'Text', help: 'Headings and body copy.' },
  { key: 'muted', label: 'Muted text', help: 'Captions, labels and secondary copy.' },
  { key: 'border', label: 'Lines & borders', help: 'Dividers, input borders and card outlines.' },
  { key: 'primary', label: 'Primary (brand accent)', help: 'Buttons, links and highlights — e.g. champagne gold.' },
  { key: 'secondary', label: 'Secondary', help: 'Supporting accent for small details.' },
  { key: 'accent', label: 'Accent', help: 'Hover states and decorative flourishes.' },
  { key: 'contrast', label: 'Contrast band', help: 'Background of “contrast” sections and the dark footer.' },
  { key: 'onContrast', label: 'Text on contrast band', help: 'Text colour used on the contrast band.' },
  { key: 'success', label: 'Success', help: 'Confirmation messages.' },
  { key: 'warning', label: 'Warning', help: 'Warnings and notices.' },
  { key: 'danger', label: 'Error', help: 'Form errors.' },
];

const rgb = (v: string) => `rgb(${v.split(' ').join(',')})`;
const onPrimaryHex = (t: ThemeTokens) => (themeToCssVars(t)['--c-on-primary'] === '17 17 17' ? '#111111' : '#FFFFFF');

function ContrastRow({ label, fg, bg, min = 4.5 }: { label: string; fg: string; bg: string; min?: number }) {
  const ok = /^#[0-9a-f]{6}$/i.test(fg) && /^#[0-9a-f]{6}$/i.test(bg);
  const r = ok ? contrastRatio(fg, bg) : 0;
  const level = r >= 7 ? 'AAA' : r >= min ? 'AA' : r >= 3 ? 'Large text only' : 'Fails';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-adm-line bg-white px-3 py-2">
      <span className="flex h-8 w-12 shrink-0 items-center justify-center rounded-md text-sm font-semibold ring-1 ring-black/5" style={{ background: bg, color: fg }}>
        Aa
      </span>
      <span className="min-w-0 flex-1 text-xs">{label}</span>
      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', r >= min ? 'bg-emerald-50 text-emerald-700' : r >= 3 ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700')}>
        {r.toFixed(1)}:1 · {level}
      </span>
    </div>
  );
}

function PresetCard({ id, active, onApply }: { id: string; active: boolean; onApply: () => void }) {
  const p = THEME_PRESETS[id];
  const c = p.tokens.colors;
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-white transition', active ? 'border-adm-gold ring-1 ring-adm-gold' : 'border-adm-line hover:shadow-md')}>
      <div className="relative h-24 p-3" style={{ background: c.background }}>
        <p className="text-lg leading-tight" style={{ color: c.text, fontFamily: `'${p.tokens.fonts.heading}', serif`, textTransform: p.tokens.typography.headingCase === 'uppercase' ? 'uppercase' : 'none', letterSpacing: p.tokens.typography.letterSpacing === 'wide' ? '0.06em' : undefined }}>
          Celebrations
        </p>
        <p className="mt-0.5 text-[11px]" style={{ color: c.muted, fontFamily: `'${p.tokens.fonts.body}', sans-serif` }}>
          {p.tokens.fonts.heading} · {p.tokens.fonts.body}
        </p>
        <span className="absolute bottom-3 left-3 px-2.5 py-1 text-[10px] font-medium" style={{ background: c.primary, color: onPrimaryHex(p.tokens), borderRadius: p.tokens.buttonShape === 'pill' ? 999 : p.tokens.buttonShape === 'rounded' ? Math.max(6, p.tokens.radius) : 0 }}>
          Book your event
        </span>
        <div className="absolute bottom-3 right-3 flex -space-x-1">
          {[c.primary, c.surface, c.contrast, c.accent].map((x, i) => (
            <span key={i} className="h-5 w-5 rounded-full ring-2 ring-white/80" style={{ background: x }} />
          ))}
        </div>
      </div>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{p.label}</p>
          <p className="mt-0.5 text-xs text-adm-muted">{p.description}</p>
        </div>
        <button type="button" className={active ? 'adm-btn-secondary px-2.5 py-1 text-xs' : 'adm-btn-primary px-2.5 py-1 text-xs'} onClick={onApply}>
          {active ? (
            <>
              <Check className="h-3.5 w-3.5" /> Applied
            </>
          ) : (
            'Apply'
          )}
        </button>
      </div>
    </div>
  );
}

const normalize = (draft: unknown, published: unknown): ThemeTokens => {
  const base = themeTokensSchema.safeParse(published).success ? (published as ThemeTokens) : DEFAULT_THEME;
  return fillMissing<ThemeTokens>(draft, base);
};

export default function ThemeEditor() {
  const editor = useConfigEditor<ThemeTokens>('theme', normalize);
  const site = useQuery({ queryKey: ['cms-config', 'site'], queryFn: () => api.get<ConfigDoc<unknown>>('/admin/cms/site/site') });
  const t = editor.value;
  const [preset, setPreset] = useState<string | null>(null);
  const set = (path: string, v: unknown) => editor.setValue((cur) => (cur ? setAt(cur, path, v) : cur));

  useEffect(() => {
    if (t) loadFonts(t);
  }, [t]);

  const issues = useMemo(() => {
    if (!t) return [];
    const r = themeTokensSchema.safeParse(t);
    return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  }, [t]);
  const errs = issuesToMap(issues);
  const count = (prefix: string) => issues.filter((i) => i.path.startsWith(prefix)).length;
  const activePreset = t ? Object.keys(THEME_PRESETS).find((k) => COLOR_FIELDS.every((f) => THEME_PRESETS[k].tokens.colors[f.key].toLowerCase() === t.colors[f.key].toLowerCase()) && THEME_PRESETS[k].tokens.fonts.heading === t.fonts.heading) : undefined;

  const panels: Panel[] = !t
    ? []
    : [
        {
          id: 'presets',
          label: 'Presets',
          description: 'Start from a complete, designer-made look.',
          icon: Wand2,
          render: () => (
            <div className="space-y-3">
              {Object.keys(THEME_PRESETS).map((k) => (
                <PresetCard key={k} id={k} active={activePreset === k} onApply={() => setPreset(k)} />
              ))}
            </div>
          ),
        },
        {
          id: 'colors',
          label: 'Colours',
          description: 'Brand palette and readability checks.',
          icon: Palette,
          errors: count('colors') + count('mode'),
          render: () => {
            const c = t.colors;
            return (
              <div className="space-y-6">
                <Field label="Overall mode" hint="Dark suits black-and-gold luxury; light suits airy editorial looks.">
                  <Segmented label="Mode" value={t.mode} onChange={(v) => set('mode', v)} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
                </Field>
                <FieldGroup title="Readability (WCAG contrast)" description="Body text needs at least 4.5:1 to be comfortable to read for everyone.">
                  <div className="space-y-1.5">
                    <ContrastRow label="Text on page background" fg={c.text} bg={c.background} />
                    <ContrastRow label="Text on surfaces & cards" fg={c.text} bg={c.surface} />
                    <ContrastRow label="Muted text on background" fg={c.muted} bg={c.background} />
                    <ContrastRow label="Button text on primary" fg={onPrimaryHex(t)} bg={c.primary} />
                    <ContrastRow label="Text on contrast band" fg={c.onContrast} bg={c.contrast} />
                  </div>
                  {contrastRatio(c.text, c.background) < 4.5 && <Callout tone="warn">Text on the page background is hard to read. Darken the text or lighten the background (or vice versa in dark mode).</Callout>}
                </FieldGroup>
                <FieldGroup title="Palette">
                  {COLOR_FIELDS.map((f) => (
                    <Field key={f.key} label={<label htmlFor={`c-${f.key}`}>{f.label}</label>} hint={f.help} error={errs[`colors.${f.key}`]}>
                      <ColorField id={`c-${f.key}`} value={c[f.key]} onChange={(v) => set(`colors.${f.key}`, v)} invalid={!!errs[`colors.${f.key}`]} />
                    </Field>
                  ))}
                </FieldGroup>
              </div>
            );
          },
        },
        {
          id: 'typography',
          label: 'Typography',
          description: 'Fonts, sizes and heading style.',
          icon: Type,
          errors: count('fonts') + count('typography'),
          render: () => {
            const ty = t.typography;
            return (
              <div className="space-y-5">
                <div className="rounded-xl border border-adm-line p-4" style={{ background: t.colors.background, color: t.colors.text }} aria-label="Typography specimen">
                  <p className="text-[10px] uppercase tracking-[0.25em]" style={{ color: t.colors.primary, fontFamily: `'${t.fonts.body}'` }}>
                    Luxury event design
                  </p>
                  <p
                    className="mt-1 leading-[1.05]"
                    style={{
                      fontFamily: `'${t.fonts.heading}', serif`,
                      fontSize: `${30 * ty.headingScale}px`,
                      fontWeight: Number(ty.headingWeight),
                      textTransform: ty.headingCase === 'uppercase' ? 'uppercase' : 'none',
                      letterSpacing: ty.letterSpacing === 'tight' ? '-0.02em' : ty.letterSpacing === 'wide' ? '0.06em' : '-0.005em',
                    }}
                  >
                    Celebrations, composed like cinema
                  </p>
                  <p className="mt-2 opacity-80" style={{ fontFamily: `'${t.fonts.body}', sans-serif`, fontSize: `${ty.bodySize}px`, lineHeight: 1.65 }}>
                    We design and produce weddings, galas and brand experiences with obsessive attention to detail.
                  </p>
                </div>
                <Field label="Heading font" hint="Serif display faces feel classic and luxurious.">
                  <Select value={t.fonts.heading} onChange={(e) => set('fonts.heading', e.target.value)} options={FONT_OPTIONS.heading.map((f) => ({ value: f, label: f }))} />
                </Field>
                <Field label="Body font" hint="A clean sans-serif keeps long text easy to read.">
                  <Select value={t.fonts.body} onChange={(e) => set('fonts.body', e.target.value)} options={FONT_OPTIONS.body.map((f) => ({ value: f, label: f }))} />
                </Field>
                <Field label="Heading size" hint="Scales every heading on the site.">
                  <RangeField value={ty.headingScale} min={0.8} max={1.3} step={0.01} onChange={(v) => set('typography.headingScale', Math.round(v * 100) / 100)} format={(v) => `${Math.round(v * 100)}%`} />
                </Field>
                <Field label="Body text size">
                  <RangeField value={ty.bodySize} min={14} max={19} step={1} onChange={(v) => set('typography.bodySize', v)} format={(v) => `${v}px`} />
                </Field>
                <Field label="Heading weight">
                  <Segmented label="Heading weight" size="sm" value={ty.headingWeight} onChange={(v) => set('typography.headingWeight', v)} options={(['300', '400', '500', '600', '700'] as const).map((w) => ({ value: w, label: { '300': 'Light', '400': 'Regular', '500': 'Medium', '600': 'Semi', '700': 'Bold' }[w] }))} />
                </Field>
                <Field label="Heading case">
                  <Segmented label="Heading case" size="sm" value={ty.headingCase} onChange={(v) => set('typography.headingCase', v)} options={[{ value: 'normal', label: 'Sentence case' }, { value: 'uppercase', label: 'UPPERCASE' }]} />
                </Field>
                <Field label="Heading letter-spacing">
                  <Segmented label="Letter spacing" size="sm" value={ty.letterSpacing} onChange={(v) => set('typography.letterSpacing', v)} options={[{ value: 'tight', label: 'Tight' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }]} />
                </Field>
              </div>
            );
          },
        },
        {
          id: 'shape',
          label: 'Shape & components',
          description: 'Corners, buttons, cards and spacing.',
          icon: Frame,
          errors: count('radius') + count('button') + count('card') + count('section'),
          render: () => {
            const btnRadius = t.buttonShape === 'pill' ? 999 : t.buttonShape === 'rounded' ? Math.max(6, t.radius) : 0;
            const c = t.colors;
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-xl border border-adm-line p-4" style={{ background: c.background }}>
                  <div className="flex-1 p-3" style={{ borderRadius: t.radius, background: t.cardStyle === 'flat' ? c.surface : t.cardStyle === 'glass' ? 'rgba(255,255,255,0.08)' : c.surface, border: t.cardStyle === 'outline' ? `1px solid ${c.border}` : undefined, boxShadow: t.cardStyle === 'elevated' ? '0 12px 30px -12px rgba(0,0,0,.35)' : undefined }}>
                    <div className="h-10" style={{ borderRadius: Math.max(0, t.radius - 2), background: rgb(themeToCssVars(t)['--c-surface-2']) }} />
                    <p className="mt-2 text-xs" style={{ color: c.text }}>
                      Card
                    </p>
                  </div>
                  <span
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{
                      borderRadius: btnRadius,
                      background: t.buttonStyle === 'solid' ? c.primary : 'transparent',
                      color: t.buttonStyle === 'solid' ? onPrimaryHex(t) : c.primary,
                      border: t.buttonStyle === 'outline' ? `1px solid ${c.primary}` : undefined,
                      textDecoration: t.buttonStyle === 'underline' ? 'underline' : undefined,
                    }}
                  >
                    Book your event
                  </span>
                </div>
                <Field label="Corner radius" hint="0 = crisp and architectural; higher = soft and friendly.">
                  <RangeField value={t.radius} min={0} max={28} step={1} onChange={(v) => set('radius', v)} format={(v) => `${v}px`} />
                </Field>
                <Field label="Button shape">
                  <Segmented label="Button shape" size="sm" value={t.buttonShape} onChange={(v) => set('buttonShape', v)} options={[{ value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'pill', label: 'Pill' }]} />
                </Field>
                <Field label="Button style">
                  <Segmented label="Button style" size="sm" value={t.buttonStyle} onChange={(v) => set('buttonStyle', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'outline', label: 'Outline' }, { value: 'underline', label: 'Underline' }]} />
                </Field>
                <Field label="Card style">
                  <Segmented label="Card style" size="sm" value={t.cardStyle} onChange={(v) => set('cardStyle', v)} options={[{ value: 'flat', label: 'Flat' }, { value: 'outline', label: 'Outline' }, { value: 'elevated', label: 'Elevated' }, { value: 'glass', label: 'Glass' }]} />
                </Field>
                <Field label="Section spacing" hint="Vertical breathing room between sections.">
                  <Segmented label="Section spacing" size="sm" value={t.sectionSpacing} onChange={(v) => set('sectionSpacing', v)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'spacious', label: 'Spacious' }]} />
                </Field>
              </div>
            );
          },
        },
        {
          id: 'background',
          label: 'Background',
          description: 'Subtle texture or a background image.',
          icon: Brush,
          errors: count('background'),
          render: () => (
            <div className="space-y-5">
              <Field label="Texture" hint="A barely-there texture adds depth to plain backgrounds.">
                <Segmented label="Background pattern" size="sm" value={t.background.pattern} onChange={(v) => set('background.pattern', v)} options={[{ value: 'none', label: 'None' }, { value: 'grain', label: 'Film grain' }, { value: 'linen', label: 'Linen' }, { value: 'deco', label: 'Art deco' }, { value: 'dots', label: 'Dots' }]} />
              </Field>
              <Field label="Background image (optional)" hint="Shown very faintly behind the whole site." error={errorUnder(errs, 'background.imageUrl')}>
                <ImageField value={t.background.imageUrl} onChange={(v) => set('background.imageUrl', v)} label="background image" />
              </Field>
              <Field label="Texture / image strength">
                <RangeField value={t.background.imageOpacity} min={0} max={1} step={0.01} onChange={(v) => set('background.imageOpacity', v)} format={(v) => `${Math.round(v * 100)}%`} />
              </Field>
            </div>
          ),
        },
        {
          id: 'header',
          label: 'Header',
          description: 'Navigation bar style and call to action.',
          icon: LayoutPanelTop,
          errors: count('header'),
          render: () => (
            <div className="space-y-5">
              <Field label="Header style" hint="“Transparent” floats over full-bleed heroes and turns solid on scroll.">
                <Segmented label="Header style" size="sm" value={t.header.style} onChange={(v) => set('header.style', v)} options={[{ value: 'transparent', label: 'Transparent' }, { value: 'solid', label: 'Solid' }, { value: 'centered', label: 'Centred logo' }]} />
              </Field>
              <Toggle checked={t.header.sticky} onChange={(v) => set('header.sticky', v)} label="Keep the header visible while scrolling" />
              <Field label="Header button label" hint="Leave empty to hide the button." error={errs['header.ctaLabel']}>
                <Input value={t.header.ctaLabel} maxLength={28} onChange={(e) => set('header.ctaLabel', e.target.value)} />
              </Field>
              <Field label="Header button link" error={errs['header.ctaHref']}>
                <LinkInput value={t.header.ctaHref} onChange={(v) => set('header.ctaHref', v)} />
              </Field>
              <Toggle checked={t.header.showClientLogin} onChange={(v) => set('header.showClientLogin', v)} label="Show “Client login” link" />
            </div>
          ),
        },
        {
          id: 'footer',
          label: 'Footer',
          description: 'Footer look and newsletter signup.',
          icon: PanelBottom,
          errors: count('footer'),
          render: () => (
            <div className="space-y-5">
              <Field label="Footer style">
                <Segmented label="Footer style" size="sm" value={t.footer.style} onChange={(v) => set('footer.style', v)} options={[{ value: 'dark', label: 'Dark band' }, { value: 'light', label: 'Light' }, { value: 'minimal', label: 'Minimal' }]} />
              </Field>
              <Toggle checked={t.footer.showNewsletter} onChange={(v) => set('footer.showNewsletter', v)} label="Show newsletter signup in the footer" />
              <p className="text-xs text-adm-muted">Footer text, columns and links are edited in Global content → Footer.</p>
            </div>
          ),
        },
        {
          id: 'motion',
          label: 'Motion',
          description: 'Scrolling and animation feel.',
          icon: Sparkles,
          errors: count('motion'),
          render: () => (
            <div className="space-y-5">
              <Toggle checked={t.motion.smoothScroll} onChange={(v) => set('motion.smoothScroll', v)} label="Smooth (inertia) scrolling on desktop" />
              <Field label="Animation intensity" hint="Cinematic adds parallax and slower reveals. Visitors who prefer reduced motion always get a calm, static site.">
                <Segmented label="Animation intensity" size="sm" value={t.motion.intensity} onChange={(v) => set('motion.intensity', v)} options={[{ value: 'subtle', label: 'Subtle' }, { value: 'standard', label: 'Standard' }, { value: 'cinematic', label: 'Cinematic' }]} />
              </Field>
            </div>
          ),
        },
      ];

  return (
    <>
      <ConfigWorkspace<ThemeTokens>
        title="Theme & branding"
        subtitle="Colours, fonts and components for the whole website"
        configKey="theme"
        editor={editor}
        panels={panels}
        validate={(v) => {
          const r = themeTokensSchema.safeParse(v);
          return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        }}
        previewMessage={() => (t ? { theme: t, site: site.data ? fillMissing(site.data.draft, site.data.published) : undefined } : null)}
      />
      <ConfirmDialog
        open={!!preset}
        onClose={() => setPreset(null)}
        title={`Apply “${preset ? THEME_PRESETS[preset].label : ''}”?`}
        body="This replaces the colours, fonts and styles in your draft (your header button text and link are kept). Nothing goes live until you publish, and you can restore any published version from History."
        confirmLabel="Apply preset"
        onConfirm={() => {
          if (preset && t) editor.setValue({ ...structuredClone(THEME_PRESETS[preset].tokens), header: { ...THEME_PRESETS[preset].tokens.header, ctaLabel: t.header.ctaLabel, ctaHref: t.header.ctaHref, showClientLogin: t.header.showClientLogin } });
          setPreset(null);
        }}
      />
    </>
  );
}
