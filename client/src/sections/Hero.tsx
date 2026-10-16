import { motion, useReducedMotion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Img } from '@/components/ui/Img';
import { cn } from '@/lib/cn';
import type { SectionRenderProps } from './types';
import { ON_IMAGE_VARS } from './Shell';
import { Ctas, useIsSmall } from './ui';

type HeroProps = SectionRenderProps<'hero'>['section']['props'];

const ease = [0.22, 1, 0.36, 1] as const;

/** Headline revealed word by word (masked rise). */
function RevealHeadline({ text, as: H, className, delay = 0.25 }: { text: string; as: 'h1' | 'h2'; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <H className={className}>{text}</H>;
  const words = text.split(/\s+/);
  return (
    <H className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom" aria-hidden>
          <motion.span className="inline-block" initial={{ y: '110%' }} animate={{ y: 0 }} transition={{ duration: 1.1, ease, delay: delay + i * 0.07 }}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </H>
  );
}

function FadeUp({ children, delay, className }: { children: React.ReactNode; delay: number; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease, delay }}>
      {children}
    </motion.div>
  );
}

/** Crossfading slideshow with a slow Ken Burns drift and optional muted video slides. */
function Slideshow({ props, playing, index, prev }: { props: HeroProps; playing: boolean; index: number; prev: number | null }) {
  const reduce = useReducedMotion();
  const small = useIsSmall();
  const allowVideo = !reduce && !small;
  return (
    <div className="absolute inset-0 overflow-hidden bg-black" aria-hidden={props.slides.length > 1 ? undefined : true}>
      {props.slides.map((s, i) => {
        const active = i === index;
        const drifting = !reduce && (active || i === prev);
        return (
          <div key={i} className={cn('absolute inset-0 transition-opacity duration-[1600ms] ease-in-out', active ? 'opacity-100' : 'opacity-0')} aria-hidden={!active}>
            <div className={cn('absolute inset-0 origin-center', drifting && 'animate-kenburns', !playing && '[animation-play-state:paused]')} style={{ animationDuration: `${Math.max(props.intervalSeconds + 4, 10)}s` }}>
              {s.videoUrl && allowVideo && active ? (
                <video className="h-full w-full object-cover" src={s.videoUrl} poster={s.imageUrl} autoPlay muted loop playsInline preload="metadata" />
              ) : (
                <Img src={s.imageUrl} alt={s.alt} priority={i === 0} width={2400} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function useSlides(count: number, seconds: number) {
  const reduce = useReducedMotion();
  const [{ index, prev }, setState] = useState<{ index: number; prev: number | null }>({ index: 0, prev: null });
  const [playing, setPlaying] = useState(!reduce);
  const go = (i: number) => setState((s) => (i === s.index ? s : { index: (i + count) % count, prev: s.index }));
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => setState((s) => ({ index: (s.index + 1) % count, prev: s.index })), seconds * 1000);
    return () => clearInterval(t);
  }, [playing, count, seconds]);
  return { index, prev, playing, setPlaying, go };
}

function SlideControls({ count, index, playing, setPlaying, go, seconds }: { count: number; index: number; playing: boolean; setPlaying: (v: boolean) => void; go: (i: number) => void; seconds: number }) {
  if (count < 2) return null;
  return (
    <div className="flex items-center gap-4 text-white">
      <span className="font-heading text-sm tabular-nums">
        {String(index + 1).padStart(2, '0')} <span className="opacity-50">/ {String(count).padStart(2, '0')}</span>
      </span>
      <div className="flex gap-1.5">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" onClick={() => go(i)} className="group relative h-6 w-8 sm:w-10" aria-label={`Show image ${i + 1}`} aria-current={i === index}>
            <span className="absolute inset-x-0 top-1/2 h-px bg-white/30" />
            {i === index && <span key={`${index}-${playing}`} className="absolute left-0 top-1/2 h-px bg-white" style={{ width: playing ? undefined : '100%', animation: playing ? `hero-progress ${seconds}s linear forwards` : undefined }} />}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setPlaying(!playing)} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 transition hover:border-white" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}>
        {playing ? <Pause className="h-3 w-3" fill="currentColor" /> : <Play className="ml-0.5 h-3 w-3" fill="currentColor" />}
      </button>
      <style>{'@keyframes hero-progress{from{width:0}to{width:100%}}'}</style>
    </div>
  );
}

function ScrollHint({ target }: { target: React.RefObject<HTMLElement> }) {
  return (
    <button
      type="button"
      onClick={() => {
        const el = target.current;
        if (el) window.scrollTo({ top: el.getBoundingClientRect().bottom + window.scrollY - 1, behavior: 'smooth' });
      }}
      className="group absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 text-[0.62rem] uppercase text-white/80 transition hover:text-white md:flex"
      style={{ letterSpacing: '0.32em' }}
      aria-label="Scroll to content"
    >
      Scroll
      <span className="relative h-12 w-px overflow-hidden bg-white/25">
        <span className="absolute left-0 top-0 h-1/2 w-px animate-[scroll-hint_2.2s_ease-in-out_infinite] bg-white" />
      </span>
      <style>{'@keyframes scroll-hint{0%{transform:translateY(-100%)}100%{transform:translateY(200%)}}'}</style>
    </button>
  );
}

export function HeroSection({ section, index: pos }: SectionRenderProps<'hero'>) {
  const p = section.props;
  const ref = useRef<HTMLElement>(null);
  const slides = useSlides(p.slides.length, p.intervalSeconds);
  const H = pos === 0 ? 'h1' : 'h2';
  const center = p.align === 'center' || p.variant === 'centered';

  if (p.variant === 'split') {
    return (
      <section ref={ref} id={p.anchorId || undefined} data-section-id={section.id} className="relative overflow-hidden">
        <div className="grid min-h-[92svh] lg:grid-cols-2">
          <div className="container-site order-2 flex flex-col justify-center py-16 lg:order-1 lg:max-w-none lg:py-32 lg:pl-[max(3rem,calc((100vw-84rem)/2+3rem))] lg:pr-16" style={{ paddingTop: undefined }}>
            <div className="hidden lg:block" style={{ height: 'calc(var(--header-h) + var(--announce-h, 0px))' }} />
            {p.eyebrow && (
              <FadeUp delay={0.1}>
                <p className="eyebrow mb-6">{p.eyebrow}</p>
              </FadeUp>
            )}
            <RevealHeadline text={p.headline} as={H} className="t-display text-balance" />
            {p.subheadline && (
              <FadeUp delay={0.7}>
                <p className="lead mt-8 max-w-xl">{p.subheadline}</p>
              </FadeUp>
            )}
            <FadeUp delay={0.9}>
              <Ctas ctas={p.ctas} className="mt-10" />
            </FadeUp>
          </div>
          <div className="relative order-1 min-h-[60svh] lg:order-2 lg:min-h-0">
            <div className="lg:hidden" style={{ height: 'calc(var(--header-h) + var(--announce-h, 0px))' }} />
            <Slideshow props={p} {...slides} />
            <div className="absolute inset-0 bg-black" style={{ opacity: p.overlay * 0.5 }} />
            <div className="absolute bottom-6 right-6">
              <SlideControls count={p.slides.length} {...slides} seconds={p.intervalSeconds} />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const full = p.variant === 'fullscreen';
  return (
    <section ref={ref} id={p.anchorId || undefined} data-section-id={section.id} className={cn('on-image relative isolate flex overflow-hidden text-white', full ? 'min-h-[620px] h-[100svh]' : 'min-h-[560px] h-[82svh]')} style={ON_IMAGE_VARS}>
      <Slideshow props={p} {...slides} />
      <div className="absolute inset-0 bg-black" style={{ opacity: p.overlay }} aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" aria-hidden />
      <div className={cn('container-site relative flex w-full flex-col pb-24 md:pb-28', center ? 'items-center justify-center text-center' : 'justify-end', !full && 'justify-center pb-16 pt-28')}>
        <div className={cn(center ? 'max-w-4xl' : 'max-w-4xl')}>
          {p.eyebrow && (
            <FadeUp delay={0.1}>
              <p className={cn('mb-6 flex items-center gap-4 font-body text-[0.72rem] uppercase text-white/85', center && 'justify-center')} style={{ letterSpacing: '0.34em' }}>
                <span className="h-px w-10 bg-primary" aria-hidden />
                {p.eyebrow}
                {center && <span className="h-px w-10 bg-primary" aria-hidden />}
              </p>
            </FadeUp>
          )}
          <RevealHeadline text={p.headline} as={H} className="t-display text-balance text-white" />
          {p.subheadline && (
            <FadeUp delay={0.75}>
              <p className={cn('mt-7 max-w-2xl text-[1.05rem] leading-relaxed text-white/80 md:text-lg', center && 'mx-auto')}>{p.subheadline}</p>
            </FadeUp>
          )}
          <FadeUp delay={0.95}>
            <Ctas ctas={p.ctas} className={cn('mt-10', center && 'justify-center')} />
          </FadeUp>
        </div>
      </div>
      <div className="absolute bottom-7 right-5 sm:right-8 lg:right-12">
        <SlideControls count={p.slides.length} {...slides} seconds={p.intervalSeconds} />
      </div>
      {p.showScrollHint && full && <ScrollHint target={ref} />}
      {p.slides[slides.index]?.caption && <p className="absolute bottom-8 left-5 hidden text-xs text-white/60 sm:left-8 md:block lg:left-12" aria-live="off">{p.slides[slides.index].caption}</p>}
    </section>
  );
}
