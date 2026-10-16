import { Check, MapPin, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Img } from '@/components/ui/Img';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { CategoryCard, PackageCard, PostCard, ProjectCard, ServiceCard, TestimonialCard, VenueCard } from '@/lib/types';
import { ArrowLink, discountText, guestRange, PriceTag } from './ui';

const meta = 'text-[0.68rem] uppercase text-muted';
const metaStyle = { letterSpacing: '0.22em' };

export function ProjectTile({ p, className, aspect = 'aspect-[4/5]', sizes }: { p: ProjectCard; className?: string; aspect?: string; sizes?: string }) {
  return (
    <Link to={`/portfolio/${p.slug}`} className={cn('group block', className)}>
      <div className={cn('relative overflow-hidden rounded-theme-img bg-surface', aspect)}>
        <Img src={p.coverImage} alt={p.coverAlt || p.title} width={900} sizes={sizes ?? '(max-width: 768px) 100vw, 33vw'} className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
        <span className="absolute bottom-5 left-5 translate-y-3 text-[0.7rem] uppercase text-white opacity-0 transition-all duration-700 ease-lux group-hover:translate-y-0 group-hover:opacity-100" style={metaStyle}>
          View the story
        </span>
      </div>
      <div className="mt-5">
        <p className={meta} style={metaStyle}>
          {[p.category?.name, p.city].filter(Boolean).join(' · ')}
        </p>
        <h3 className="t-h4 mt-2 font-heading transition-colors group-hover:text-primary">{p.title}</h3>
        {p.eventDate && <p className="mt-1 text-sm text-muted">{fmtDate(p.eventDate, { month: 'long', year: 'numeric' })}</p>}
      </div>
    </Link>
  );
}

export function CategoryTile({ c, className, sizes, tall }: { c: CategoryCard; className?: string; sizes?: string; tall?: boolean }) {
  return (
    <Link to={`/events/${c.slug}`} className={cn('group relative block overflow-hidden rounded-theme-img bg-surface text-white', className)}>
      <Img src={c.coverImage} alt={c.coverAlt || c.name} width={1000} sizes={sizes ?? '(max-width: 768px) 100vw, 40vw'} className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1.6s] ease-lux group-hover:scale-[1.06]" fallbackClassName="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent transition-opacity duration-700 group-hover:from-black/85" />
      <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
        <h3 className={cn('font-heading text-white', tall ? 't-h2' : 't-h3')}>{c.name}</h3>
        {c.tagline && (
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75 transition-all duration-700 ease-lux md:max-h-0 md:translate-y-2 md:overflow-hidden md:opacity-0 md:group-hover:max-h-24 md:group-hover:translate-y-0 md:group-hover:opacity-100">
            {c.tagline}
          </p>
        )}
        <span className="mt-4 inline-block h-px w-10 bg-white/70 transition-all duration-700 ease-lux group-hover:w-20" aria-hidden />
      </div>
    </Link>
  );
}

export function ServiceTile({ s, index }: { s: ServiceCard; index?: number }) {
  return (
    <Link to={`/services/${s.slug}`} className="group card flex h-full flex-col overflow-hidden">
      <div className="relative aspect-[3/2] overflow-hidden">
        <Img src={s.coverImage} alt={s.coverAlt || s.name} width={800} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <div className="flex items-center justify-between">
          <Icon name={s.icon} className="h-7 w-7 text-primary" />
          {index !== undefined && <span className="font-heading text-sm text-muted">{String(index + 1).padStart(2, '0')}</span>}
        </div>
        <h3 className="t-h4 mt-5 font-heading">{s.name}</h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{s.summary}</p>
        <ArrowLink className="mt-6">Discover</ArrowLink>
      </div>
    </Link>
  );
}

export function PackageTile({ p, className, showFeatured = true }: { p: PackageCard; className?: string; showFeatured?: boolean }) {
  const featured = p.featured && showFeatured;
  const discount = discountText(p);
  const guests = guestRange(p.guestMin, p.guestMax);
  return (
    <article className={cn('card group relative flex h-full flex-col overflow-hidden', featured && 'ring-1 ring-primary/60', className)}>
      <Link to={`/packages/${p.slug}`} className="relative block aspect-[16/10] overflow-hidden" tabIndex={-1} aria-hidden>
        <Img src={p.coverImage} alt="" width={800} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
        {(featured || discount) && (
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            {featured && (
              <span className="bg-primary px-3 py-1 text-[0.62rem] uppercase text-on-primary" style={metaStyle}>
                Most loved
              </span>
            )}
            {discount && (
              <span className="bg-black/70 px-3 py-1 text-[0.62rem] uppercase text-white backdrop-blur" style={metaStyle}>
                {discount}
              </span>
            )}
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-6 md:p-8">
        <p className="eyebrow">{p.tier || p.category?.name || 'Package'}</p>
        <h3 className="t-h3 mt-3 font-heading">
          <Link to={`/packages/${p.slug}`} className="after:absolute after:inset-0 hover:text-primary">
            {p.name}
          </Link>
        </h3>
        {p.summary && <p className="mt-3 text-sm leading-relaxed text-muted">{p.summary}</p>}
        <PriceTag pkg={p} className="mt-6 border-t border-line pt-6" />
        {guests && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Users className="h-4 w-4" strokeWidth={1.25} /> {guests}
          </p>
        )}
        {p.inclusions.length > 0 && (
          <ul className="mt-6 flex-1 space-y-2.5 text-sm">
            {p.inclusions.slice(0, 5).map((inc, i) => (
              <li key={i} className="flex gap-3">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} />
                <span className="text-ink/85">{inc}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link to={`/inquire?package=${p.id}`} className="btn btn-primary btn-sm">
            Inquire
          </Link>
          <Link to={`/packages/${p.slug}`} className="btn btn-ghost btn-sm">
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

export function VenueTile({ v, className }: { v: VenueCard; className?: string }) {
  const cap = v.capacityMax ? `${v.capacityMin ? `${v.capacityMin.toLocaleString()}–` : 'Up to '}${v.capacityMax.toLocaleString()} guests` : '';
  return (
    <Link to={`/venues/${v.slug}`} className={cn('group block', className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-theme-img bg-surface">
        <Img src={v.coverImage} alt={v.name} width={800} sizes="(max-width: 768px) 100vw, 25vw" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
      </div>
      <p className="mt-5 flex items-center gap-1.5 text-[0.68rem] uppercase text-muted" style={metaStyle}>
        <MapPin className="h-3 w-3" /> {[v.city, v.region].filter(Boolean).join(', ')}
      </p>
      <h3 className="t-h4 mt-2 font-heading transition-colors group-hover:text-primary">{v.name}</h3>
      {cap && <p className="mt-1 text-sm text-muted">{cap}</p>}
    </Link>
  );
}

export function PostTile({ p, large }: { p: PostCard; large?: boolean }) {
  return (
    <Link to={`/journal/${p.slug}`} className="group block">
      <div className={cn('relative overflow-hidden rounded-theme-img bg-surface', large ? 'aspect-[16/10]' : 'aspect-[4/3]')}>
        <Img src={p.coverImage} alt={p.coverAlt || p.title} width={900} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
      </div>
      <p className={cn(meta, 'mt-5')} style={metaStyle}>
        {fmtDate(p.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' })}
        {p.kind === 'NEWS' ? ' · News' : ''}
      </p>
      <h3 className={cn('mt-2 font-heading transition-colors group-hover:text-primary', large ? 't-h3' : 't-h4')}>{p.title}</h3>
      {p.excerpt && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{p.excerpt}</p>}
    </Link>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <p className="text-primary" aria-label={`Rated ${rating} out of 5`}>
      {'★'.repeat(Math.round(rating))}
      <span className="opacity-25">{'★'.repeat(5 - Math.round(rating))}</span>
    </p>
  );
}

export function TestimonialTile({ t }: { t: TestimonialCard }) {
  return (
    <figure className="card flex h-full flex-col p-8 md:p-10">
      <span className="font-heading text-6xl leading-none text-primary" aria-hidden>
        “
      </span>
      <blockquote className="mt-2 flex-1 font-heading text-xl leading-relaxed">{t.quote}</blockquote>
      <figcaption className="mt-8 flex items-center gap-4 border-t border-line pt-6">
        {t.photoUrl && <Img src={t.photoUrl} alt="" width={120} className="h-12 w-12 rounded-full object-cover" fallbackClassName="h-12 w-12 rounded-full" />}
        <div>
          <p className="font-medium">{t.clientName}</p>
          {t.eventLabel && <p className="text-sm text-muted">{t.eventLabel}</p>}
        </div>
        <div className="ml-auto text-sm">
          <Stars rating={t.rating} />
        </div>
      </figcaption>
    </figure>
  );
}
