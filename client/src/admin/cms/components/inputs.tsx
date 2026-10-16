import { Eye, Pencil } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { safeHref, type Cta } from '@maison/shared';
import { useSite } from '@/app/SiteProvider';
import { Markdown } from '@/components/ui/Markdown';
import { Input, Select, Textarea } from '@/admin/ui';
import { cn } from '@/lib/cn';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Colour picker + hex input. `allowEmpty` adds a clear button (empty string = default). */
export function ColorField({ value, onChange, allowEmpty, id, invalid }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; id?: string; invalid?: boolean }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  const ok = HEX.test(value);
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-9 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-adm-line" style={{ background: ok ? value : 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50% / 10px 10px' }}>
        <span className="sr-only">Pick colour</span>
        <input type="color" value={ok ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <Input
        id={id}
        className="font-mono uppercase"
        value={shown}
        maxLength={7}
        invalid={invalid || (!!shown && !HEX.test(shown) && !focused)}
        placeholder={allowEmpty ? 'Default' : '#000000'}
        onFocus={() => {
          setText(value);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (v && !v.startsWith('#')) v = `#${v}`;
          setText(v);
          if (HEX.test(v)) onChange(v.toUpperCase());
          else if (!v && allowEmpty) onChange('');
        }}
      />
      {allowEmpty && value && (
        <button type="button" className="adm-btn-ghost px-2 py-1 text-xs" onClick={() => onChange('')}>
          Clear
        </button>
      )}
    </div>
  );
}

/** Markdown textarea with a live preview toggle and a short syntax hint. */
export function MarkdownField({ value, onChange, rows = 8, id, invalid, maxLength }: { value: string; onChange: (v: string) => void; rows?: number; id?: string; invalid?: boolean; maxLength?: number }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-adm-line bg-white focus-within:border-adm-gold focus-within:ring-2 focus-within:ring-adm-gold/20">
      <div className="flex items-center justify-between border-b border-adm-line bg-adm-bg/50 px-2 py-1">
        <span className="text-[11px] text-adm-muted">
          **bold** · *italic* · ## Heading · - list · [link](/page)
        </span>
        <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-adm-muted hover:bg-white hover:text-adm-ink" aria-pressed={preview}>
          {preview ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div className="cms-md-preview max-h-[420px] min-h-[120px] overflow-y-auto px-3 py-2 text-sm leading-relaxed [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc">
          {value ? <Markdown className="!text-adm-ink">{value}</Markdown> : <p className="text-adm-muted">Nothing to preview yet.</p>}
        </div>
      ) : (
        <textarea id={id} rows={rows} value={value ?? ''} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid || undefined} className="block w-full resize-y border-0 bg-white px-3 py-2 text-sm text-adm-ink outline-none [color-scheme:light]" />
      )}
    </div>
  );
}

const BUILTIN_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events (all categories)' },
  { href: '/services', label: 'Services' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/packages', label: 'Packages' },
  { href: '/venues', label: 'Venues' },
  { href: '/journal', label: 'Journal' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/inquire', label: 'Inquiry form' },
  { href: '/login', label: 'Client login' },
];

/** All internal links the editor can pick from (built-in routes, CMS pages, event categories). */
export function useSiteLinks() {
  const { bootstrap } = useSite();
  return useMemo(() => {
    const pages = (bootstrap?.pages ?? []).filter((p) => !['HOME', 'ABOUT', 'CONTACT'].includes(p.kind)).map((p) => ({ href: `/${p.slug}`, label: p.title }));
    const cats = (bootstrap?.categories ?? []).map((c) => ({ href: `/events/${c.slug}`, label: c.name }));
    return { builtin: BUILTIN_LINKS, pages, categories: cats };
  }, [bootstrap]);
}

/** Text input for links with suggestions of internal pages and validation of the URL scheme. */
export function LinkInput({ value, onChange, placeholder = '/page, #anchor or https://…', id, className, invalid }: { value: string; onChange: (v: string) => void; placeholder?: string; id?: string; className?: string; invalid?: boolean }) {
  const listId = useId();
  const links = useSiteLinks();
  const bad = !!value && !safeHref.safeParse(value).success;
  return (
    <>
      <Input id={id} className={className} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} list={listId} invalid={invalid || bad} title={bad ? 'Use /page, #anchor, https://, mailto: or tel:' : undefined} />
      <datalist id={listId}>
        {[...links.builtin, ...links.pages, ...links.categories].map((l) => (
          <option key={l.href} value={l.href}>
            {l.label}
          </option>
        ))}
      </datalist>
    </>
  );
}

const VARIANTS = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'ghost', label: 'Text link' },
];

export function CtaFields({ value, onChange, errors }: { value: Partial<Cta>; onChange: (v: Cta) => void; errors?: { label?: string; href?: string } }) {
  const v: Cta = { label: value?.label ?? '', href: value?.href ?? '', variant: value?.variant ?? 'primary' };
  const id = useId();
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <div>
        <label htmlFor={`${id}l`} className="mb-0.5 block text-[11px] text-adm-muted">
          Label
        </label>
        <Input id={`${id}l`} value={v.label} maxLength={40} onChange={(e) => onChange({ ...v, label: e.target.value })} placeholder="Book your event" invalid={!!errors?.label} />
      </div>
      <div>
        <label htmlFor={`${id}h`} className="mb-0.5 block text-[11px] text-adm-muted">
          Link
        </label>
        <LinkInput id={`${id}h`} value={v.href} onChange={(href) => onChange({ ...v, href })} invalid={!!errors?.href} />
      </div>
      <div>
        <label htmlFor={`${id}v`} className="mb-0.5 block text-[11px] text-adm-muted">
          Style
        </label>
        <Select id={`${id}v`} value={v.variant} onChange={(e) => onChange({ ...v, variant: e.target.value as Cta['variant'] })} options={VARIANTS} />
      </div>
      {(errors?.label || errors?.href) && <p className="text-xs text-red-600 sm:col-span-3">{errors.label ?? errors.href}</p>}
    </div>
  );
}

/** Text area with character counter in the label row. */
export function CountedTextarea({ value, onChange, max, rows = 3, id, invalid, placeholder }: { value: string; onChange: (v: string) => void; max: number; rows?: number; id?: string; invalid?: boolean; placeholder?: string }) {
  return (
    <div className="relative">
      <Textarea id={id} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} invalid={invalid || (value?.length ?? 0) > max} placeholder={placeholder} />
      <span className={cn('pointer-events-none absolute bottom-1.5 right-2 text-[10px] tabular-nums', (value?.length ?? 0) > max ? 'text-red-600' : 'text-adm-muted')}>
        {value?.length ?? 0}/{max}
      </span>
    </div>
  );
}
