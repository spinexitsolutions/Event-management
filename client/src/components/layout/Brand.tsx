import { Link } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { cn } from '@/lib/cn';

/** Logo image when uploaded, otherwise an elegant wordmark. `light` picks the light logo variant for dark overlays. */
export function Brand({ light, className }: { light?: boolean; className?: string }) {
  const { site } = useSite();
  if (!site) return <span className={cn('h-6 w-40', className)} />;
  const logo = light && site.brand.logoLightUrl ? site.brand.logoLightUrl : site.brand.logoUrl;
  return (
    <Link to="/" className={cn('inline-flex items-center', className)} aria-label={`${site.brand.name} — home`}>
      {logo ? (
        <img src={logo} alt={site.brand.logoAlt || site.brand.name} className="h-9 w-auto max-w-[180px] object-contain sm:h-10" />
      ) : (
        <span className="font-heading text-[1.05rem] uppercase sm:text-xl" style={{ letterSpacing: '0.32em' }}>
          {site.brand.wordmark || site.brand.name}
        </span>
      )}
    </Link>
  );
}
