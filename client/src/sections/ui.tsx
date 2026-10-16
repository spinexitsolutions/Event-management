import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight, Play } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Cta } from '@maison/shared';
import { ButtonLink } from '@/components/ui/Button';
import { Img } from '@/components/ui/Img';
import { cn } from '@/lib/cn';
import { money, pct } from '@/lib/format';
import type { PackageCard } from '@/lib/types';

/** Row of CMS buttons. */
export function Ctas({ ctas, className, size }: { ctas: Cta[] | undefined; className?: string; size?: 'sm' | 'md' }) {
  if (!ctas?.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-4', className)}>
      {ctas.map((c, i) => (
        <ButtonLink key={i} href={c.href} variant={c.variant} size={size}>
          {c.label}
        </ButtonLink>
      ))}
    </div>
  );
}

/** Subtle scroll parallax for large images. Static when the visitor prefers reduced motion. */
export function ParallaxImage({ src, alt, className, imgClassName, amount = 8, priority, sizes, width = 1600 }: { src: string; alt: string; className?: string; imgClassName?: string; amount?: number; priority?: boolean; sizes?: string; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${amount}%`, `${amount}%`]);
  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-surface', className)}>
      {reduce ? (
        <Img src={src} alt={alt} width={width} sizes={sizes} priority={priority} className={cn('h-full w-full object-cover', imgClassName)} fallbackClassName="h-full w-full" />
      ) : (
        <motion.div style={{ y }} className="absolute inset-[-10%_0]">
          <Img src={src} alt={alt} width={width} sizes={sizes} priority={priority} className={cn('h-full w-full object-cover', imgClassName)} fallbackClassName="h-full w-full" />
        </motion.div>
      )}
    </div>
  );
}

/** True below the given width (updates on resize). */
export function useIsSmall(px = 768) {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${px - 1}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${px - 1}px)`);
    const on = () => setSmall(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [px]);
  return small;
}

/* ───────────── Pricing (never invented: only what the package states) ───────────── */

export function packagePrice(p: Pick<PackageCard, 'pricingModel' | 'priceMinor' | 'currency'>): { label: string; amount: string | null } {
  if (p.pricingModel === 'FIXED' && p.priceMinor !== null) return { label: 'Package price', amount: money(p.priceMinor, p.currency) };
  if (p.pricingModel === 'STARTING_FROM' && p.priceMinor !== null) return { label: 'Starting from', amount: money(p.priceMinor, p.currency) };
  return { label: 'Price on request', amount: null };
}

export function discountText(p: Pick<PackageCard, 'discountBps' | 'discountLabel'>) {
  if (p.discountLabel) return p.discountLabel;
  if (p.discountBps > 0) return `${pct(p.discountBps)} off`;
  return '';
}

export function guestRange(min: number | null, max: number | null) {
  if (min && max) return `${min.toLocaleString()}–${max.toLocaleString()} guests`;
  if (min) return `From ${min.toLocaleString()} guests`;
  if (max) return `Up to ${max.toLocaleString()} guests`;
  return '';
}

export function PriceTag({ pkg, large, className }: { pkg: Pick<PackageCard, 'pricingModel' | 'priceMinor' | 'currency'>; large?: boolean; className?: string }) {
  const p = packagePrice(pkg);
  return (
    <div className={className}>
      <p className="text-[0.68rem] uppercase text-muted" style={{ letterSpacing: '0.24em' }}>
        {p.label}
      </p>
      {p.amount && <p className={cn('font-heading text-ink', large ? 't-h2 mt-2' : 't-h3 mt-1')}>{p.amount}</p>}
    </div>
  );
}

/* ───────────── Video helpers ───────────── */

/** Privacy-enhanced embed URL for YouTube/Vimeo, or null for direct video files. */
export function videoEmbedUrl(url: string, autoplay = true): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1${autoplay ? '&autoplay=1' : ''}`;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d{5,12})/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?dnt=1${autoplay ? '&autoplay=1' : ''}`;
  return null;
}

/** Poster with a play button; loads the player only on click (no third-party requests before consent to play). */
export function VideoPlayer({ url, poster, posterAlt, title, className }: { url: string; poster?: string; posterAlt?: string; title: string; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const embed = videoEmbedUrl(url);
  return (
    <div className={cn('relative aspect-video w-full overflow-hidden bg-black rounded-theme-img', className)}>
      {playing ? (
        embed ? (
          <iframe src={embed} title={title} className="absolute inset-0 h-full w-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen loading="lazy" />
        ) : (
          <video src={url} poster={poster || undefined} controls autoPlay playsInline className="absolute inset-0 h-full w-full object-contain">
            <track kind="captions" />
          </video>
        )
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 h-full w-full text-white" aria-label={`Play video: ${title}`}>
          <Img src={poster} alt={posterAlt || ''} width={1600} className="h-full w-full object-cover transition-transform duration-[1.6s] ease-lux group-hover:scale-[1.03]" fallbackClassName="h-full w-full" />
          <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/40" />
          <span className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 backdrop-blur-sm transition-transform duration-500 ease-lux group-hover:scale-110 md:h-24 md:w-24">
            <Play className="ml-1 h-7 w-7" strokeWidth={1.25} fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  );
}

/** Small underlined "view" link used under cards. */
export function ArrowLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[0.72rem] uppercase text-primary', className)} style={{ letterSpacing: '0.22em' }}>
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-500 ease-lux group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.5} />
    </span>
  );
}

/** Grid columns that keep 1–2 items from looking stranded in a 3-column layout. */
export function cardGrid(n: number, max: 3 | 4 = 3) {
  if (n === 1) return 'mx-auto max-w-xl';
  if (n === 2) return 'mx-auto max-w-5xl md:grid-cols-2';
  if (max === 4 && n >= 4) return 'sm:grid-cols-2 lg:grid-cols-4';
  return 'sm:grid-cols-2 lg:grid-cols-3';
}
