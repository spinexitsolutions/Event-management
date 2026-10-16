import { animate, motion, useInView, useReducedMotion, useScroll } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import { PreviewHint, SectionHeader, SectionShell } from './Shell';
import type { SectionRenderProps } from './types';
import { Ctas, ParallaxImage, VideoPlayer } from './ui';

const lvl = (i: number) => (i === 0 ? 1 : 2);

/* ───────────── Intro ───────────── */

export function IntroSection({ section, index }: SectionRenderProps<'intro'>) {
  const p = section.props;
  const H = index === 0 ? 'h1' : 'h2';
  const text = (
    <>
      {p.eyebrow && <p className="eyebrow mb-6">{p.eyebrow}</p>}
      {p.heading && <H className="t-h1 text-balance">{p.heading}</H>}
      {p.subheading && <p className="lead mt-6">{p.subheading}</p>}
      {p.body && <Markdown className="mt-8 text-[1.02rem] leading-[1.85] text-muted [&_p]:text-ink/80">{p.body}</Markdown>}
      {p.signature && <p className="mt-10 font-heading text-2xl italic text-primary">— {p.signature}</p>}
      {p.cta && <Ctas ctas={[p.cta]} className="mt-10" />}
    </>
  );
  if (p.variant === 'editorial') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <Reveal className="mx-auto max-w-3xl text-center [&_.prose-lux]:mx-auto [&_.prose-lux]:max-w-2xl">{text}</Reveal>
          {(p.imageUrl || p.secondaryImageUrl) && (
            <div className="mt-20 grid gap-6 md:grid-cols-12">
              {p.imageUrl && <ParallaxImage src={p.imageUrl} alt={p.imageAlt} className={cn('aspect-[16/10] rounded-theme-img', p.secondaryImageUrl ? 'md:col-span-8' : 'md:col-span-12')} sizes="(max-width: 768px) 100vw, 66vw" />}
              {p.secondaryImageUrl && <ParallaxImage src={p.secondaryImageUrl} alt="" className="aspect-[4/5] rounded-theme-img md:col-span-4 md:mt-24" amount={12} sizes="(max-width: 768px) 100vw, 33vw" width={800} />}
            </div>
          )}
        </div>
      </SectionShell>
    );
  }
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site grid grid-cols-1 items-center gap-16 lg:grid-cols-12 lg:gap-12">
        {(p.imageUrl || p.secondaryImageUrl) && (
          <div className="relative lg:col-span-6">
            {p.imageUrl && <ParallaxImage src={p.imageUrl} alt={p.imageAlt} className="aspect-[4/5] w-[86%] rounded-theme-img" sizes="(max-width: 1024px) 86vw, 42vw" />}
            {p.secondaryImageUrl && (
              <Reveal delay={0.2} className="absolute -bottom-10 right-0 w-[46%] border-[6px] border-bg shadow-2xl sm:border-[10px]">
                <Img src={p.secondaryImageUrl} alt="" width={600} className="aspect-[3/4] w-full object-cover" fallbackClassName="aspect-[3/4] w-full" />
              </Reveal>
            )}
          </div>
        )}
        <Reveal className={cn(p.imageUrl || p.secondaryImageUrl ? 'lg:col-span-5 lg:col-start-8' : 'lg:col-span-8 lg:col-start-3')}>{text}</Reveal>
      </div>
    </SectionShell>
  );
}

/* ───────────── Features ───────────── */

export function FeaturesSection({ section, index }: SectionRenderProps<'features'>) {
  const p = section.props;
  if (p.variant === 'split') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12 lg:gap-20">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <SectionHeader props={p} level={lvl(index)} className="!mb-10" />
              {p.imageUrl && <ParallaxImage src={p.imageUrl} alt={p.imageAlt} className="aspect-[4/5] rounded-theme-img" sizes="(max-width: 1024px) 100vw, 40vw" />}
            </div>
          </div>
          <Stagger className="divide-y divide-line border-y border-line lg:col-span-7">
            {p.items.map((it, i) => (
              <motion.div key={i} variants={staggerItem} className="grid gap-4 py-10 sm:grid-cols-[4rem_1fr] md:py-12">
                <Icon name={it.icon} className="h-9 w-9 text-primary" strokeWidth={1} />
                <div>
                  <h3 className="t-h3 font-heading">{it.title}</h3>
                  {it.body && <p className="mt-3 max-w-xl leading-relaxed text-muted">{it.body}</p>}
                </div>
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
        <SectionHeader props={p} level={lvl(index)} align="center" />
        <Stagger className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {p.items.map((it, i) => (
            <motion.div key={i} variants={staggerItem} className="group bg-bg p-8 transition-colors duration-500 hover:bg-surface md:p-10 [.bg-variant-surface_&]:bg-surface [.bg-variant-contrast_&]:bg-contrast">
              <Icon name={it.icon} className="h-9 w-9 text-primary transition-transform duration-700 ease-lux group-hover:-translate-y-1" strokeWidth={1} />
              <h3 className="t-h4 mt-8 font-heading">{it.title}</h3>
              {it.body && <p className="mt-3 text-sm leading-relaxed text-muted">{it.body}</p>}
            </motion.div>
          ))}
        </Stagger>
      </div>
    </SectionShell>
  );
}

/* ───────────── Process ───────────── */

export function ProcessSection({ section, index }: SectionRenderProps<'process'>) {
  const p = section.props;
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  if (p.variant === 'numbered') {
    return (
      <SectionShell id={section.id} props={p}>
        <div className="container-site">
          <SectionHeader props={p} level={lvl(index)} />
          <Stagger className={cn('grid gap-12 sm:grid-cols-2', p.steps.length % 3 === 0 || p.steps.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
            {p.steps.map((s, i) => (
              <motion.div key={i} variants={staggerItem} className="border-t border-line pt-8">
                <span className="font-heading text-5xl text-primary/80">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="t-h4 mt-6 font-heading">{s.title}</h3>
                {s.body && <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>}
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
        <SectionHeader props={p} level={lvl(index)} align="center" />
        <ol ref={ref} className="relative mx-auto max-w-5xl">
          <span className="absolute bottom-0 left-[11px] top-0 w-px bg-line md:left-1/2" aria-hidden />
          {!reduce && <motion.span style={{ scaleY: scrollYProgress }} className="absolute bottom-0 left-[11px] top-0 w-px origin-top bg-primary md:left-1/2" aria-hidden />}
          {p.steps.map((s, i) => (
            <li key={i} className={cn('relative grid pb-14 pl-12 last:pb-0 md:grid-cols-2 md:gap-20 md:pl-0')}>
              <span className="absolute left-0 top-1.5 flex h-[23px] w-[23px] items-center justify-center rounded-full border border-primary bg-bg md:left-1/2 md:-translate-x-1/2 [.bg-variant-surface_&]:bg-surface" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              <Reveal className={cn(i % 2 === 0 ? 'md:col-start-1 md:text-right' : 'md:col-start-2')}>
                <p className="eyebrow">Step {String(i + 1).padStart(2, '0')}</p>
                <h3 className="t-h3 mt-3 font-heading">{s.title}</h3>
                {s.body && <p className={cn('mt-3 max-w-md leading-relaxed text-muted', i % 2 === 0 && 'md:ml-auto')}>{s.body}</p>}
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </SectionShell>
  );
}

/* ───────────── Stats ───────────── */

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setShown(value);
      return;
    }
    const c = animate(0, value, { duration: 2.2, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, value, reduce]);
  return (
    <span ref={ref} className="tabular-nums">
      <span aria-hidden>{shown.toLocaleString()}</span>
      <span className="sr-only">{value.toLocaleString()}</span>
      {suffix && <span className="text-primary">{suffix}</span>}
    </span>
  );
}

export function StatsSection({ section, data, index, preview }: SectionRenderProps<'stats'>) {
  const p = section.props;
  const live = (data && typeof data === 'object' ? data : {}) as Record<string, number>;
  const items = p.items.map((it) => ({ ...it, value: it.metric === 'manual' ? it.value : Number(live[it.metric] ?? 0) })).filter((it) => it.value > 0);
  if (!items.length) return <PreviewHint preview={preview} id={section.id} title="Statistics hidden" body="Every figure is currently 0, so this section is hidden on the live site." />;
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} align="center" />
        <dl className={cn('grid gap-y-14 text-center', items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : items.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}>
          {items.map((it, i) => (
            <div key={i} className={cn('flex flex-col-reverse px-4', i > 0 && 'sm:border-l sm:border-line')}>
              <dt className="mt-4 text-[0.7rem] uppercase text-muted" style={{ letterSpacing: '0.26em' }}>
                {it.label}
              </dt>
              <dd className="font-heading text-[clamp(3rem,6vw,5.25rem)] leading-none">
                <CountUp value={it.value} suffix={it.suffix} />
              </dd>
            </div>
          ))}
        </dl>
        {p.footnote && <p className="mt-14 text-center text-xs text-muted">{p.footnote}</p>}
      </div>
    </SectionShell>
  );
}

/* ───────────── Quote ───────────── */

export function QuoteSection({ section }: SectionRenderProps<'quote'>) {
  const p = section.props;
  const props = p.imageUrl && p.background.variant !== 'image' ? { ...p, background: { variant: 'image' as const, imageUrl: p.imageUrl, overlay: Math.max(p.background.overlay, 0.5) } } : p;
  return (
    <SectionShell id={section.id} props={props}>
      <Reveal className="container-site mx-auto max-w-5xl text-center">
        {p.eyebrow && <p className="eyebrow mb-8">{p.eyebrow}</p>}
        <span className="block font-heading text-7xl leading-none text-primary" aria-hidden>
          “
        </span>
        <blockquote className="t-h1 mt-2 text-balance font-heading italic">{p.quote}</blockquote>
        {p.attribution && (
          <p className="mt-10 text-[0.72rem] uppercase text-muted" style={{ letterSpacing: '0.3em' }}>
            — {p.attribution}
          </p>
        )}
      </Reveal>
    </SectionShell>
  );
}

/* ───────────── Rich text ───────────── */

export function RichTextSection({ section, index }: SectionRenderProps<'richText'>) {
  const p = section.props;
  const center = p.align === 'center';
  return (
    <SectionShell id={section.id} props={p}>
      <div className={cn('container-site', p.width === 'narrow' ? '[&>*]:mx-auto [&>*]:max-w-3xl' : '[&>*]:max-w-5xl', center && 'text-center')}>
        <SectionHeader props={p} level={lvl(index)} align={center ? 'center' : 'left'} />
        <Reveal>
          <Markdown className={cn('text-[1.04rem] leading-[1.85]', center && '[&_ol]:text-left [&_ul]:text-left')}>{p.body}</Markdown>
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* ───────────── Image + text ───────────── */

export function ImageTextSection({ section, index }: SectionRenderProps<'imageText'>) {
  const p = section.props;
  const H = index === 0 ? 'h1' : 'h2';
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site grid grid-cols-1 items-center gap-12 md:grid-cols-2 lg:gap-24">
        {p.imageUrl && <ParallaxImage src={p.imageUrl} alt={p.imageAlt} className={cn('aspect-[4/5] rounded-theme-img', p.imageSide === 'left' ? 'md:order-1' : 'md:order-2')} sizes="(max-width: 768px) 100vw, 50vw" />}
        <Reveal className={cn(p.imageSide === 'left' ? 'md:order-2' : 'md:order-1', !p.imageUrl && 'md:col-span-2 md:max-w-3xl')}>
          {p.eyebrow && <p className="eyebrow mb-5">{p.eyebrow}</p>}
          {p.heading && <H className="t-h2 text-balance">{p.heading}</H>}
          {p.subheading && <p className="lead mt-5">{p.subheading}</p>}
          {p.body && <Markdown className="mt-7 leading-[1.85]">{p.body}</Markdown>}
          <Ctas ctas={p.ctas} className="mt-10" />
        </Reveal>
      </div>
    </SectionShell>
  );
}

/* ───────────── Video ───────────── */

export function VideoSection({ section, index, preview }: SectionRenderProps<'video'>) {
  const p = section.props;
  if (!p.videoUrl) return <PreviewHint preview={preview} id={section.id} title="Video feature" body="Add a video URL to show this section." />;
  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site">
        <SectionHeader props={p} level={lvl(index)} align="center" />
        <Reveal>
          <VideoPlayer url={p.videoUrl} poster={p.posterUrl} posterAlt={p.posterAlt} title={p.heading || 'Showreel'} />
        </Reveal>
      </div>
    </SectionShell>
  );
}
