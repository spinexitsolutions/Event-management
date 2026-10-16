import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import type { CategoryCard, GalleryImage, PackageCard, ProjectCard } from '@/lib/types';
import { PackageTile, ProjectTile } from '@/sections/cards';
import { Icon } from '@/components/ui/Icon';
import { GalleryGrid } from '@/sections/showcase';
import { FaqList, faqJsonLd } from '@/sections/social';
import { ArrowLink, cardGrid } from '@/sections/ui';
import { cn } from '@/lib/cn';
import { BlockTitle, GridSkeleton, ImageHero, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';

/** Drops a leading paragraph that repeats the summary (shown as the standfirst). */
export const stripLead = (body: string, lead: string) => (lead && body.trim().startsWith(lead.trim()) ? body.trim().slice(lead.trim().length).trim() : body);

export function EventsIndex() {
  const q = useQuery({ queryKey: ['public-categories'], queryFn: () => api.get<CategoryCard[]>('/public/categories') });
  return (
    <>
      <Seo title="Occasions we design" description="Weddings, celebrations, corporate events and brand experiences — designed and produced end to end." />
      <PageHeader eyebrow="Occasions" title="Every celebration, composed with intention" intro="From intimate vows to arena-scale launches — explore the occasions we design and produce." crumbs={[{ label: 'Home', href: '/' }, { label: 'Events' }]} />
      <section className="container-site pb-section">
        {q.isLoading ? (
          <GridSkeleton />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Our occasions are being curated" body="Please check back soon, or tell us about your event." />
        ) : (
          <Stagger className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3 lg:[&>*:nth-child(3n+2)]:mt-28">
            {q.data.map((c, i) => (
              <motion.article key={c.id} variants={staggerItem}>
                <Link to={`/events/${c.slug}`} className="group block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-theme-img bg-surface">
                    <Img src={c.coverImage} alt={c.coverAlt || c.name} width={900} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="h-full w-full object-cover transition-transform duration-[1.6s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
                    <span className="absolute left-5 top-5 font-heading text-sm text-white/90 mix-blend-difference">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h2 className="t-h3 mt-6 font-heading transition-colors group-hover:text-primary">{c.name}</h2>
                  {c.tagline && <p className="mt-2 font-heading text-lg italic text-muted">{c.tagline}</p>}
                  {c.summary && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{c.summary}</p>}
                  <ArrowLink className="mt-5">Explore</ArrowLink>
                </Link>
              </motion.article>
            ))}
          </Stagger>
        )}
      </section>
      <InquiryBand title="Don’t see your occasion?" body="We design bespoke events of every kind. Tell us what you are imagining." href="/inquire" />
    </>
  );
}

interface CategoryDetail extends CategoryCard {
  body: string;
  gallery: GalleryImage[];
  highlights: string[];
  faqs: { question: string; answer: string }[];
  seo: { title?: string; description?: string; image?: string };
  services: { id: string; slug: string; name: string; summary: string; icon: string; coverImage: string; coverAlt: string }[];
  projects: ProjectCard[];
  packages: PackageCard[];
}

export function EventDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public-category', slug], queryFn: () => api.get<CategoryDetail>(`/public/categories/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton hero />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="We couldn’t find that occasion" /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data!;
  return <EventDetailView key={c.id} c={c} />;
}

function EventDetailView({ c }: { c: CategoryDetail }) {
  const [showAllServices, setShowAll] = useState(false);
  const gallery = (c.gallery ?? []).filter((g) => g.url);
  const faqs = (c.faqs ?? []).filter((f) => f.question && f.answer);
  const body = stripLead(c.body, c.summary);
  const services = showAllServices ? c.services : c.services.slice(0, 6);
  return (
    <>
      <Seo title={c.seo?.title || c.name} description={c.seo?.description || c.summary || c.tagline} image={c.seo?.image || c.coverImage} jsonLd={faqs.length ? faqJsonLd(faqs) : undefined} />
      <ImageHero image={c.coverImage} alt={c.coverAlt || c.name} eyebrow="Occasions" title={c.name} subtitle={c.tagline} crumbs={[{ label: 'Home', href: '/' }, { label: 'Events', href: '/events' }, { label: c.name }]}>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link to={`/inquire?category=${c.id}`} className="btn btn-primary">
            Plan your {c.name.toLowerCase().replace(/s$/, '')}
          </Link>
          {c.projects.length > 0 && (
            <a href="#work" className="btn btn-secondary">
              See our work
            </a>
          )}
        </div>
      </ImageHero>

      {/* Story + highlights */}
      <section className="section">
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            {c.summary && <p className="font-heading text-[clamp(1.6rem,2.6vw,2.3rem)] leading-snug">{c.summary}</p>}
            {body && <Markdown className="mt-10 text-[1.04rem] leading-[1.85] text-muted">{body}</Markdown>}
          </Reveal>
          {c.highlights.length > 0 && (
            <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-9">
              <div className="card p-8 md:p-10 lg:sticky lg:top-32">
                <p className="eyebrow mb-6">Signature touches</p>
                <ul className="space-y-5">
                  {c.highlights.map((h, i) => (
                    <li key={i} className="flex gap-4 border-b border-line pb-5 last:border-0 last:pb-0">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={1.75} />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="section bg-variant-surface" aria-label="Gallery">
          <div className="container-site">
            <BlockTitle eyebrow="Gallery" title="Moments & details" />
            <GalleryGrid images={gallery} variant="masonry" label={`${c.name} gallery`} />
          </div>
        </section>
      )}

      {c.services.length > 0 && (
        <section className="section" aria-label="Services">
          <div className="container-site">
            <BlockTitle eyebrow="What we orchestrate" title={`Services for ${c.name.toLowerCase()}`} />
            <Stagger className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <motion.div key={s.id} variants={staggerItem} className="bg-bg">
                  <Link to={`/services/${s.slug}`} className="group flex h-full flex-col p-8 transition-colors duration-500 hover:bg-surface">
                    <Icon name={s.icon} className="h-8 w-8 text-primary" strokeWidth={1} />
                    <h3 className="t-h4 mt-6 font-heading group-hover:text-primary">{s.name}</h3>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{s.summary}</p>
                    <ArrowLink className="mt-6">Discover</ArrowLink>
                  </Link>
                </motion.div>
              ))}
            </Stagger>
            {c.services.length > 6 && !showAllServices && (
              <div className="mt-10 text-center">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAll(true)}>
                  Show all {c.services.length} services
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {c.projects.length > 0 && (
        <section id="work" className="section bg-variant-surface" aria-label="Featured projects">
          <div className="container-site">
            <BlockTitle
              eyebrow="Selected work"
              title={`${c.name} we have produced`}
              aside={
                <Link to={`/portfolio?category=${c.slug}`} className="group">
                  <ArrowLink>View all</ArrowLink>
                </Link>
              }
            />
            <Stagger className={cn('grid gap-x-8 gap-y-14', cardGrid(c.projects.length))}>
              {c.projects.map((p) => (
                <motion.div key={p.id} variants={staggerItem}>
                  <ProjectTile p={p} />
                </motion.div>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      {c.packages.length > 0 && (
        <section className="section" aria-label="Packages">
          <div className="container-site">
            <BlockTitle
              eyebrow="Packages"
              title="Curated starting points"
              aside={
                <Link to={`/packages?category=${c.slug}`} className="group">
                  <ArrowLink>All packages</ArrowLink>
                </Link>
              }
            />
            <Stagger className={cn('grid gap-6', cardGrid(c.packages.length))}>
              {c.packages.map((p) => (
                <motion.div key={p.id} variants={staggerItem} className="h-full">
                  <PackageTile p={p} />
                </motion.div>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="section bg-variant-surface" aria-label="Frequently asked questions">
          <div className="container-site grid grid-cols-1 gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <p className="eyebrow mb-4">FAQ</p>
              <h2 className="t-h2">Questions, answered</h2>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <FaqList items={faqs} />
            </div>
          </div>
        </section>
      )}

      <InquiryBand title={`Let’s design your ${c.name.toLowerCase().replace(/s$/, '')}`} body="Share a few details and a senior planner will be in touch within one business day." href={`/inquire?category=${c.id}`} image={gallery[0]?.url || c.coverImage} />
    </>
  );
}
