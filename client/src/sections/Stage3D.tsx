import { useReducedMotion } from 'framer-motion';
import { Move3d } from 'lucide-react';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Img } from '@/components/ui/Img';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';
import { SectionShell } from './Shell';
import type { SectionRenderProps } from './types';
import { Ctas, useIsSmall } from './ui';

const Scene = lazy(() => import('./Stage3DScene'));

const PRESET_LABEL = { 'wedding-mandap': 'Wedding mandap', 'concert-stage': 'Concert stage', 'gala-dinner': 'Gala dinner' } as const;

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** Accent: the section's colour, else the theme primary (read from the CSS variable). */
function themeColor(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = v.split(/\s+/).map(Number);
  return parts.length === 3 && parts.every((n) => !Number.isNaN(n)) ? `rgb(${parts.join(',')})` : fallback;
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Stage3DSection({ section, index }: SectionRenderProps<'stage3d'>) {
  const p = section.props;
  const reduce = useReducedMotion();
  const small = useIsSmall();
  const box = useRef<HTMLDivElement>(null);
  const [capable] = useState(() => typeof window !== 'undefined' && webglAvailable() && (navigator.hardwareConcurrency ?? 8) >= 4);
  const [inView, setInView] = useState(false);
  const [mounted, setMounted] = useState(false);
  const use3d = capable && !reduce && !small;

  useEffect(() => {
    if (!use3d || !box.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        if (e.isIntersecting) setMounted(true);
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(box.current);
    return () => io.disconnect();
  }, [use3d]);

  const accent = p.accentColor || (mounted ? themeColor('--c-primary', '#c6a76b') : '#c6a76b');
  const ground = mounted ? themeColor('--c-surface', '#181716') : '#181716';
  const H = index === 0 ? 'h1' : 'h2';
  const poster = (
    <div className="absolute inset-0">
      {p.posterUrl ? (
        <Img src={p.posterUrl} alt={`${PRESET_LABEL[p.preset]} concept`} width={1600} className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface-2" style={{ backgroundImage: 'radial-gradient(circle at 50% 70%, rgb(var(--c-primary) / 0.25), transparent 60%)' }}>
          <Move3d className="h-14 w-14 text-primary/60" strokeWidth={0.75} aria-hidden />
        </div>
      )}
    </div>
  );

  return (
    <SectionShell id={section.id} props={p}>
      <div className="container-site grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-4">
          {p.eyebrow && <p className="eyebrow mb-5">{p.eyebrow}</p>}
          {p.heading && <H className="t-h2 text-balance">{p.heading}</H>}
          {(p.body || p.subheading) && <p className="lead mt-6">{p.body || p.subheading}</p>}
          {use3d && (
            <p className="mt-8 flex items-center gap-3 text-xs text-muted">
              <Move3d className="h-4 w-4 text-primary" strokeWidth={1.25} /> Drag to explore · scroll to zoom
            </p>
          )}
          <Ctas ctas={p.ctas} className="mt-10" />
        </Reveal>
        <div ref={box} className={cn('relative overflow-hidden rounded-theme-img border border-line bg-surface lg:col-span-8', use3d ? 'aspect-[4/3] lg:aspect-[16/11]' : 'aspect-[4/3]')}>
          {use3d && mounted ? (
            <SceneBoundary fallback={poster}>
              <Suspense fallback={poster}>
                <div className="absolute inset-0 animate-[fadein_1.2s_ease_forwards]" style={{ background: 'radial-gradient(ellipse at 50% 35%, rgb(var(--c-primary) / 0.14), transparent 65%)' }}>
                  <Scene preset={p.preset} accent={accent} ground={ground} active={inView} />
                </div>
              </Suspense>
            </SceneBoundary>
          ) : (
            poster
          )}
          <span className="pointer-events-none absolute left-5 top-5 bg-bg/80 px-3 py-1.5 text-[0.62rem] uppercase text-ink backdrop-blur" style={{ letterSpacing: '0.22em' }}>
            {PRESET_LABEL[p.preset]} · concept
          </span>
          <style>{'@keyframes fadein{from{opacity:0}to{opacity:1}}'}</style>
        </div>
      </div>
    </SectionShell>
  );
}
