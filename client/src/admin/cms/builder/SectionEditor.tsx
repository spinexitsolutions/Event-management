import { ChevronDown, Database, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SECTION_META, type DraftSection, type FieldDef } from '@maison/shared';
import { Field } from '@/admin/ui';
import { cn } from '@/lib/cn';
import { Callout } from '../components/bits';
import { FieldRenderer, type FieldIssues } from './FieldRenderer';
import { SECTION_ICONS } from './sectionMeta';

const SOURCE_LINKS: Record<string, string> = {
  'Event categories': '/admin/website/content/categories',
  Portfolio: '/admin/website/content/projects',
  Services: '/admin/website/content/services',
  Testimonials: '/admin/website/content/testimonials',
  Packages: '/admin/website/content/packages',
  Venues: '/admin/venues',
  'Client logos': '/admin/website/content/logos',
  FAQs: '/admin/website/content/faqs',
  'Global settings': '/admin/website/settings',
  Team: '/admin/website/content/team',
  Blog: '/admin/website/content/blog',
};

const ADVANCED = new Set(['background', 'anchorId']);
const STYLE = new Set(['align', 'overlay', 'intervalSeconds', 'showScrollHint', 'grayscale', 'imageSide', 'width']);

/** Generated editor for one section, driven by SECTION_META[type].fields. */
export function SectionEditor({ section, onChange, onToggle, issues }: { section: DraftSection; onChange: (props: Record<string, unknown>) => void; onToggle: () => void; issues: { path: string; message: string }[] }) {
  const meta = SECTION_META[section.type];
  const [showAdvanced, setShowAdvanced] = useState(false);
  const props = section.props as Record<string, unknown>;
  const I = SECTION_ICONS[section.type];

  // Map "props.slides.0.imageUrl" → field "slides" with nested key "0.imageUrl".
  const byField: Record<string, FieldIssues> = {};
  const general: string[] = [];
  for (const i of issues) {
    const path = i.path.replace(/^props\.?/, '');
    if (!path) {
      general.push(i.message);
      continue;
    }
    const [key, ...rest] = path.split('.');
    (byField[key] ??= {})[rest.join('.')] = i.message;
  }
  const knownKeys = new Set(meta.fields.map((f) => f.key));
  for (const [k, v] of Object.entries(byField)) if (!knownKeys.has(k)) general.push(`${k}: ${Object.values(v)[0]}`);

  const set = (key: string, value: unknown) => {
    const next = { ...props };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  };
  const ctaMax = ['imageText', 'stage3d'].includes(section.type) ? 2 : 3;
  const render = (f: FieldDef) => <FieldRenderer key={f.key} def={f} value={props[f.key]} onChange={(v) => set(f.key, v)} issues={byField[f.key]} props={props} ctaMax={ctaMax} />;

  const variantDef = meta.fields.find((f) => f.key === 'variant');
  const content = meta.fields.filter((f) => f.key !== 'variant' && !ADVANCED.has(f.key) && !STYLE.has(f.key));
  const style = meta.fields.filter((f) => STYLE.has(f.key));
  const advanced = meta.fields.filter((f) => ADVANCED.has(f.key));
  const advancedHasError = advanced.some((f) => byField[f.key]);

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-adm-dark text-adm-gold">
          <I className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{meta.label}</h2>
          <p className="mt-0.5 text-xs leading-snug text-adm-muted">{meta.description}</p>
        </div>
        <button type="button" onClick={onToggle} className={cn('adm-btn-ghost shrink-0 px-2 py-1 text-xs', !section.enabled && 'text-amber-700')} title={section.enabled ? 'Hide this section on the site' : 'Show this section on the site'}>
          {section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {section.enabled ? 'Visible' : 'Hidden'}
        </button>
      </header>

      {!section.enabled && <Callout tone="warn">This section is hidden. It stays in the page but visitors won’t see it.</Callout>}
      {general.length > 0 && (
        <Callout tone="danger" title="Needs attention before publishing">
          <ul className="list-disc pl-4">
            {general.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </Callout>
      )}
      {meta.dataSource && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Items are pulled automatically from <strong>{meta.dataSource}</strong> (published entries only).
          </span>
          {SOURCE_LINKS[meta.dataSource] && (
            <Link to={SOURCE_LINKS[meta.dataSource]} target="_blank" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
              Manage <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}

      {variantDef && (
        <div className="rounded-xl border border-adm-line bg-white p-3">
          <Field label="Layout" hint="Changes how this section is arranged. Content stays the same.">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label="Layout">
              {(variantDef.options ?? []).map((o) => {
                const on = (props.variant ?? variantDef.options?.[0]?.value) === o.value;
                return (
                  <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => set('variant', o.value)} className={cn('rounded-lg border px-2.5 py-2 text-left text-xs transition', on ? 'border-adm-gold bg-[#FBF7EE] font-medium text-adm-ink ring-1 ring-adm-gold' : 'border-adm-line text-adm-muted hover:border-adm-ink/30 hover:text-adm-ink')}>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </Field>
          {byField.variant && <p className="mt-1 text-xs text-red-600">{Object.values(byField.variant)[0]}</p>}
        </div>
      )}

      <div className="space-y-4">{content.map(render)}</div>

      {style.length > 0 && (
        <div className="space-y-4 border-t border-adm-line pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Display</h3>
          {style.map(render)}
        </div>
      )}

      {advanced.length > 0 && (
        <div className="border-t border-adm-line pt-3">
          <button type="button" className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted hover:text-adm-ink" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced || advancedHasError}>
            Background & advanced
            <ChevronDown className={cn('h-4 w-4 transition', (showAdvanced || advancedHasError) && 'rotate-180')} />
          </button>
          {(showAdvanced || advancedHasError) && <div className="mt-3 space-y-4">{advanced.map(render)}</div>}
        </div>
      )}
      <p className="text-[11px] text-adm-muted">Section id: {section.id}</p>
    </div>
  );
}

