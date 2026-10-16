import { Helmet } from 'react-helmet-async';
import { useSite } from '@/app/SiteProvider';

/** Per-page title/description/OG tags. The server also injects these into the HTML shell for crawlers. */
export function Seo({ title, description, image, noIndex, jsonLd }: { title?: string; description?: string; image?: string; noIndex?: boolean; jsonLd?: object }) {
  const { site } = useSite();
  const tpl = site?.seo.titleTemplate ?? '%s';
  const full = title ? (tpl.includes('%s') ? tpl.replace('%s', title) : title) : site?.seo.title || site?.brand.name || '';
  const desc = description || site?.seo.description || '';
  const img = image || site?.seo.image || '';
  return (
    <Helmet>
      <title>{full}</title>
      {desc && <meta name="description" content={desc} />}
      <meta property="og:title" content={full} />
      {desc && <meta property="og:description" content={desc} />}
      {img && <meta property="og:image" content={img.startsWith('http') ? img : `${window.location.origin}${img}`} />}
      {(noIndex || site?.seo.noIndex) && <meta name="robots" content="noindex,nofollow" />}
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
