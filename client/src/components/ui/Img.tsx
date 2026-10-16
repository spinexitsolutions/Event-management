import { useState, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import { sized, srcSet } from '@/lib/image';

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string | null | undefined;
  alt: string;
  /** Rendered width hint used for the default `sizes` and the fallback src width. */
  width?: number;
  sizes?: string;
  priority?: boolean;
  /** Class applied to the fallback block when the image is missing or fails to load. */
  fallbackClassName?: string;
}

/**
 * Responsive, lazy-loaded image with srcset and a graceful fallback:
 * a missing or broken image becomes a quiet tonal panel instead of a broken-image icon.
 */
export function Img({ src, alt, width = 1200, sizes, priority, className, fallbackClassName, onLoad, ...rest }: Props) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!src || failed) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={cn('bg-gradient-to-br from-surface-2 via-surface to-surface-2', className, fallbackClassName)}
        style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, rgb(var(--c-primary) / 0.18), transparent 60%)' }}
      />
    );
  }
  return (
    <img
      src={sized(src, width)}
      srcSet={srcSet(src)}
      sizes={sizes ?? `(max-width: 768px) 100vw, ${width}px`}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      // @ts-expect-error fetchpriority is valid HTML but not yet in React's types
      fetchpriority={priority ? 'high' : undefined}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={cn('transition-opacity duration-700', loaded ? 'opacity-100' : 'opacity-0', className)}
      {...rest}
    />
  );
}
