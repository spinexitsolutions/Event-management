import { useId } from 'react';
import type { Cta, FieldDef } from '@maison/shared';
import { Icon } from '@/components/ui/Icon';
import { Field, Input, Select, Textarea, Toggle } from '@/admin/ui';
import { Callout, RangeField, Segmented } from '../components/bits';
import { ColorField, CtaFields, MarkdownField } from '../components/inputs';
import { ListEditor, StringListEditor } from '../components/ListEditor';
import { IconPicker } from '../components/IconPicker';
import { GalleryEditor, ImageField, VideoField, type GalleryImage } from '../components/MediaFields';

/** Issues for one field: '' = the field itself, '0.label' = nested paths. */
export type FieldIssues = Record<string, string>;

const firstIssue = (issues?: FieldIssues) => {
  if (!issues) return undefined;
  const entries = Object.entries(issues);
  if (!entries.length) return undefined;
  const [path, msg] = entries[0];
  if (!path) return msg;
  const [idx, ...rest] = path.split('.');
  return /^\d+$/.test(idx) ? `Item ${Number(idx) + 1}${rest.length ? ` · ${rest.join(' ')}` : ''}: ${msg}` : `${path}: ${msg}`;
};
const itemIssue = (issues: FieldIssues | undefined, i: number, key: string) => issues?.[`${i}.${key}`];

interface HeroSlide {
  imageUrl: string;
  alt: string;
  videoUrl: string;
  caption: string;
}
interface StatItem {
  label: string;
  value: number;
  suffix: string;
  metric: 'manual' | 'completedEvents' | 'clientsServed' | 'citiesServed' | 'publishedProjects';
}
interface FeatureItem {
  icon: string;
  title: string;
  body: string;
}
interface ProcessStep {
  title: string;
  body: string;
}
interface Background {
  variant: 'default' | 'surface' | 'contrast' | 'image';
  imageUrl: string;
  overlay: number;
}

const METRICS = [
  { value: 'manual', label: 'Manual figure (I have verified it)' },
  { value: 'completedEvents', label: 'Live: completed events' },
  { value: 'clientsServed', label: 'Live: clients served' },
  { value: 'citiesServed', label: 'Live: cities served' },
  { value: 'publishedProjects', label: 'Live: published portfolio projects' },
];

const CTA_LIMIT: Record<string, number> = { ctas: 3 };

/** Renders one builder field from its `FieldDef`. */
export function FieldRenderer({ def, value, onChange, issues, props, ctaMax }: { def: FieldDef; value: unknown; onChange: (v: unknown) => void; issues?: FieldIssues; props: Record<string, unknown>; ctaMax?: number }) {
  const id = useId();
  const error = firstIssue(issues);
  const invalid = !!error;
  const str = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);

  switch (def.type) {
    case 'text':
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help} error={error}>
          <Input id={id} value={str} onChange={(e) => onChange(e.target.value)} invalid={invalid} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help} error={error}>
          <Textarea id={id} rows={3} value={str} onChange={(e) => onChange(e.target.value)} invalid={invalid} />
        </Field>
      );
    case 'markdown':
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help} error={error}>
          <MarkdownField id={id} value={str} onChange={onChange} invalid={invalid} />
        </Field>
      );
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value ?? 0);
      if (def.max !== undefined && def.max <= 1) {
        return (
          <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help} error={error}>
            <RangeField id={id} value={Number.isFinite(n) ? n : 0} min={def.min ?? 0} max={def.max} step={0.05} onChange={onChange} format={(v) => `${Math.round(v * 100)}%`} />
          </Field>
        );
      }
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help ?? (def.min !== undefined && def.max !== undefined ? `Between ${def.min} and ${def.max}` : undefined)} error={error}>
          <Input
            id={id}
            type="number"
            className="w-32"
            min={def.min}
            max={def.max}
            value={Number.isFinite(n) ? n : ''}
            onChange={(e) => {
              const v = e.target.value === '' ? (def.min ?? 0) : Number(e.target.value);
              onChange(Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, v)));
            }}
            invalid={invalid}
          />
        </Field>
      );
    }
    case 'boolean':
      return (
        <Field hint={def.help} error={error}>
          <Toggle checked={!!value} onChange={onChange} label={def.label} />
        </Field>
      );
    case 'select': {
      const opts = def.options ?? [];
      if (opts.length <= 3 && def.key !== 'variant' && opts.every((o) => o.label.length < 14))
        return (
          <Field label={def.label} hint={def.help} error={error}>
            <Segmented label={def.label} value={str || opts[0]?.value} onChange={onChange} options={opts} size="sm" />
          </Field>
        );
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help} error={error}>
          <Select id={id} value={str || opts[0]?.value} onChange={(e) => onChange(e.target.value)} options={opts} invalid={invalid} />
        </Field>
      );
    }
    case 'image': {
      const altKey = def.key === 'imageUrl' ? 'imageAlt' : def.key === 'posterUrl' ? 'posterAlt' : null;
      const hasAltField = altKey !== null && altKey in props;
      return (
        <Field label={def.label} hint={def.help ?? (hasAltField ? 'Alt text is edited in its own field below.' : undefined)} error={error}>
          <ImageField value={str} onChange={(url) => onChange(url)} invalid={invalid} label={def.label.toLowerCase()} />
        </Field>
      );
    }
    case 'video':
      return (
        <Field label={def.label} hint={def.help} error={error}>
          <VideoField value={str} onChange={onChange} invalid={invalid} />
        </Field>
      );
    case 'color':
      return (
        <Field label={<label htmlFor={id}>{def.label}</label>} hint={def.help ?? 'Leave empty to use the theme’s accent colour.'} error={error}>
          <ColorField id={id} value={str} onChange={onChange} allowEmpty invalid={invalid} />
        </Field>
      );
    case 'cta': {
      const cta = (value as Cta | undefined) ?? undefined;
      return (
        <Field label={def.label} hint={def.help} error={error}>
          {cta ? (
            <div className="space-y-1.5 rounded-lg border border-adm-line bg-white p-2.5">
              <CtaFields value={cta} onChange={onChange} errors={{ label: issues?.label, href: issues?.href }} />
              <button type="button" className="text-xs text-adm-muted hover:text-red-600" onClick={() => onChange(undefined)}>
                Remove button
              </button>
            </div>
          ) : (
            <button type="button" className="adm-btn-secondary px-2.5 py-1.5 text-xs" onClick={() => onChange({ label: 'Learn more', href: '/', variant: 'secondary' })}>
              Add a button
            </button>
          )}
        </Field>
      );
    }
    case 'ctas': {
      const list = (Array.isArray(value) ? value : []) as Cta[];
      return (
        <Field label={def.label} hint={def.help}>
          <ListEditor<Cta>
            items={list}
            onChange={onChange}
            max={ctaMax ?? CTA_LIMIT.ctas}
            addLabel="Add button"
            empty="No buttons."
            error={issues?.[''] ? error : undefined}
            newItem={() => ({ label: 'Book your event', href: '/inquire', variant: list.length ? 'secondary' : 'primary' })}
            itemTitle={(c) => (
              <span>
                {c.label || <em className="text-adm-muted">Untitled button</em>} <span className="font-normal text-adm-muted">→ {c.href || '…'}</span>
              </span>
            )}
            renderItem={(c, _u, i) => <CtaFields value={c} onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))} errors={{ label: itemIssue(issues, i, 'label'), href: itemIssue(issues, i, 'href') }} />}
          />
        </Field>
      );
    }
    case 'stringList':
      return (
        <Field label={def.label} hint={def.help} error={error}>
          <StringListEditor value={(value as string[]) ?? []} onChange={onChange} />
        </Field>
      );
    case 'images':
      if (props.source === 'portfolio')
        return (
          <Field label={def.label}>
            <Callout tone="info">This gallery shows the latest published portfolio photography automatically. Switch “Images from” to “Chosen images” to hand-pick images.</Callout>
          </Field>
        );
      return (
        <Field label={def.label} hint={def.help}>
          <GalleryEditor value={(value as GalleryImage[]) ?? []} onChange={onChange} error={error} />
        </Field>
      );
    case 'heroSlides': {
      const list = (Array.isArray(value) ? value : []) as HeroSlide[];
      return (
        <Field label={def.label} hint="Wide landscape photographs work best (at least 2000px wide). The first image loads first.">
          <ListEditor<HeroSlide>
            items={list}
            onChange={onChange}
            max={8}
            addLabel="Add slide"
            empty="Add at least one hero image."
            error={issues?.[''] ? error : undefined}
            newItem={() => ({ imageUrl: '', alt: '', videoUrl: '', caption: '' })}
            itemTitle={(s, i) => (
              <span className="flex items-center gap-2">
                <span className="text-adm-muted">Slide {i + 1}</span>
                <span className="truncate font-normal">{s.caption || s.alt || (s.imageUrl ? '' : <em className="text-amber-700">No image yet</em>)}</span>
              </span>
            )}
            renderItem={(s, update, i) => (
              <>
                <ImageField value={s.imageUrl} onChange={(url, alt) => update({ imageUrl: url, ...(alt && !s.alt ? { alt } : {}) })} alt={s.alt} onAltChange={(alt) => update({ alt })} invalid={!!itemIssue(issues, i, 'imageUrl')} label="slide image" />
                {itemIssue(issues, i, 'imageUrl') && <p className="text-xs text-red-600">{itemIssue(issues, i, 'imageUrl')}</p>}
                <div>
                  <span className="adm-label">Caption (optional)</span>
                  <Input value={s.caption} maxLength={120} onChange={(e) => update({ caption: e.target.value })} placeholder="e.g. Wedding receptions" />
                </div>
                <div>
                  <span className="adm-label">Background video (optional)</span>
                  <VideoField value={s.videoUrl} onChange={(videoUrl) => update({ videoUrl })} allowEmbeds={false} />
                  <p className="mt-1 text-[11px] text-adm-muted">The image is used as the poster, and is shown instead of the video on phones and for visitors who prefer reduced motion.</p>
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'statItems': {
      const list = (Array.isArray(value) ? value : []) as StatItem[];
      return (
        <Field label={def.label}>
          <Callout tone="gold" className="mb-2">
            “Live” figures are calculated from your bookings and portfolio and stay accurate automatically. Only use a <strong>manual</strong> figure if you have verified it — published statistics must be true.
          </Callout>
          <ListEditor<StatItem>
            items={list}
            onChange={onChange}
            max={6}
            addLabel="Add statistic"
            error={issues?.[''] ? error : undefined}
            newItem={() => ({ label: 'Events delivered', value: 0, suffix: '+', metric: 'completedEvents' })}
            itemTitle={(s) => (
              <span>
                {s.label || <em className="text-adm-muted">Untitled</em>} <span className="font-normal text-adm-muted">· {s.metric === 'manual' ? `${s.value}${s.suffix}` : 'live'}</span>
              </span>
            )}
            renderItem={(s, update, i) => (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <span className="adm-label">Label</span>
                  <Input value={s.label} maxLength={50} onChange={(e) => update({ label: e.target.value })} invalid={!!itemIssue(issues, i, 'label')} />
                </div>
                <div className="sm:col-span-2">
                  <span className="adm-label">Figure source</span>
                  <Select value={s.metric} onChange={(e) => update({ metric: e.target.value as StatItem['metric'] })} options={METRICS} />
                </div>
                {s.metric === 'manual' && (
                  <div>
                    <span className="adm-label">Value</span>
                    <Input type="number" min={0} max={10000000} value={s.value} onChange={(e) => update({ value: Math.max(0, Number(e.target.value) || 0) })} />
                  </div>
                )}
                <div>
                  <span className="adm-label">Suffix</span>
                  <Input value={s.suffix} maxLength={6} onChange={(e) => update({ suffix: e.target.value })} placeholder="+ or %" />
                </div>
              </div>
            )}
          />
        </Field>
      );
    }
    case 'featureItems': {
      const list = (Array.isArray(value) ? value : []) as FeatureItem[];
      return (
        <Field label={def.label}>
          <ListEditor<FeatureItem>
            items={list}
            onChange={onChange}
            max={12}
            min={0}
            addLabel="Add highlight"
            error={issues?.[''] ? error : undefined}
            newItem={() => ({ icon: 'sparkles', title: '', body: '' })}
            itemTitle={(f) => (
              <span className="flex items-center gap-2">
                <Icon name={f.icon} className="h-4 w-4 text-adm-gold" strokeWidth={1.5} />
                {f.title || <em className="font-normal text-adm-muted">Untitled</em>}
              </span>
            )}
            renderItem={(f, update, i) => (
              <>
                <div>
                  <span className="adm-label">Icon</span>
                  <IconPicker value={f.icon} onChange={(icon) => update({ icon })} />
                </div>
                <div>
                  <span className="adm-label">Title</span>
                  <Input value={f.title} maxLength={80} onChange={(e) => update({ title: e.target.value })} invalid={!!itemIssue(issues, i, 'title')} />
                  {itemIssue(issues, i, 'title') && <p className="mt-1 text-xs text-red-600">{itemIssue(issues, i, 'title')}</p>}
                </div>
                <div>
                  <span className="adm-label">Text</span>
                  <Textarea rows={2} value={f.body} maxLength={400} onChange={(e) => update({ body: e.target.value })} />
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'processSteps': {
      const list = (Array.isArray(value) ? value : []) as ProcessStep[];
      return (
        <Field label={def.label}>
          <ListEditor<ProcessStep>
            items={list}
            onChange={onChange}
            max={10}
            addLabel="Add step"
            error={issues?.[''] ? error : undefined}
            newItem={() => ({ title: '', body: '' })}
            itemTitle={(s, i) => (
              <span>
                <span className="mr-1.5 tabular-nums text-adm-muted">{String(i + 1).padStart(2, '0')}</span>
                {s.title || <em className="font-normal text-adm-muted">Untitled step</em>}
              </span>
            )}
            renderItem={(s, update, i) => (
              <>
                <div>
                  <span className="adm-label">Title</span>
                  <Input value={s.title} maxLength={80} onChange={(e) => update({ title: e.target.value })} invalid={!!itemIssue(issues, i, 'title')} />
                  {itemIssue(issues, i, 'title') && <p className="mt-1 text-xs text-red-600">{itemIssue(issues, i, 'title')}</p>}
                </div>
                <div>
                  <span className="adm-label">Description</span>
                  <Textarea rows={2} value={s.body} maxLength={400} onChange={(e) => update({ body: e.target.value })} />
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'background': {
      const bg: Background = { variant: 'default', imageUrl: '', overlay: 0.55, ...((value as Partial<Background>) ?? {}) };
      return (
        <Field label={def.label} hint="Alternate backgrounds to give the page rhythm." error={error}>
          <div className="space-y-3 rounded-lg border border-adm-line bg-white p-3">
            <Segmented
              label="Background style"
              size="sm"
              value={bg.variant}
              onChange={(variant) => onChange({ ...bg, variant })}
              options={[
                { value: 'default', label: 'Page' },
                { value: 'surface', label: 'Tinted' },
                { value: 'contrast', label: 'Contrast' },
                { value: 'image', label: 'Image' },
              ]}
            />
            {bg.variant === 'image' && (
              <>
                <ImageField value={bg.imageUrl} onChange={(imageUrl) => onChange({ ...bg, imageUrl })} label="background image" />
                <div>
                  <span className="adm-label">Darkening overlay (keeps text readable)</span>
                  <RangeField value={bg.overlay} min={0} max={1} step={0.05} onChange={(overlay) => onChange({ ...bg, overlay })} format={(v) => `${Math.round(v * 100)}%`} />
                </div>
              </>
            )}
          </div>
        </Field>
      );
    }
    default:
      return null;
  }
}
