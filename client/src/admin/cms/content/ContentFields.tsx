import { useQuery } from '@tanstack/react-query';
import { Info, ShieldCheck, Star } from 'lucide-react';
import { useId, useState } from 'react';
import { CURRENCIES } from '@maison/shared';
import { Field, Input, MoneyInput, Select, Textarea, Toggle } from '@/admin/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { money } from '@/lib/format';
import { Callout, CharCount, Segmented } from '../components/bits';
import { IconPicker } from '../components/IconPicker';
import { CountedTextarea, LinkInput, MarkdownField } from '../components/inputs';
import { ListEditor, StringListEditor } from '../components/ListEditor';
import { GalleryEditor, ImageField, VideoField, type GalleryImage } from '../components/MediaFields';
import { slugify } from '../lib/util';
import type { FieldSpec } from './collections';

export type Rec = Record<string, unknown>;

interface Ctx {
  rec: Rec;
  set: (key: string, v: unknown) => void;
  patch: (p: Rec) => void;
  errors: Record<string, string>;
  slugTouched: boolean;
  setSlugTouched: (v: boolean) => void;
  blocked?: string | null;
}

const err = (errors: Record<string, string>, key: string) => errors[key] ?? Object.entries(errors).find(([k]) => k.startsWith(`${key}.`))?.[1];

function RelationMulti({ value, onChange, collection }: { value: string[]; onChange: (v: string[]) => void; collection: string }) {
  const q = useQuery({ queryKey: ['cms-content-options', collection], queryFn: () => api.get<{ id: string; name: string; status: string }[]>(`/admin/content/${collection}`, { limit: 200 }) });
  const [filter, setFilter] = useState('');
  const ids = Array.isArray(value) ? value : [];
  if (q.isLoading) return <div className="h-24 animate-pulse rounded-lg bg-adm-bg" />;
  if (q.isError) return <p className="text-xs text-red-600">Couldn’t load options.</p>;
  const opts = (q.data ?? []).filter((o) => !filter || o.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="rounded-lg border border-adm-line bg-white">
      {(q.data?.length ?? 0) > 8 && <input className="w-full border-b border-adm-line bg-white px-3 py-1.5 text-xs text-adm-ink outline-none [color-scheme:light]" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter options" />}
      <ul className="max-h-56 overflow-y-auto p-1">
        {opts.map((o) => {
          const on = ids.includes(o.id);
          return (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-adm-bg">
                <input type="checkbox" className="h-4 w-4 accent-[#B8955A] [color-scheme:light]" checked={on} onChange={() => onChange(on ? ids.filter((x) => x !== o.id) : [...ids, o.id])} />
                <span className="flex-1 truncate">{o.name}</span>
                {o.status !== 'PUBLISHED' && <span className="text-[10px] uppercase text-adm-muted">{o.status.toLowerCase()}</span>}
              </label>
            </li>
          );
        })}
        {opts.length === 0 && <li className="px-2 py-3 text-center text-xs text-adm-muted">No options</li>}
      </ul>
      <p className="border-t border-adm-line px-3 py-1.5 text-[11px] text-adm-muted">{ids.length} selected</p>
    </div>
  );
}

function RelationSingle({ value, onChange, collection }: { value: string | null; onChange: (v: string | null) => void; collection: string }) {
  const q = useQuery({ queryKey: ['cms-content-options', collection], queryFn: () => api.get<{ id: string; name?: string; title?: string }[]>(`/admin/content/${collection}`, { limit: 200 }) });
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={q.isLoading}>
      <option value="">{q.isLoading ? 'Loading…' : 'None'}</option>
      {q.data?.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name ?? o.title}
        </option>
      ))}
    </Select>
  );
}

function PricingFields({ rec, set, errors }: Ctx) {
  const model = (rec.pricingModel as string) ?? 'ON_REQUEST';
  const currency = (rec.currency as string) || 'INR';
  const price = (rec.priceMinor as number | null) ?? null;
  const discount = Number(rec.discountBps ?? 0);
  const discounted = price !== null && discount > 0 ? Math.round(price * (1 - discount / 10000)) : null;
  const EXPLAIN: Record<string, string> = {
    STARTING_FROM: 'Shows “Starting from” and the lowest realistic price. The final price is set in a personalised quotation — best for most luxury packages.',
    FIXED: 'Shows one exact price. Use only when the package is genuinely fixed-scope and fixed-price.',
    ON_REQUEST: 'No price is shown anywhere on the website. Visitors see “Price on request” and are invited to request a quote.',
  };
  return (
    <div className="space-y-4">
      <Field label="How is this package priced?">
        <Segmented
          label="Pricing model"
          value={model}
          onChange={(v) => set('pricingModel', v)}
          options={[
            { value: 'STARTING_FROM', label: 'Starting from' },
            { value: 'FIXED', label: 'Fixed price' },
            { value: 'ON_REQUEST', label: 'Price on request' },
          ]}
        />
      </Field>
      <Callout tone={model === 'ON_REQUEST' ? 'gold' : 'info'}>
        <Info className="mr-1 inline h-3.5 w-3.5" />
        {EXPLAIN[model]}
      </Callout>
      {model !== 'ON_REQUEST' && (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label={model === 'FIXED' ? 'Price' : 'Starting price'} required error={errors.priceMinor}>
              <MoneyInput value={price} onChange={(v) => set('priceMinor', v)} currency={currency} allowEmpty invalid={!!errors.priceMinor} />
            </Field>
            <Field label="Currency" error={errors.currency}>
              <Select value={currency} onChange={(e) => set('currency', e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Promotional discount (%)" hint="Optional. Shows the original price struck through." error={errors.discountBps}>
              <Input type="number" min={0} max={90} step={0.5} value={discount / 100} onChange={(e) => set('discountBps', Math.round(Math.min(90, Math.max(0, Number(e.target.value) || 0)) * 100))} />
            </Field>
            <Field label="Discount label" error={errors.discountLabel}>
              <Input value={(rec.discountLabel as string) ?? ''} maxLength={60} onChange={(e) => set('discountLabel', e.target.value)} placeholder="e.g. Early-booking offer" disabled={!discount} />
            </Field>
          </div>
          <div className="rounded-lg border border-dashed border-adm-line bg-adm-bg/40 px-3 py-2 text-xs">
            <span className="text-adm-muted">Shown on the website as: </span>
            {price ? (
              <strong>
                {model === 'STARTING_FROM' && 'Starting from '}
                {discounted !== null ? (
                  <>
                    <s className="font-normal text-adm-muted">{money(price, currency)}</s> {money(discounted, currency)}
                  </>
                ) : (
                  money(price, currency)
                )}
              </strong>
            ) : (
              <em className="text-amber-700">Enter a price</em>
            )}
          </div>
        </>
      )}
    </div>
  );
}

interface AddOn {
  name: string;
  description: string;
  priceMinor: number | null;
}

function GuardField({ spec, rec, set, errors, blocked }: Ctx & { spec: Extract<FieldSpec, { kind: 'guard' }> }) {
  const on = !!rec[spec.key];
  return (
    <div className={cn('rounded-lg border p-3', on ? 'border-emerald-200 bg-emerald-50/60' : blocked ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50/70')}>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-700 [color-scheme:light]" checked={on} onChange={(e) => set(spec.key, e.target.checked)} />
        <span className="text-sm font-medium">{spec.title}</span>
      </label>
      <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-adm-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {spec.why}
      </p>
      {blocked && !on && (
        <p className="mt-2 text-xs font-medium text-red-700" role="alert">
          {blocked}
        </p>
      )}
      {spec.noteKey && (
        <div className="mt-3">
          <span className="adm-label">How and when consent was given</span>
          <Textarea rows={2} value={(rec[spec.noteKey] as string) ?? ''} maxLength={300} onChange={(e) => set(spec.noteKey!, e.target.value)} placeholder="e.g. Email from the bride, 12 Feb 2026 — no close-ups of guests" />
          {err(errors, spec.noteKey) && <p className="mt-1 text-xs text-red-600">{err(errors, spec.noteKey)}</p>}
        </div>
      )}
    </div>
  );
}

/** Renders one content field from its spec. */
export function ContentField({ spec, ctx }: { spec: FieldSpec; ctx: Ctx }) {
  const id = useId();
  const { rec, set, errors } = ctx;
  switch (spec.kind) {
    case 'text':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} required={spec.required} hint={spec.help} error={err(errors, spec.key)}>
          <Input id={id} value={(rec[spec.key] as string) ?? ''} maxLength={spec.max} placeholder={spec.placeholder} onChange={(e) => set(spec.key, e.target.value)} invalid={!!err(errors, spec.key)} />
        </Field>
      );
    case 'textarea':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} required={spec.required} hint={spec.help} error={err(errors, spec.key)}>
          <CountedTextarea id={id} value={(rec[spec.key] as string) ?? ''} max={spec.max} rows={spec.rows ?? 3} placeholder={spec.placeholder} onChange={(v) => set(spec.key, v)} invalid={!!err(errors, spec.key)} />
        </Field>
      );
    case 'markdown':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <MarkdownField id={id} value={(rec[spec.key] as string) ?? ''} rows={spec.rows ?? 10} maxLength={spec.max} onChange={(v) => set(spec.key, v)} invalid={!!err(errors, spec.key)} />
        </Field>
      );
    case 'slug': {
      const value = (rec.slug as string) ?? '';
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} required error={err(errors, 'slug')} hint={ctx.slugTouched ? undefined : 'Generated from the name — edit if you like.'}>
          <div className="flex items-center rounded-lg border border-adm-line bg-adm-bg/60 focus-within:border-adm-gold focus-within:ring-2 focus-within:ring-adm-gold/20">
            <span className="whitespace-nowrap pl-3 text-xs text-adm-muted">…/</span>
            <input
              id={id}
              className="w-full bg-transparent px-1 py-2 text-sm outline-none"
              value={value}
              maxLength={80}
              onChange={(e) => {
                ctx.setSlugTouched(true);
                set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
              }}
              onBlur={() => set('slug', slugify(value))}
            />
            <button type="button" className="mr-1 rounded px-2 py-1 text-[11px] text-adm-muted hover:bg-white hover:text-adm-ink" onClick={() => {
              ctx.setSlugTouched(false);
              set('slug', slugify(String(rec[spec.from] ?? '')));
            }}>
              Regenerate
            </button>
          </div>
        </Field>
      );
    }
    case 'image':
      return (
        <Field label={spec.label} required={spec.required} hint={spec.help} error={err(errors, spec.key) ?? (spec.altKey ? err(errors, spec.altKey) : undefined)}>
          <ImageField
            value={(rec[spec.key] as string) ?? ''}
            onChange={(url, alt) => ctx.patch({ [spec.key]: url, ...(spec.altKey && alt && !rec[spec.altKey] ? { [spec.altKey]: alt } : {}) })}
            alt={spec.altKey ? ((rec[spec.altKey] as string) ?? '') : undefined}
            onAltChange={spec.altKey ? (v) => set(spec.altKey!, v) : undefined}
            aspect={spec.aspect}
            invalid={!!err(errors, spec.key)}
            label={spec.label.toLowerCase()}
          />
        </Field>
      );
    case 'gallery':
      return (
        <Field label={spec.label} hint={spec.help}>
          <GalleryEditor value={(rec[spec.key] as GalleryImage[]) ?? []} onChange={(v) => set(spec.key, v)} max={spec.max} error={err(errors, spec.key)} />
        </Field>
      );
    case 'strings':
      return (
        <Field label={spec.label} hint={spec.help}>
          <StringListEditor value={(rec[spec.key] as string[]) ?? []} onChange={(v) => set(spec.key, spec.lower ? v.map((x) => x.toLowerCase()) : v)} max={spec.max} maxLength={spec.itemMax} placeholder={spec.placeholder} error={err(errors, spec.key)} />
        </Field>
      );
    case 'faqs': {
      const list = (rec[spec.key] as { question: string; answer: string }[]) ?? [];
      return (
        <Field label={spec.label}>
          <ListEditor
            items={list}
            onChange={(v) => set(spec.key, v)}
            max={spec.max}
            addLabel="Add question"
            empty="No questions yet."
            error={err(errors, spec.key)}
            newItem={() => ({ question: '', answer: '' })}
            itemTitle={(f) => f.question || <em className="font-normal text-adm-muted">New question</em>}
            renderItem={(f, update, i) => (
              <>
                <div>
                  <span className="adm-label">Question</span>
                  <Input value={f.question} maxLength={200} onChange={(e) => update({ question: e.target.value })} invalid={!!errors[`${spec.key}.${i}.question`]} />
                </div>
                <div>
                  <span className="adm-label">Answer</span>
                  <Textarea rows={3} value={f.answer} maxLength={2000} onChange={(e) => update({ answer: e.target.value })} invalid={!!errors[`${spec.key}.${i}.answer`]} />
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'select':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <Select id={id} value={(rec[spec.key] as string) ?? spec.options[0].value} onChange={(e) => set(spec.key, e.target.value)} options={spec.options} />
        </Field>
      );
    case 'number': {
      const v = rec[spec.key] as number | null | undefined;
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <Input id={id} type="number" min={spec.min} max={spec.max} value={v ?? ''} onChange={(e) => set(spec.key, e.target.value === '' ? (spec.nullable ? null : spec.min) : Math.round(Number(e.target.value)))} invalid={!!err(errors, spec.key)} />
        </Field>
      );
    }
    case 'money':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <MoneyInput id={id} value={(rec[spec.key] as number | null) ?? null} onChange={(v) => set(spec.key, v)} allowEmpty placeholder="Not set" />
          {spec.internal && <p className="mt-1 inline-flex items-center gap-1 rounded bg-adm-dark px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Internal only</p>}
        </Field>
      );
    case 'boolean':
      return (
        <Field hint={spec.help} error={err(errors, spec.key)}>
          <Toggle checked={!!rec[spec.key]} onChange={(v) => set(spec.key, v)} label={spec.label} />
        </Field>
      );
    case 'date':
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <div className="flex gap-1.5">
            <Input id={id} type="date" value={(rec[spec.key] as string) ?? ''} onChange={(e) => set(spec.key, e.target.value || null)} invalid={!!err(errors, spec.key)} />
            {!!rec[spec.key] && (
              <button type="button" className="adm-btn-ghost px-2 text-xs" onClick={() => set(spec.key, null)}>
                Clear
              </button>
            )}
          </div>
        </Field>
      );
    case 'datetime': {
      const iso = rec[spec.key] as string | null;
      const local = iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      return (
        <Field label={<label htmlFor={id}>{spec.label}</label>} hint={spec.help} error={err(errors, spec.key)}>
          <Input id={id} type="datetime-local" value={local} onChange={(e) => set(spec.key, e.target.value ? new Date(e.target.value).toISOString() : null)} />
        </Field>
      );
    }
    case 'seo': {
      const seo = { title: '', description: '', image: '', noIndex: false, ...((rec.seo as object) ?? {}) } as { title: string; description: string; image: string; noIndex: boolean };
      const setSeo = (p: Partial<typeof seo>) => set('seo', { ...seo, ...p });
      return (
        <div className="space-y-3">
          <Field label={<span className="flex justify-between">SEO title <CharCount value={seo.title} max={70} recommended={60} /></span>} hint="Leave empty to use the name/title." error={errors['seo.title']}>
            <Input value={seo.title} maxLength={70} onChange={(e) => setSeo({ title: e.target.value })} />
          </Field>
          <Field label="Meta description" error={errors['seo.description']}>
            <CountedTextarea value={seo.description} max={170} onChange={(description) => setSeo({ description })} />
          </Field>
          <Field label="Share image" hint="Defaults to the cover image." error={errors['seo.image']}>
            <ImageField value={seo.image} onChange={(image) => setSeo({ image })} label="share image" />
          </Field>
          <Toggle checked={seo.noIndex} onChange={(noIndex) => setSeo({ noIndex })} label={<span className="text-xs">Hide from search engines</span>} />
        </div>
      );
    }
    case 'relationMulti':
      return (
        <Field label={spec.label} hint={spec.help}>
          <RelationMulti value={(rec[spec.key] as string[]) ?? []} onChange={(v) => set(spec.key, v)} collection={spec.collection} />
        </Field>
      );
    case 'relationSingle':
      return (
        <Field label={spec.label} hint={spec.help} error={err(errors, spec.key)}>
          <RelationSingle value={(rec[spec.key] as string | null) ?? null} onChange={(v) => set(spec.key, v)} collection={spec.collection} />
        </Field>
      );
    case 'video':
      return (
        <Field label={spec.label} hint={spec.help} error={err(errors, spec.key)}>
          <VideoField value={(rec[spec.key] as string) ?? ''} onChange={(v) => set(spec.key, v)} invalid={!!err(errors, spec.key)} />
        </Field>
      );
    case 'icon':
      return (
        <Field label={spec.label}>
          <IconPicker value={(rec[spec.key] as string) || 'sparkles'} onChange={(v) => set(spec.key, v)} />
        </Field>
      );
    case 'link':
      return (
        <Field label={spec.label} hint={spec.help} error={err(errors, spec.key)}>
          <LinkInput value={(rec[spec.key] as string) ?? ''} onChange={(v) => set(spec.key, v)} placeholder="https://…" />
        </Field>
      );
    case 'rating': {
      const v = (rec[spec.key] as number | null) ?? null;
      return (
        <Field label={spec.label}>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => set(spec.key, v === n ? null : n)} className="rounded p-0.5 hover:bg-adm-bg">
                <Star className={cn('h-5 w-5', v !== null && n <= v ? 'fill-adm-gold text-adm-gold' : 'text-adm-line')} />
              </button>
            ))}
            {v !== null && (
              <button type="button" className="ml-2 text-xs text-adm-muted hover:text-adm-ink" onClick={() => set(spec.key, null)}>
                No rating
              </button>
            )}
          </div>
        </Field>
      );
    }
    case 'pricing':
      return <PricingFields {...ctx} />;
    case 'addOns': {
      const list = (rec.addOns as AddOn[]) ?? [];
      const currency = (rec.currency as string) || 'INR';
      return (
        <Field label="Optional add-ons" hint="Extras clients can add. Leave the price empty to show “on request”.">
          <ListEditor<AddOn>
            items={list}
            onChange={(v) => set('addOns', v)}
            max={30}
            addLabel="Add add-on"
            empty="No add-ons."
            newItem={() => ({ name: '', description: '', priceMinor: null })}
            itemTitle={(a) => (
              <span>
                {a.name || <em className="font-normal text-adm-muted">New add-on</em>} <span className="font-normal text-adm-muted">· {a.priceMinor ? money(a.priceMinor, currency) : 'on request'}</span>
              </span>
            )}
            renderItem={(a, update, i) => (
              <>
                <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                  <div>
                    <span className="adm-label">Name</span>
                    <Input value={a.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} invalid={!!errors[`addOns.${i}.name`]} />
                  </div>
                  <div>
                    <span className="adm-label">Price (optional)</span>
                    <MoneyInput value={a.priceMinor} onChange={(v) => update({ priceMinor: v })} currency={currency} allowEmpty placeholder="On request" />
                  </div>
                </div>
                <div>
                  <span className="adm-label">Description</span>
                  <Input value={a.description} maxLength={300} onChange={(e) => update({ description: e.target.value })} />
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'socials': {
      const list = (rec.socials as { network: string; url: string }[]) ?? [];
      return (
        <ListEditor
          items={list}
          onChange={(v) => set('socials', v)}
          max={6}
          compact
          addLabel="Add profile"
          empty="No profiles."
          newItem={() => ({ network: 'instagram', url: 'https://' })}
          itemTitle={(x) => <span className="capitalize">{x.network}</span>}
          renderItem={(x, update, i) => (
            <>
              <Select value={x.network} onChange={(e) => update({ network: e.target.value })} options={['instagram', 'linkedin', 'x', 'facebook', 'youtube', 'pinterest', 'website'].map((n) => ({ value: n, label: n === 'x' ? 'X (Twitter)' : n[0].toUpperCase() + n.slice(1) }))} aria-label="Network" />
              <Input value={x.url} onChange={(e) => update({ url: e.target.value.trim() })} placeholder="https://" aria-label="Profile URL" invalid={!!errors[`socials.${i}.url`]} />
            </>
          )}
        />
      );
    }
    case 'beforeAfter': {
      const list = (rec.beforeAfter as { beforeUrl: string; afterUrl: string; caption: string }[]) ?? [];
      return (
        <Field label="Before & after (optional)" hint="Pairs of the empty venue and the finished design.">
          <ListEditor
            items={list}
            onChange={(v) => set('beforeAfter', v)}
            max={10}
            addLabel="Add before/after pair"
            empty="No pairs."
            newItem={() => ({ beforeUrl: '', afterUrl: '', caption: '' })}
            itemTitle={(p, i) => p.caption || `Pair ${i + 1}`}
            renderItem={(p, update) => (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="adm-label">Before</span>
                    <ImageField value={p.beforeUrl} onChange={(beforeUrl) => update({ beforeUrl })} aspect="aspect-[4/3]" label="before image" />
                  </div>
                  <div>
                    <span className="adm-label">After</span>
                    <ImageField value={p.afterUrl} onChange={(afterUrl) => update({ afterUrl })} aspect="aspect-[4/3]" label="after image" />
                  </div>
                </div>
                <div>
                  <span className="adm-label">Caption</span>
                  <Input value={p.caption} maxLength={160} onChange={(e) => update({ caption: e.target.value })} />
                </div>
              </>
            )}
          />
        </Field>
      );
    }
    case 'guard':
      return <GuardField spec={spec} {...ctx} />;
    default:
      return null;
  }
}

