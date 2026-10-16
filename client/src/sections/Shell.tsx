import type { CSSProperties, ReactNode } from 'react';
import { Img } from '@/components/ui/Img';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/cn';

interface CommonProps {
  eyebrow?: string;
  heading?: string;
  subheading?: string;
  anchorId?: string;
  background?: { variant: 'default' | 'surface' | 'contrast' | 'image'; imageUrl: string; overlay: number };
}

/** White text tokens for sections that sit on photography (not brand colours — overlays are always dark). */
export const ON_IMAGE_VARS = { '--c-text': '255 255 255', '--c-muted': '226 222 214', '--c-border': '255 255 255' } as CSSProperties;

/**
 * Root element for every CMS section: anchor id, `data-section-id` for the builder's scroll-to,
 * and the background variant (default / surface / contrast / image with overlay).
 */
export function SectionShell({
  id,
  props,
  children,
  className,
  pad = true,
  as: Tag = 'section',
  label,
}: {
  id: string;
  props: CommonProps;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  as?: 'section' | 'div';
  label?: string;
}) {
  const bg = props.background ?? { variant: 'default', imageUrl: '', overlay: 0.55 };
  const image = bg.variant === 'image' && !!bg.imageUrl;
  return (
    <Tag
      id={props.anchorId || undefined}
      data-section-id={id}
      aria-label={label || props.heading || undefined}
      className={cn(
        'relative isolate overflow-x-clip',
        pad && 'section',
        bg.variant === 'surface' && 'bg-variant-surface',
        bg.variant === 'contrast' && 'bg-variant-contrast',
        image && 'on-image overflow-hidden text-white',
        className,
      )}
      style={image ? ON_IMAGE_VARS : undefined}
    >
      {image && (
        <div className="absolute inset-0 -z-10" aria-hidden>
          <Img src={bg.imageUrl} alt="" width={2200} sizes="100vw" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
          <div className="absolute inset-0 bg-black" style={{ opacity: bg.overlay }} />
        </div>
      )}
      {children}
    </Tag>
  );
}

/** Eyebrow + heading + subheading block. `level` 1 is used when the section opens the page. */
export function SectionHeader({
  props,
  level = 2,
  align = 'left',
  className,
  aside,
}: {
  props: CommonProps;
  level?: 1 | 2;
  align?: 'left' | 'center';
  className?: string;
  aside?: ReactNode;
}) {
  if (!props.eyebrow && !props.heading && !props.subheading && !aside) return null;
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <Reveal className={cn('mb-12 md:mb-16', align === 'center' ? 'mx-auto max-w-3xl text-center' : 'flex flex-col gap-8 md:flex-row md:items-end md:justify-between', className)}>
      <div className={cn(align === 'left' && 'max-w-3xl')}>
        {props.eyebrow && <p className="eyebrow mb-5">{props.eyebrow}</p>}
        {props.heading && <H className={cn(level === 1 ? 't-h1' : 't-h2', 'text-balance')}>{props.heading}</H>}
        {props.subheading && <p className={cn('lead mt-5', align === 'center' ? 'mx-auto max-w-2xl' : 'max-w-2xl')}>{props.subheading}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </Reveal>
  );
}

/** Shown only in the CMS preview when a data-backed section has nothing published yet. */
export function PreviewHint({ preview, id, title, body }: { preview?: boolean; id: string; title: string; body: string }) {
  if (!preview) return null;
  return (
    <div data-section-id={id} className="container-site py-10">
      <div className="rounded-theme-img border border-dashed border-line px-6 py-8 text-center text-sm text-muted">
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1">{body}</p>
      </div>
    </div>
  );
}
