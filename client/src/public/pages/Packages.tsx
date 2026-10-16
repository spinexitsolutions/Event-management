import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarClock, Check, Minus, Plus, Users } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { fmtDate, money } from '@/lib/format';
import type { GalleryImage, PackageCard } from '@/lib/types';
import { PackageTile } from '@/sections/cards';
import { GalleryGrid } from '@/sections/showcase';
import { discountText, guestRange, PriceTag } from '@/sections/ui';
import { BlockTitle, GridSkeleton, ImageHero, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';
import { stripLead } from './Events';

export function PackagesIndex() {
  const { bootstrap } = useSite();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const q = useQuery({ queryKey: ['public-packages', category], queryFn: () => api.get<PackageCard[]>('/public/packages', { category }) });
  const all = useQuery({ queryKey: ['public-packages'], queryFn: () => api.get<PackageCard[]>('/public/packages'), staleTime: 300_000 });
  // Only offer category chips that actually have packages.
  const withPackages = new Set((all.data ?? []).map((p) => p.category?.slug).filter(Boolean));
  const chips = (bootstrap?.categories ?? []).filter((c) => withPackages.has(c.slug));
  const catName = bootstrap?.categories.find((c) => c.slug === category)?.name;
  return (
    <>
      <Seo title={catName ? `${catName} packages` : 'Packages'} description="Transparent starting points for weddings, celebrations and corporate events — every event is then tailored in a personal proposal." />
      <PageHeader eyebrow="Packages" title="Curated starting points" intro="Transparent starting prices. Every celebration is then tailored to you in a personal proposal." crumbs={[{ label: 'Home', href: '/' }, { label: 'Packages' }]}>
        {chips.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2" role="group" aria-label="Filter by occasion">
            <button type="button" className="chip text-xs" data-active={!category} aria-pressed={!category} onClick={() => setParams({}, { replace: true })}>
              All packages
            </button>
            {chips.map((c) => (
              <button key={c.slug} type="button" className="chip text-xs" data-active={category === c.slug} aria-pressed={category === c.slug} onClick={() => setParams(category === c.slug ? {} : { category: c.slug }, { replace: true })}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </PageHeader>
      <section className="container-site pb-section">
        {q.isLoading ? (
          <GridSkeleton count={3} aspect="aspect-[16/10]" />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState
            title={category ? 'No packages for this occasion yet' : 'Packages are being prepared'}
            body="Every event we create is bespoke — tell us what you are planning and we will prepare a personal proposal."
            action={
              <Link to="/inquire" className="btn btn-primary btn-sm">
                Request a proposal
              </Link>
            }
          />
        ) : (
          <>
            <Stagger className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {q.data.map((p) => (
                <motion.div key={p.id} variants={staggerItem} className="h-full">
                  <PackageTile p={p} />
                </motion.div>
              ))}
            </Stagger>
            <p className="mx-auto mt-14 max-w-2xl text-center text-sm text-muted">Prices shown are indicative starting points and exclude taxes unless stated. Your final price is set out in a personalised proposal, subject to date and venue availability.</p>
          </>
        )}
      </section>
      <InquiryBand title="Prefer something entirely bespoke?" body="Most of our events are designed from a blank page. Tell us your vision." href="/inquire" />
    </>
  );
}

interface PackageDetailData extends Omit<PackageCard, 'category'> {
  body: string;
  gallery: GalleryImage[];
  addOns: { name: string; priceMinor: number | null; description?: string }[];
  exclusions: string[];
  terms: string;
  availability: string;
  validFrom: string | null;
  services: { slug: string; name: string; icon: string }[];
  category: { slug: string; name: string } | null;
}

export function PackageDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public-package', slug], queryFn: () => api.get<PackageDetailData>(`/public/packages/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton hero />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="This package is no longer available" body="It may have expired or been retired. Explore our current packages, or ask us for a bespoke proposal." /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data!;
  const gallery = (p.gallery ?? []).filter((g) => g.url);
  const discount = discountText(p);
  const guests = guestRange(p.guestMin, p.guestMax);
  const body = stripLead(p.body, p.summary);
  return (
    <>
      <Seo
        title={`${p.name} package`}
        description={p.summary}
        image={p.coverImage}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: p.name,
          description: p.summary,
          ...(p.priceMinor !== null && p.pricingModel !== 'ON_REQUEST' ? { offers: { '@type': 'Offer', priceCurrency: p.currency, price: (p.priceMinor / 100).toFixed(2), ...(p.pricingModel === 'STARTING_FROM' ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: (p.priceMinor / 100).toFixed(2), priceCurrency: p.currency } } : {}) } } : {}),
        }}
      />
      <ImageHero image={p.coverImage} alt={p.coverAlt || p.name} eyebrow={[p.tier, p.category?.name].filter(Boolean).join(' · ') || 'Package'} title={p.name} subtitle={p.summary} height="medium" crumbs={[{ label: 'Home', href: '/' }, { label: 'Packages', href: '/packages' }, { label: p.name }]} />

      <section className="section">
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12">
          <div className="space-y-16 lg:col-span-7">
            {body && (
              <Reveal>
                <Markdown className="text-[1.04rem] leading-[1.85]">{body}</Markdown>
              </Reveal>
            )}
            {p.inclusions.length > 0 && (
              <Reveal>
                <h2 className="t-h3 mb-8 font-heading">What’s included</h2>
                <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  {p.inclusions.map((inc, i) => (
                    <li key={i} className="flex gap-3 border-b border-line pb-4">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
            {p.services.length > 0 && (
              <Reveal>
                <h2 className="t-h3 mb-8 font-heading">Services in this package</h2>
                <div className="flex flex-wrap gap-3">
                  {p.services.map((s) => (
                    <Link key={s.slug} to={`/services/${s.slug}`} className="chip">
                      <Icon name={s.icon} className="h-4 w-4 text-primary" /> {s.name}
                    </Link>
                  ))}
                </div>
              </Reveal>
            )}
            {p.addOns.length > 0 && (
              <Reveal>
                <h2 className="t-h3 mb-8 font-heading">Optional add-ons</h2>
                <ul className="divide-y divide-line border-y border-line">
                  {p.addOns.map((a, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-5">
                      <div className="flex gap-3">
                        <Plus className="mt-1.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <div>
                          <p>{a.name}</p>
                          {a.description && <p className="mt-1 text-sm text-muted">{a.description}</p>}
                        </div>
                      </div>
                      <p className="font-heading text-lg">{a.priceMinor !== null && a.priceMinor !== undefined ? money(a.priceMinor, p.currency) : <span className="text-sm text-muted">Price on request</span>}</p>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
            {p.exclusions.length > 0 && (
              <Reveal>
                <h2 className="t-h3 mb-8 font-heading">Not included</h2>
                <ul className="grid gap-x-10 gap-y-3 sm:grid-cols-2">
                  {p.exclusions.map((ex, i) => (
                    <li key={i} className="flex gap-3 text-muted">
                      <Minus className="mt-1 h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
            {p.terms && (
              <Reveal>
                <p className="eyebrow mb-4" role="heading" aria-level={2}>
                  Terms
                </p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{p.terms}</p>
              </Reveal>
            )}
          </div>

          <aside className="lg:col-span-4 lg:col-start-9">
            <div className="card p-8 md:p-10 lg:sticky lg:top-32">
              {discount && (
                <span className="mb-6 inline-block bg-primary px-3 py-1 text-[0.62rem] uppercase text-on-primary" style={{ letterSpacing: '0.22em' }}>
                  {discount}
                </span>
              )}
              <PriceTag pkg={p} large />
              <ul className="mt-8 space-y-4 border-t border-line pt-8 text-sm">
                {guests && (
                  <li className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-primary" strokeWidth={1.25} /> {guests}
                  </li>
                )}
                {p.availability && (
                  <li className="flex items-start gap-3">
                    <CalendarClock className="mt-0.5 h-4 w-4 text-primary" strokeWidth={1.25} /> {p.availability}
                  </li>
                )}
                {p.validUntil && (
                  <li className="flex items-center gap-3 text-muted">
                    <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1.25} /> Offer valid until {fmtDate(p.validUntil, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </li>
                )}
              </ul>
              <Link to={`/inquire?package=${p.id}`} className="btn btn-primary mt-8 w-full">
                Inquire about this package
              </Link>
              <p className="mt-4 text-center text-xs text-muted">No commitment — a planner will prepare a tailored proposal.</p>
            </div>
          </aside>
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="section bg-variant-surface" aria-label="Gallery">
          <div className="container-site">
            <BlockTitle eyebrow="Gallery" title="The look & feel" />
            <GalleryGrid images={gallery} variant="carousel" label={`${p.name} gallery`} />
          </div>
        </section>
      )}

      <InquiryBand title="Make it yours" body="Every package is a starting point — we tailor every detail to your occasion." href={`/inquire?package=${p.id}`} label="Inquire with this package" />
    </>
  );
}
