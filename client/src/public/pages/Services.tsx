import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import type { GalleryImage, ProjectCard, ServiceCard } from '@/lib/types';
import { ProjectTile, ServiceTile } from '@/sections/cards';
import { GalleryGrid } from '@/sections/showcase';
import { FaqList, faqJsonLd } from '@/sections/social';
import { ArrowLink, cardGrid } from '@/sections/ui';
import { cn } from '@/lib/cn';
import { BlockTitle, GridSkeleton, ImageHero, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';
import { stripLead } from './Events';

export function ServicesIndex() {
  const q = useQuery({ queryKey: ['public-services'], queryFn: () => api.get<ServiceCard[]>('/public/services') });
  return (
    <>
      <Seo title="Services" description="Complete event planning or specialist services — design, production, hospitality and more." />
      <PageHeader eyebrow="Services" title="Everything, orchestrated" intro="Engage us for complete planning, or for the specialist services your celebration needs." crumbs={[{ label: 'Home', href: '/' }, { label: 'Services' }]} />
      <section className="container-site pb-section">
        {q.isLoading ? (
          <GridSkeleton aspect="aspect-[3/2]" />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Services coming soon" body="Tell us about your event and we will tailor a team for it." />
        ) : (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {q.data.map((s, i) => (
              <motion.div key={s.id} variants={staggerItem} className="h-full">
                <ServiceTile s={s} index={i} />
              </motion.div>
            ))}
          </Stagger>
        )}
      </section>
      <InquiryBand title="Not sure where to begin?" body="Our planners will recommend the right mix of services for your occasion." href="/inquire" />
    </>
  );
}

interface ServiceDetailData {
  id: string;
  slug: string;
  name: string;
  summary: string;
  body: string;
  icon: string;
  coverImage: string;
  coverAlt: string;
  gallery: GalleryImage[];
  features: string[];
  faqs: { question: string; answer: string }[];
  seo: { title?: string; description?: string; image?: string };
  categories: { slug: string; name: string }[];
  projects: ProjectCard[];
  related: { slug: string; name: string; summary: string; coverImage: string; coverAlt: string; icon: string }[];
}

export function ServiceDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public-service', slug], queryFn: () => api.get<ServiceDetailData>(`/public/services/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton hero />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="We couldn’t find that service" /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data!;
  const gallery = (s.gallery ?? []).filter((g) => g.url);
  const faqs = (s.faqs ?? []).filter((f) => f.question && f.answer);
  const body = stripLead(s.body, s.summary);
  return (
    <>
      <Seo title={s.seo?.title || s.name} description={s.seo?.description || s.summary} image={s.seo?.image || s.coverImage} jsonLd={faqs.length ? faqJsonLd(faqs) : undefined} />
      <ImageHero image={s.coverImage} alt={s.coverAlt || s.name} eyebrow="Services" title={s.name} height="medium" crumbs={[{ label: 'Home', href: '/' }, { label: 'Services', href: '/services' }, { label: s.name }]} />

      <section className="section">
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <Icon name={s.icon} className="mb-8 h-10 w-10 text-primary" strokeWidth={1} />
            {s.summary && <p className="font-heading text-[clamp(1.6rem,2.6vw,2.3rem)] leading-snug">{s.summary}</p>}
            {body && <Markdown className="mt-10 text-[1.04rem] leading-[1.85]">{body}</Markdown>}
          </Reveal>
          <Reveal delay={0.15} className="space-y-8 lg:col-span-4 lg:col-start-9">
            {s.features.length > 0 && (
              <div className="card p-8 md:p-10">
                <p className="eyebrow mb-6">What’s included</p>
                <ol className="space-y-5">
                  {s.features.map((f, i) => (
                    <li key={i} className="flex gap-5 border-b border-line pb-5 last:border-0 last:pb-0">
                      <span className="font-heading text-sm text-primary">{String(i + 1).padStart(2, '0')}</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {s.categories.length > 0 && (
              <div>
                <p className="eyebrow mb-4">Popular for</p>
                <div className="flex flex-wrap gap-2">
                  {s.categories.map((c) => (
                    <Link key={c.slug} to={`/events/${c.slug}`} className="chip text-xs">
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <Link to="/inquire" className="btn btn-primary w-full">
              Inquire about {s.name.toLowerCase()}
            </Link>
          </Reveal>
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="section bg-variant-surface" aria-label="Gallery">
          <div className="container-site">
            <BlockTitle eyebrow="Gallery" title="In detail" />
            <GalleryGrid images={gallery} variant="grid" label={`${s.name} gallery`} />
          </div>
        </section>
      )}

      {s.projects.length > 0 && (
        <section className="section" aria-label="Related projects">
          <div className="container-site">
            <BlockTitle eyebrow="Selected work" title="Where we delivered this" />
            <Stagger className={cn('grid gap-x-8 gap-y-14', cardGrid(s.projects.length, 4))}>
              {s.projects.map((p) => (
                <motion.div key={p.id} variants={staggerItem}>
                  <ProjectTile p={p} />
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
              <h2 className="t-h2">Good to know</h2>
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <FaqList items={faqs} />
            </div>
          </div>
        </section>
      )}

      {s.related.length > 0 && (
        <section className="section" aria-label="Related services">
          <div className="container-site">
            <BlockTitle
              eyebrow="Also from the studio"
              title="Related services"
              aside={
                <Link to="/services" className="group">
                  <ArrowLink>All services</ArrowLink>
                </Link>
              }
            />
            <div className="grid gap-8 md:grid-cols-3">
              {s.related.map((r) => (
                <Link key={r.slug} to={`/services/${r.slug}`} className="group block">
                  <div className="aspect-[3/2] overflow-hidden rounded-theme-img bg-surface">
                    <Img src={r.coverImage} alt={r.coverAlt || r.name} width={700} sizes="(max-width: 768px) 100vw, 33vw" className="h-full w-full object-cover transition-transform duration-[1.4s] ease-lux group-hover:scale-[1.05]" fallbackClassName="h-full w-full" />
                  </div>
                  <h3 className="t-h4 mt-5 font-heading group-hover:text-primary">{r.name}</h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{r.summary}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <InquiryBand title="Let’s talk about your event" body="Tell us what you are planning — we will shape the right team and proposal." href="/inquire" image={gallery[0]?.url} />
    </>
  );
}
