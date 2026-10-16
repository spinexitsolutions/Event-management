import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Img } from '@/components/ui/Img';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import type { FaqItem, LogoItem, PostCard, TeamCard, TestimonialCard } from '@/lib/types';
import { PostTile, Stars, TestimonialTile } from './cards';
import { Carousel } from './Carousel';
import { PreviewHint, SectionHeader, SectionShell } from './Shell';
import { Spotlight } from './showcase';
import { asList, type SectionRenderProps } from './types';
import { ArrowLink } from './ui';
import { Link } from 'react-router-dom';

const lvl = (i: number) => (i === 0 ? 1 : 2);
const empty = (preview: boolean | undefined, id: string, what: string, data?: unknown) =>
  preview && data === undefined ? (
    <PreviewHint preview id={id} title={`Live ${what} load after saving`} body={`This section shows your published ${what}. Save the draft to load them into the preview.`} />
  ) : (
    <PreviewHint preview={preview} id={id} title={`No ${what} to show yet`} body={`Publish ${what} in the admin and they will appear here. This section is hidden on the live site until then.`} />
  );

/* ───────────── Testimonials ───────────── */

export function TestimonialsSection({ section, data, index, preview }: SectionRenderProps<'testimonials'>) {
  const p = section.props;
  const items = asList<TestimonialCard>(data);
  if (!items.length) return empty(preview, section.id, 'approved testimonials', data);
  if (p.variant === 'spotlight') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} align="center" />
          <div className="mx-auto max-w-4xl text-center">
            <Spotlight
              items={items}
              names={(t) => t.clientName}
              render={(t) => (
                <figure>
                  <span className="block font-heading text-7xl leading-none text-primary" aria-hidden>
                    “
                  </span>
                  <blockquote className="t-h2 mt-2 text-balance font-heading italic">{t.quote}</blockquote>
                  <figcaption className="mt-10 flex flex-col items-center gap-3">
                    {t.photoUrl && <Img src={t.photoUrl} alt="" width={160} className="h-16 w-16 rounded-full object-cover" fallbackClassName="h-16 w-16 rounded-full" />}
                    <span className="font-medium">{t.clientName}</span>
                    {t.eventLabel && <span className="text-sm text-muted">{t.eventLabel}</span>}
                    <Stars rating={t.rating} />
                  </figcaption>
                </figure>
              )}
            />
          </div>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} />
        {p.variant === 'grid' || items.length < 3 ? (
          <Stagger className={cn('grid gap-6 md:grid-cols-2', items.length >= 3 && 'lg:grid-cols-3')}>
            {items.map((t) => (
              <motion.div key={t.id} variants={staggerItem} className="h-full">
                <TestimonialTile t={t} />
              </motion.div>
            ))}
          </Stagger>
        ) : (
          <Carousel label={p.heading || 'Testimonials'} per={[1.05, 1.6, 2.4]} autoplay={8000} loop>
            {items.map((t) => (
              <TestimonialTile key={t.id} t={t} />
            ))}
          </Carousel>
        )}
      </div>
    </SectionShell>
  );
}

/* ───────────── Logos ───────────── */

function Logo({ l, grayscale }: { l: LogoItem; grayscale: boolean }) {
  const img = <img src={l.logoUrl} alt={l.name} loading="lazy" className={cn('max-h-12 w-auto max-w-[150px] object-contain transition duration-500', grayscale && 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0')} />;
  return l.href ? (
    <a href={l.href} target="_blank" rel="noopener noreferrer" className="flex h-20 items-center justify-center px-8">
      {img}
    </a>
  ) : (
    <div className="flex h-20 items-center justify-center px-8">{img}</div>
  );
}

export function LogosSection({ section, data, index, preview }: SectionRenderProps<'logos'>) {
  const p = section.props;
  const items = asList<LogoItem>(data).filter((l) => l.logoUrl);
  const reduce = useReducedMotion();
  if (!items.length) return empty(preview, section.id, 'authorised client logos', data);
  const marquee = p.variant === 'marquee' && !reduce && items.length > 3;
  return (
    <SectionShell id={section.id} props={p} className="!py-[calc(var(--section-y)*0.6)]">
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} align="center" className="!mb-10" />
      </div>
      {marquee ? (
        <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
            {[...items, ...items].map((l, i) => (
              <div key={i} aria-hidden={i >= items.length || undefined}>
                <Logo l={l} grayscale={p.grayscale} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="container-site">
          <div className="grid grid-cols-2 items-center gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {items.map((l) => (
              <Logo key={l.id} l={l} grayscale={p.grayscale} />
            ))}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

/* ───────────── FAQ ───────────── */

function FaqRow({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  const id = useId();
  return (
    <div className="border-b border-line">
      <h3>
        <button type="button" id={`${id}-q`} aria-expanded={open} aria-controls={`${id}-a`} onClick={onToggle} className="group flex w-full items-start justify-between gap-6 py-6 text-left">
          <span className="font-heading text-[1.3rem] leading-snug transition-colors group-hover:text-primary">{q}</span>
          <span className={cn('mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line transition-all duration-500 ease-lux', open && 'rotate-45 border-primary text-primary')}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <p className="max-w-2xl whitespace-pre-line pb-7 pr-12 leading-relaxed text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Accessible accordion (one open at a time). Also used on category/service pages. */
export function FaqList({ items, columns = 1, className }: { items: { question: string; answer: string }[]; columns?: 1 | 2; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  const half = Math.ceil(items.length / 2);
  const cols = columns === 2 ? [items.slice(0, half), items.slice(half)] : [items];
  return (
    <div className={cn('grid gap-x-16', columns === 2 && 'lg:grid-cols-2', className)}>
      {cols.map((col, c) => (
        <div key={c} className={cn('border-t border-line', c === 1 && 'max-lg:border-t-0')}>
          {col.map((f, i) => {
            const k = c * half + i;
            return <FaqRow key={k} q={f.question} a={f.answer} open={open === k} onToggle={() => setOpen(open === k ? null : k)} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) };
}

export function FaqSection({ section, data, index, preview }: SectionRenderProps<'faq'>) {
  const p = section.props;
  const items = asList<FaqItem>(data);
  if (!items.length) return empty(preview, section.id, 'FAQs', data);
  if (p.variant === 'two-column') {
    return (
      <SectionShell id={section.id} props={p}>
        {!preview && (
          <Helmet>
            <script type="application/ld+json">{JSON.stringify(faqJsonLd(items))}</script>
          </Helmet>
        )}
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} />
          <FaqList items={items} columns={2} />
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      {!preview && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(faqJsonLd(items))}</script>
        </Helmet>
      )}
      <div className="container-site grid grid-cols-1 gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <SectionHeader props={p} level={lvl(index)} className="lg:sticky lg:top-32" />
        </div>
        <Reveal className="lg:col-span-7 lg:col-start-6">
          <FaqList items={items} />
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* ───────────── Team ───────────── */

export function TeamSection({ section, data, index, preview }: SectionRenderProps<'team'>) {
  const p = section.props;
  const items = asList<TeamCard>(data);
  if (!items.length) return empty(preview, section.id, 'team members', data);
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} />
        <Stagger className="grid grid-cols-2 gap-x-5 gap-y-12 md:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <motion.figure key={m.id} variants={staggerItem} className="group">
              <div className="relative aspect-[3/4] overflow-hidden rounded-theme-img bg-surface">
                <Img src={m.photoUrl} alt={m.name} width={700} sizes="(max-width: 768px) 50vw, 25vw" className="h-full w-full object-cover grayscale-[35%] transition duration-[1.2s] ease-lux group-hover:scale-[1.04] group-hover:grayscale-0" fallbackClassName="h-full w-full" />
                {m.bio && (
                  <div className="absolute inset-0 hidden items-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-5 opacity-0 transition-opacity duration-700 group-hover:opacity-100 md:flex">
                    <p className="line-clamp-6 text-sm leading-relaxed text-white/90">{m.bio}</p>
                  </div>
                )}
              </div>
              <figcaption className="mt-5">
                <p className="t-h4 font-heading">{m.name}</p>
                {m.title && (
                  <p className="mt-1 text-[0.68rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
                    {m.title}
                  </p>
                )}
                {m.socials?.length > 0 && (
                  <div className="mt-3 flex gap-4 text-xs">
                    {m.socials.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="capitalize text-muted hover:text-primary">
                        {s.network}
                      </a>
                    ))}
                  </div>
                )}
              </figcaption>
            </motion.figure>
          ))}
        </Stagger>
      </div>
    </SectionShell>
  );
}

/* ───────────── Blog ───────────── */

export function BlogSection({ section, data, index, preview }: SectionRenderProps<'blog'>) {
  const p = section.props;
  const items = asList<PostCard>(data);
  if (!items.length) return empty(preview, section.id, 'journal articles', data);
  const aside = (
    <Link to="/journal" className="group">
      <ArrowLink>The journal</ArrowLink>
    </Link>
  );
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={aside} />
        <Stagger className={cn('grid gap-x-8 gap-y-14 md:grid-cols-2', items.length % 3 === 0 && 'lg:grid-cols-3')}>
          {items.map((post) => (
            <motion.div key={post.id} variants={staggerItem}>
              <PostTile p={post} />
            </motion.div>
          ))}
        </Stagger>
      </div>
    </SectionShell>
  );
}
