import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { HeaderSpacer, useTransparentHeader } from '@/components/layout/PublicLayout';
import { ButtonLink } from '@/components/ui/Button';
import { Img } from '@/components/ui/Img';
import { Seo } from '@/components/ui/Seo';
import { ErrorState, Skeleton } from '@/components/ui/States';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ON_IMAGE_VARS } from '@/sections/Shell';

export const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

export function Breadcrumbs({ items, light }: { items: { label: string; href?: string }[]; light?: boolean }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className={cn('flex flex-wrap items-center gap-1.5 text-[0.68rem] uppercase', light ? 'text-white/70' : 'text-muted')} style={{ letterSpacing: '0.2em' }}>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {it.href ? (
              <Link to={it.href} className={light ? 'hover:text-white' : 'hover:text-primary'}>
                {it.label}
              </Link>
            ) : (
              <span aria-current="page">{it.label}</span>
            )}
            {i < items.length - 1 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Full-bleed photographic hero for detail pages (header sits transparently over it). */
export function ImageHero({ image, alt, eyebrow, title, subtitle, crumbs, children, height = 'tall' }: { image: string; alt: string; eyebrow?: string; title: string; subtitle?: string; crumbs?: { label: string; href?: string }[]; children?: ReactNode; height?: 'tall' | 'medium' }) {
  useTransparentHeader(true);
  const reduce = useReducedMotion();
  return (
    <section className={cn('on-image relative isolate flex items-end overflow-hidden bg-black text-white', height === 'tall' ? 'min-h-[560px] h-[88svh]' : 'min-h-[480px] h-[68svh]')} style={ON_IMAGE_VARS}>
      <motion.div className="absolute inset-0 -z-10" initial={reduce ? false : { scale: 1.08 }} animate={{ scale: 1 }} transition={{ duration: 2.4, ease: [0.22, 1, 0.36, 1] }}>
        <Img src={image} alt={alt} priority width={2400} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />
      <div className="container-site pb-16 md:pb-20">
        <motion.div initial={reduce ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }} className="max-w-4xl">
          {crumbs && (
            <div className="mb-8">
              <Breadcrumbs items={crumbs} light />
            </div>
          )}
          {eyebrow && (
            <p className="mb-5 flex items-center gap-4 text-[0.72rem] uppercase text-white/85" style={{ letterSpacing: '0.32em' }}>
              <span className="h-px w-10 bg-primary" aria-hidden />
              {eyebrow}
            </p>
          )}
          <h1 className="t-display text-balance text-white">{title}</h1>
          {subtitle && <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80">{subtitle}</p>}
          {children}
        </motion.div>
      </div>
    </section>
  );
}

/** Typographic page header for index pages (no image). */
export function PageHeader({ eyebrow, title, intro, crumbs, children, className }: { eyebrow?: string; title: string; intro?: string; crumbs?: { label: string; href?: string }[]; children?: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <>
      <HeaderSpacer />
      <header className={cn('container-site pb-12 pt-16 md:pb-16 md:pt-24', className)}>
        <motion.div initial={reduce ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}>
          {crumbs && (
            <div className="mb-10">
              <Breadcrumbs items={crumbs} />
            </div>
          )}
          {eyebrow && <p className="eyebrow mb-6">{eyebrow}</p>}
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <h1 className="t-display text-balance lg:col-span-8">{title}</h1>
            {intro && <p className="lead lg:col-span-4 lg:pb-3">{intro}</p>}
          </div>
          {children}
        </motion.div>
      </header>
    </>
  );
}

export function PageSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {hero ? <div className="h-[80svh] min-h-[480px] animate-pulse bg-surface" /> : <HeaderSpacer />}
      <div className="container-site space-y-6 py-20">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-14 w-3/4 max-w-2xl" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-6 pt-10 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 6, aspect = 'aspect-[4/5]', cols = 'sm:grid-cols-2 lg:grid-cols-3' }: { count?: number; aspect?: string; cols?: string }) {
  return (
    <div className={cn('grid gap-x-8 gap-y-14', cols)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <Skeleton className={cn('w-full', aspect)} />
          <Skeleton className="mt-5 h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function PageError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <>
      <HeaderSpacer />
      <div className="container-site py-24">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    </>
  );
}

export function NotFoundView({ title = 'This page has slipped away', body = 'The page you were looking for may have moved, or perhaps it was never here. Let us guide you somewhere beautiful.' }: { title?: string; body?: string }) {
  return (
    <>
      <Seo title="Page not found" noIndex />
      <HeaderSpacer />
      <section className="container-site flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
        <p className="font-heading text-[clamp(6rem,18vw,13rem)] leading-none text-primary/25" aria-hidden>
          404
        </p>
        <p className="eyebrow -mt-4 mb-6">Page not found</p>
        <h1 className="t-h1 max-w-3xl text-balance">{title}</h1>
        <p className="lead mt-6 max-w-xl">{body}</p>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <ButtonLink href="/">Return home</ButtonLink>
          <ButtonLink href="/portfolio" variant="secondary">
            View our work
          </ButtonLink>
          <ButtonLink href="/inquire" variant="ghost">
            Plan an event
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

/** Closing inquiry band used at the end of detail pages. */
export function InquiryBand({ title, body, href, label = 'Begin your inquiry', image }: { title: string; body?: string; href: string; label?: string; image?: string }) {
  return (
    <section className={cn('relative isolate overflow-hidden', image ? 'on-image text-white' : 'bg-variant-contrast')} style={image ? ON_IMAGE_VARS : undefined}>
      {image && (
        <div className="absolute inset-0 -z-10">
          <Img src={image} alt="" width={2200} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
      )}
      <div className="container-site section text-center">
        <p className="eyebrow mb-6">Begin</p>
        <h2 className="t-h1 mx-auto max-w-3xl text-balance">{title}</h2>
        {body && <p className="lead mx-auto mt-6 max-w-xl">{body}</p>}
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <ButtonLink href={href}>{label}</ButtonLink>
          <ButtonLink href="/contact" variant="secondary">
            Speak to the studio
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

/** Small section heading used on detail pages. */
export function BlockTitle({ eyebrow, title, aside, className }: { eyebrow?: string; title: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-10 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between', className)}>
      <div>
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h2 className="t-h2">{title}</h2>
      </div>
      {aside}
    </div>
  );
}
