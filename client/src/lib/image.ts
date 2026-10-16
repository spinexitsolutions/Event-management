/**
 * Responsive image helpers. Unsplash/Cloudinary URLs get width-specific variants; local uploads
 * have a pre-generated "-sm.webp" variant.
 */
export function sized(url: string, width: number): string {
  if (!url) return url;
  if (url.includes('images.unsplash.com')) {
    const u = new URL(url);
    u.searchParams.set('w', String(width));
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    if (!u.searchParams.has('q')) u.searchParams.set('q', '80');
    return u.toString();
  }
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width}/`);
  if (url.startsWith('/uploads/') && url.endsWith('.webp') && width <= 800) return url.replace(/\.webp$/, '-sm.webp');
  return url;
}

export function srcSet(url: string, widths = [480, 800, 1200, 1600, 2200]): string | undefined {
  if (!url) return undefined;
  if (url.includes('images.unsplash.com') || url.includes('res.cloudinary.com')) return widths.map((w) => `${sized(url, w)} ${w}w`).join(', ');
  if (url.startsWith('/uploads/') && url.endsWith('.webp')) return `${sized(url, 800)} 800w, ${url} 2560w`;
  return undefined;
}
