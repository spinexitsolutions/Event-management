import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Expand } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Img } from '@/components/ui/Img';
import { Lightbox } from '@/components/ui/Lightbox';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { CategoryCard, GalleryImage, PackageCard, ProjectCard, ServiceCard, VenueCard } from '@/lib/types';
import { CategoryTile, PackageTile, ProjectTile, ServiceTile, VenueTile } from './cards';
import { Carousel } from './Carousel';
import { PreviewHint, SectionHeader, SectionShell } from './Shell';
import { asList, type SectionRenderProps } from './types';
import { ArrowLink, cardGrid, Ctas, discountText, packagePrice } from './ui';

const lvl = (i: number) => (i === 0 ? 1 : 2);
const empty = (preview: boolean | undefined, id: string, what: string, data?: unknown) =>
  preview && data === undefined ? (
    <PreviewHint preview id={id} title={`Live ${what} load after saving`} body={`This section shows your published ${what}. Save the draft to load them into the preview.`} />
  ) : (
    <PreviewHint preview={preview} id={id} title={`No ${what} to show yet`} body={`Publish ${what} in the admin and they will appear here. This section is hidden on the live site until then.`} />
  );

/* ───────────── Categories ───────────── */

function mosaicSpan(i: number, n: number) {
  const k = i % 5;
  const last = i === n - 1;
  if (k === 0) return n - i === 1 ? 'md:col-span-6 md:row-span-2' : 'md:col-span-4 md:row-span-2';
  if (k === 1) return last ? 'md:col-span-2 md:row-span-2' : 'md:col-span-2';
  if (k === 2) return 'md:col-span-2';
  if (k === 3) return last ? 'md:col-span-6' : 'md:col-span-3';
  return 'md:col-span-3';
}

export function CategoriesSection({ section, data, index, preview }: SectionRenderProps<'categories'>) {
  const p = section.props;
  const items = asList<CategoryCard>(data);
  if (!items.length) return empty(preview, section.id, 'event categories', data);
  const aside = (
    <Link to="/events" className="group">
      <ArrowLink>All occasions</ArrowLink>
    </Link>
  );
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={aside} />
        {p.variant === 'carousel' ? (
          <Carousel label={p.heading || 'Event categories'} per={[1.15, 2.2, 3.2]}>
            {items.map((c) => (
              <CategoryTile key={c.id} c={c} className="h-[440px] md:h-[520px]" />
            ))}
          </Carousel>
        ) : p.variant === 'grid' ? (
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <motion.div key={c.id} variants={staggerItem}>
                <CategoryTile c={c} className="aspect-[4/5]" />
              </motion.div>
            ))}
          </Stagger>
        ) : (
          <Stagger className="grid auto-rows-[340px] gap-4 md:auto-rows-[300px] md:grid-cols-6 lg:auto-rows-[320px]">
            {items.map((c, i) => (
              <motion.div key={c.id} variants={staggerItem} className={mosaicSpan(i, items.length)}>
                <CategoryTile c={c} className="h-full" tall={i % 5 === 0} sizes={i % 5 === 0 ? '(max-width: 768px) 100vw, 66vw' : '(max-width: 768px) 100vw, 33vw'} />
              </motion.div>
            ))}
          </Stagger>
        )}
      </div>
    </SectionShell>
  );
}

/* ───────────── Featured projects ───────────── */

function EditorialProject({ p, i }: { p: ProjectCard; i: number }) {
  const reduce = useReducedMotion();
  const flip = i % 2 === 1;
  return (
    <article className="group grid items-center gap-8 md:grid-cols-12 md:gap-12">
      <Link to={`/portfolio/${p.slug}`} className={cn('relative block overflow-hidden rounded-theme-img md:col-span-7', flip && 'md:order-2 md:col-start-6')} aria-label={p.title}>
        <motion.div
          initial={reduce ? false : { clipPath: 'inset(12% 8% 12% 8%)', opacity: 0.4 }}
          whileInView={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
          viewport={{ once: true, margin: '0px 0px -15% 0px' }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          className="aspect-[4/3] overflow-hidden bg-surface md:aspect-[16/11]"
        >
          <Img src={p.coverImage} alt={p.coverAlt || p.title} width={1400} sizes="(max-width: 768px) 100vw, 58vw" className="h-full w-full object-cover transition-transform duration-[1.8s] ease-lux group-hover:scale-[1.06]" fallbackClassName="h-full w-full" />
        </motion.div>
        <span className="absolute right-5 top-5 flex h-14 w-14 scale-75 items-center justify-center rounded-full bg-primary text-on-primary opacity-0 transition-all duration-700 ease-lux group-hover:scale-100 group-hover:opacity-100" aria-hidden>
          <ArrowUpRight className="h-5 w-5" strokeWidth={1.5} />
        </span>
      </Link>
      <Reveal className={cn('md:col-span-5', flip ? 'md:order-1 md:col-start-1 md:pr-6' : 'md:pl-6')}>
        <span className="font-heading text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
        <p className="eyebrow mt-6">{[p.category?.name, p.city].filter(Boolean).join(' · ')}</p>
        <h3 className="t-h2 mt-4 font-heading">
          <Link to={`/portfolio/${p.slug}`} className="transition-colors hover:text-primary">
            {p.title}
          </Link>
        </h3>
        {p.summary && <p className="mt-5 max-w-md leading-relaxed text-muted">{p.summary}</p>}
        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-sm">
          {p.venueName && (
            <div>
              <dt className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
                Venue
              </dt>
              <dd className="mt-1">{p.venueName}</dd>
            </div>
          )}
          {p.eventDate && (
            <div>
              <dt className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
                Date
              </dt>
              <dd className="mt-1">{fmtDate(p.eventDate, { month: 'long', year: 'numeric' })}</dd>
            </div>
          )}
        </dl>
        <Link to={`/portfolio/${p.slug}`} className="group/l mt-10 inline-block">
          <ArrowLink>View the story</ArrowLink>
        </Link>
      </Reveal>
    </article>
  );
}

export function FeaturedProjectsSection({ section, data, index, preview }: SectionRenderProps<'featuredProjects'>) {
  const p = section.props;
  const items = asList<ProjectCard>(data);
  if (!items.length) return empty(preview, section.id, 'portfolio projects', data);
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={p.cta && p.variant !== 'editorial' ? <Ctas ctas={[p.cta]} size="sm" /> : undefined} />
        {p.variant === 'editorial' ? (
          <div className="space-y-24 md:space-y-36">
            {items.map((pr, i) => (
              <EditorialProject key={pr.id} p={pr} i={i} />
            ))}
          </div>
        ) : p.variant === 'carousel' ? (
          <Carousel label={p.heading || 'Projects'} per={[1.1, 2.1, 3]}>
            {items.map((pr) => (
              <ProjectTile key={pr.id} p={pr} />
            ))}
          </Carousel>
        ) : (
          <Stagger className={cn('grid gap-x-8 gap-y-14 sm:grid-cols-2', items.length % 3 === 0 && 'lg:grid-cols-3')}>
            {items.map((pr) => (
              <motion.div key={pr.id} variants={staggerItem}>
                <ProjectTile p={pr} aspect={items.length % 3 === 0 ? 'aspect-[4/5]' : 'aspect-[16/11]'} />
              </motion.div>
            ))}
          </Stagger>
        )}
        {p.cta && p.variant === 'editorial' && (
          <Reveal className="mt-24 flex justify-center">
            <Ctas ctas={[p.cta]} />
          </Reveal>
        )}
      </div>
    </SectionShell>
  );
}

/* ───────────── Services ───────────── */

export function ServicesSection({ section, data, index, preview }: SectionRenderProps<'services'>) {
  const p = section.props;
  const items = asList<ServiceCard>(data);
  if (!items.length) return empty(preview, section.id, 'services', data);
  const aside = (
    <Link to="/services" className="group">
      <ArrowLink>All services</ArrowLink>
    </Link>
  );
  if (p.variant === 'list') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} aside={aside} />
          <ul className="border-t border-line">
            {items.map((s, i) => (
              <Reveal as="li" key={s.id} delay={Math.min(i * 0.04, 0.3)} className="border-b border-line">
                <Link to={`/services/${s.slug}`} className="group grid items-center gap-4 py-8 md:grid-cols-[5rem_1fr_1.2fr_auto] md:gap-10 md:py-10">
                  <span className="font-heading text-sm text-muted">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="t-h3 font-heading transition-all duration-700 ease-lux group-hover:translate-x-2 group-hover:text-primary">{s.name}</h3>
                  <p className="text-sm leading-relaxed text-muted">{s.summary}</p>
                  <div className="hidden items-center gap-6 md:flex">
                    <div className="h-20 w-0 overflow-hidden rounded-theme-img transition-all duration-700 ease-lux group-hover:w-28">
                      <Img src={s.coverImage} alt="" width={240} className="h-full w-28 max-w-none object-cover" fallbackClassName="h-full w-28" />
                    </div>
                    <ArrowUpRight className="h-5 w-5 text-primary transition-transform duration-500 group-hover:-translate-y-1 group-hover:translate-x-1" strokeWidth={1.25} />
                  </div>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </SectionShell>
    );
  }
  if (p.variant === 'compact') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} aside={aside} />
          <Stagger className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((s) => (
              <motion.div key={s.id} variants={staggerItem}>
                <Link to={`/services/${s.slug}`} className="group flex gap-5">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line transition-colors duration-500 group-hover:border-primary">
                    <Icon name={s.icon} className="h-6 w-6 text-primary" />
                  </span>
                  <span>
                    <span className="t-h4 block font-heading transition-colors group-hover:text-primary">{s.name}</span>
                    <span className="mt-2 line-clamp-3 block text-sm leading-relaxed text-muted">{s.summary}</span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </Stagger>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={aside} />
        <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s, i) => (
            <motion.div key={s.id} variants={staggerItem} className="h-full">
              <ServiceTile s={s} index={i} />
            </motion.div>
          ))}
        </Stagger>
      </div>
    </SectionShell>
  );
}

/* ───────────── Gallery ───────────── */

export function GalleryGrid({ images, variant, label }: { images: GalleryImage[]; variant: 'masonry' | 'grid' | 'carousel'; label: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const tile = (img: GalleryImage, i: number, cls: string, imgCls: string) => (
    <button type="button" onClick={() => setOpen(i)} className={cn('group relative block w-full overflow-hidden rounded-theme-img bg-surface text-left', cls)} aria-label={`Open image: ${img.alt || img.caption || i + 1}`}>
      <Img src={img.url} alt={img.alt} width={900} sizes="(max-width: 768px) 50vw, 33vw" className={cn('w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]', imgCls)} fallbackClassName={cn('w-full', imgCls)} />
      <span className="absolute inset-0 bg-black/0 transition-colors duration-500 group-hover:bg-black/30" />
      <span className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        <span className="truncate">{img.caption}</span>
        <Expand className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      </span>
    </button>
  );
  const ratios = ['aspect-[4/5]', 'aspect-[3/2]', 'aspect-square', 'aspect-[3/4]', 'aspect-[4/3]'];
  return (
    <>
      {variant === 'carousel' ? (
        <Carousel label={label} per={[1.15, 2.2, 3.1]} gap={16}>
          {images.map((img, i) => tile(img, i, '', 'aspect-[4/5]'))}
        </Carousel>
      ) : variant === 'grid' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">{images.map((img, i) => tile(img, i, '', 'aspect-square'))}</div>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 md:gap-4 [&>*]:mb-3 md:[&>*]:mb-4">
          {images.map((img, i) => (
            <Reveal key={i} delay={(i % 3) * 0.08} className="break-inside-avoid">
              {tile(img, i, '', ratios[i % ratios.length])}
            </Reveal>
          ))}
        </div>
      )}
      <Lightbox images={images} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
    </>
  );
}

export function GallerySection({ section, data, index, preview }: SectionRenderProps<'gallery'>) {
  const p = section.props;
  const images: GalleryImage[] = p.source === 'portfolio' ? asList<GalleryImage>(data) : p.images.filter((i) => i.url).map((i) => ({ url: i.url, alt: i.alt, caption: i.caption }));
  if (!images.length) return empty(preview, section.id, 'gallery images', p.source === 'portfolio' ? data : []);
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} />
        <GalleryGrid images={images} variant={p.variant as 'masonry' | 'grid' | 'carousel'} label={p.heading || 'Gallery'} />
      </div>
    </SectionShell>
  );
}

/* ───────────── Packages ───────────── */

export function PackagesSection({ section, data, index, preview }: SectionRenderProps<'packages'>) {
  const p = section.props;
  const items = asList<PackageCard>(data);
  if (!items.length) return empty(preview, section.id, 'packages', data);
  const aside = (
    <Link to="/packages" className="group">
      <ArrowLink>All packages</ArrowLink>
    </Link>
  );
  if (p.variant === 'list') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} aside={aside} />
          <ul className="border-t border-line">
            {items.map((pk) => {
              const price = packagePrice(pk);
              const disc = discountText(pk);
              return (
                <Reveal as="li" key={pk.id} className="border-b border-line">
                  <div className="grid gap-6 py-10 md:grid-cols-[1.2fr_1fr_auto] md:items-center md:gap-12">
                    <div>
                      <p className="eyebrow">{pk.tier || pk.category?.name || 'Package'}</p>
                      <h3 className="t-h3 mt-2 font-heading">
                        <Link to={`/packages/${pk.slug}`} className="hover:text-primary">
                          {pk.name}
                        </Link>
                      </h3>
                      {pk.summary && <p className="mt-2 max-w-lg text-sm text-muted">{pk.summary}</p>}
                    </div>
                    <div>
                      <p className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
                        {price.label}
                      </p>
                      {price.amount && <p className="t-h3 mt-1 font-heading">{price.amount}</p>}
                      {disc && <p className="mt-1 text-xs text-primary">{disc}</p>}
                    </div>
                    <div className="flex gap-4">
                      <Link to={`/inquire?package=${pk.id}`} className="btn btn-primary btn-sm">
                        Inquire
                      </Link>
                      <Link to={`/packages/${pk.slug}`} className="btn btn-secondary btn-sm">
                        Details
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={aside} />
        <Stagger className={cn('grid gap-6', cardGrid(items.length))}>
          {items.map((pk) => (
            <motion.div key={pk.id} variants={staggerItem} className="h-full">
              <PackageTile p={pk} showFeatured={items.some((i) => !i.featured)} />
            </motion.div>
          ))}
        </Stagger>
        <p className="mt-10 text-center text-xs text-muted">Prices are indicative starting points. Every event is tailored in a personalised proposal.</p>
      </div>
    </SectionShell>
  );
}

/* ───────────── Venues ───────────── */

export function VenuesSection({ section, data, index, preview }: SectionRenderProps<'venues'>) {
  const p = section.props;
  const items = asList<VenueCard>(data);
  if (!items.length) return empty(preview, section.id, 'venues', data);
  const aside = (
    <Link to="/venues" className="group">
      <ArrowLink>All venues</ArrowLink>
    </Link>
  );
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} aside={aside} />
        {p.variant === 'carousel' ? (
          <Carousel label={p.heading || 'Venues'} per={[1.2, 2.3, 3.4]}>
            {items.map((v) => (
              <VenueTile key={v.id} v={v} />
            ))}
          </Carousel>
        ) : (
          <Stagger className={cn('grid gap-x-6 gap-y-12', cardGrid(items.length, 4))}>
            {items.map((v) => (
              <motion.div key={v.id} variants={staggerItem}>
                <VenueTile v={v} />
              </motion.div>
            ))}
          </Stagger>
        )}
      </div>
    </SectionShell>
  );
}

/* ───────────── Spotlight helper for testimonials ───────────── */

export function Spotlight<T extends { id: string }>({ items, render, names }: { items: T[]; render: (t: T) => React.ReactNode; names: (t: T) => string }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <AnimatePresence mode="wait">
        <motion.div key={items[i].id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} aria-live="polite">
          {render(items[i])}
        </motion.div>
      </AnimatePresence>
      {items.length > 1 && (
        <div className="mt-12 flex flex-wrap justify-center gap-x-8 gap-y-3" role="tablist" aria-label="Choose a testimonial">
          {items.map((t, k) => (
            <button key={t.id} role="tab" aria-selected={k === i} onClick={() => setI(k)} className={cn('border-b pb-1 text-[0.72rem] uppercase transition', k === i ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink')} style={{ letterSpacing: '0.2em' }}>
              {names(t)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
