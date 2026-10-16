import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronsLeftRight, Search, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { GalleryImage, ProjectCard } from '@/lib/types';
import { ProjectTile, Stars } from '@/sections/cards';
import { GalleryGrid } from '@/sections/showcase';
import { VideoPlayer } from '@/sections/ui';
import { BlockTitle, GridSkeleton, ImageHero, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';

const PAGE_SIZE = 12;
type Sort = 'featured' | 'recent' | 'oldest';

export function PortfolioIndex() {
  const { bootstrap } = useSite();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const city = params.get('city') ?? '';
  const sort = (params.get('sort') as Sort) || 'featured';
  const qParam = params.get('q') ?? '';
  const [search, setSearch] = useState(qParam);
  const searchId = useId();

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v && !(k === 'sort' && v === 'featured')) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // Debounced search → URL.
  useEffect(() => {
    if (search === qParam) return;
    const t = setTimeout(() => update({ q: search.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => setSearch(qParam), [qParam]);

  const q = useInfiniteQuery({
    queryKey: ['public-portfolio', { category, city, sort, q: qParam }],
    queryFn: ({ pageParam }) => api.getPaged<ProjectCard[]>('/public/portfolio', { page: pageParam, limit: PAGE_SIZE, category, city, sort, q: qParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.pages ? last.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  const meta = q.data?.pages[0]?.meta;
  const cities = (meta?.cities as string[] | undefined) ?? [];
  const total = meta?.total ?? 0;
  const filtered = !!(category || city || qParam);
  const catName = bootstrap?.categories.find((c) => c.slug === category)?.name;

  return (
    <>
      <Seo title={catName ? `${catName} — Portfolio` : 'Portfolio'} description="Selected weddings, celebrations and brand experiences we have designed and produced." />
      <PageHeader eyebrow="Portfolio" title="Celebrations we have composed" intro="A selection of events we have designed and produced, shared with our clients’ permission." crumbs={[{ label: 'Home', href: '/' }, { label: 'Portfolio' }]} />

      <section className="container-site pb-section">
        {/* Filters */}
        <div className="sticky top-[calc(var(--header-h)+var(--announce-h,0px))] z-20 -mx-5 mb-12 border-y border-line bg-bg/90 px-5 py-4 backdrop-blur-xl sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:flex-1 lg:flex-wrap lg:overflow-visible lg:pb-0" role="group" aria-label="Filter by occasion">
              <button type="button" className="chip shrink-0 text-xs" data-active={!category} onClick={() => update({ category: '' })} aria-pressed={!category}>
                All
              </button>
              {bootstrap?.categories.map((c) => (
                <button key={c.slug} type="button" className="chip shrink-0 whitespace-nowrap text-xs" data-active={category === c.slug} aria-pressed={category === c.slug} onClick={() => update({ category: category === c.slug ? '' : c.slug })}>
                  {c.name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center lg:shrink-0">
              <label className="relative col-span-2 sm:w-56">
                <span className="sr-only" id={searchId}>
                  Search projects
                </span>
                <Search className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <input type="search" aria-labelledby={searchId} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search venue, theme…" className="field-input py-2 pl-7 text-sm" />
              </label>
              <label>
                <span className="sr-only">City</span>
                <select value={city} onChange={(e) => update({ city: e.target.value })} className="field-input cursor-pointer py-2 text-sm [&>option]:bg-surface [&>option]:text-ink">
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="sr-only">Sort</span>
                <select value={sort} onChange={(e) => update({ sort: e.target.value })} className="field-input cursor-pointer py-2 text-sm [&>option]:bg-surface [&>option]:text-ink">
                  <option value="featured">Featured first</option>
                  <option value="recent">Most recent</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="mb-8 flex min-h-[1.5rem] items-center justify-between text-sm text-muted" aria-live="polite">
          {!q.isLoading && !q.error && (
            <span>
              {total} {total === 1 ? 'project' : 'projects'}
              {catName ? ` · ${catName}` : ''}
              {city ? ` · ${city}` : ''}
              {qParam ? ` · “${qParam}”` : ''}
            </span>
          )}
          {filtered && (
            <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="flex items-center gap-1.5 text-xs uppercase hover:text-primary" style={{ letterSpacing: '0.18em' }}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>

        {q.isLoading ? (
          <GridSkeleton />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !items.length ? (
          <EmptyState title={filtered ? 'No projects match these filters' : 'Our portfolio is being curated'} body={filtered ? 'Try another occasion or city, or clear the filters.' : 'Please check back soon.'} action={filtered ? <button className="btn btn-secondary btn-sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button> : undefined} />
        ) : (
          <>
            <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p, i) => (
                <Reveal key={p.id} delay={(i % 3) * 0.08}>
                  <ProjectTile p={p} />
                </Reveal>
              ))}
            </div>
            {q.hasNextPage && (
              <div className="mt-20 flex flex-col items-center gap-4">
                <p className="text-xs text-muted">
                  Showing {items.length} of {total}
                </p>
                <button type="button" className="btn btn-secondary" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                  {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
      <InquiryBand title="Imagine your celebration here" href="/inquire" />
    </>
  );
}

/* ───────────── Project detail ───────────── */

interface ProjectDetailData extends ProjectCard {
  story: string;
  guestCount: number | null;
  theme: string;
  concept: string;
  gallery: GalleryImage[];
  beforeAfter: { beforeUrl: string; afterUrl: string; caption?: string }[];
  videoUrl: string;
  seo: { title?: string; description?: string; image?: string };
  services: { slug: string; name: string }[];
  testimonials: { id: string; clientName: string; eventLabel: string; quote: string; rating: number | null }[];
  related: ProjectCard[];
}

/** Accessible before/after comparison: a native range input drives the reveal. */
export function BeforeAfter({ before, after, caption }: { before: string; after: string; caption?: string }) {
  const [pos, setPos] = useState(50);
  const id = useId();
  return (
    <figure>
      <div className="relative aspect-[16/10] select-none overflow-hidden rounded-theme-img bg-surface">
        <Img src={after} alt={caption ? `After: ${caption}` : 'After'} width={1600} className="absolute inset-0 h-full w-full object-cover" fallbackClassName="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <Img src={before} alt={caption ? `Before: ${caption}` : 'Before'} width={1600} className="h-full w-full object-cover" fallbackClassName="h-full w-full bg-surface-2" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-white shadow-[0_0_12px_rgba(0,0,0,0.4)]" style={{ left: `${pos}%` }} aria-hidden>
          <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-black/40 text-white backdrop-blur">
            <ChevronsLeftRight className="h-4 w-4" />
          </span>
        </div>
        <span className="pointer-events-none absolute left-4 top-4 bg-black/60 px-2.5 py-1 text-[0.6rem] uppercase text-white" style={{ letterSpacing: '0.2em' }}>
          Before
        </span>
        <span className="pointer-events-none absolute right-4 top-4 bg-black/60 px-2.5 py-1 text-[0.6rem] uppercase text-white" style={{ letterSpacing: '0.2em' }}>
          After
        </span>
        <label htmlFor={id} className="sr-only">
          Compare before and after{caption ? `: ${caption}` : ''}
        </label>
        <input id={id} type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-valuetext={`${pos}% before image shown`} className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0 focus-visible:opacity-0 [&:focus-visible+span]:opacity-100" />
        <span className="pointer-events-none absolute inset-0 rounded-theme-img opacity-0 outline outline-2 -outline-offset-2 outline-primary" aria-hidden />
      </div>
      {caption && <figcaption className="mt-3 text-sm text-muted">{caption}</figcaption>}
    </figure>
  );
}

export function ProjectDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public-project', slug], queryFn: () => api.get<ProjectDetailData>(`/public/portfolio/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton hero />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="We couldn’t find that project" /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data!;
  const gallery = (p.gallery ?? []).filter((g) => g.url);
  const ba = (p.beforeAfter ?? []).filter((b) => b.beforeUrl && b.afterUrl);
  const metaItems: [string, string][] = (
    [
      ['Date', p.eventDate ? fmtDate(p.eventDate, { day: 'numeric', month: 'long', year: 'numeric' }) : ''],
      ['Venue', p.venueName],
      ['City', p.city],
      ['Guests', p.guestCount ? p.guestCount.toLocaleString() : ''],
      ['Theme', p.theme],
    ] as [string, string][]
  ).filter(([, v]) => v);
  return (
    <>
      <Seo
        title={p.seo?.title || p.title}
        description={p.seo?.description || p.summary}
        image={p.seo?.image || p.coverImage}
        jsonLd={{ '@context': 'https://schema.org', '@type': 'Event', name: p.title, ...(p.eventDate ? { startDate: p.eventDate.slice(0, 10) } : {}), ...(p.venueName || p.city ? { location: { '@type': 'Place', name: p.venueName || p.city, address: p.city } } : {}), image: p.coverImage || undefined, description: p.summary }}
      />
      <ImageHero image={p.coverImage} alt={p.coverAlt || p.title} eyebrow={[p.category?.name, p.city].filter(Boolean).join(' · ') || 'Portfolio'} title={p.title} crumbs={[{ label: 'Home', href: '/' }, { label: 'Portfolio', href: '/portfolio' }, { label: p.title }]} />

      {metaItems.length > 0 && (
        <div className="border-b border-line">
          <dl className="container-site grid grid-cols-1 grid-cols-2 gap-y-6 py-8 sm:grid-cols-3 lg:flex lg:justify-between">
            {metaItems.map(([k, v]) => (
              <div key={k} className="pr-6">
                <dt className="text-[0.66rem] uppercase text-muted" style={{ letterSpacing: '0.24em' }}>
                  {k}
                </dt>
                <dd className="mt-1.5 font-heading text-lg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <section className="section">
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <p className="eyebrow mb-6">The story</p>
            {p.summary && <p className="font-heading text-[clamp(1.6rem,2.6vw,2.3rem)] leading-snug">{p.summary}</p>}
            {p.story && <Markdown className="mt-10 text-[1.04rem] leading-[1.85]">{p.story}</Markdown>}
          </Reveal>
          <Reveal delay={0.15} className="space-y-10 lg:col-span-4 lg:col-start-9">
            {p.concept && (
              <div className="border-l border-primary pl-6">
                <p className="eyebrow mb-4">Design concept</p>
                <p className="font-heading text-xl italic leading-relaxed">{p.concept}</p>
              </div>
            )}
            {p.services.length > 0 && (
              <div>
                <p className="eyebrow mb-4">Services delivered</p>
                <ul className="divide-y divide-line border-y border-line">
                  {p.services.map((s) => (
                    <li key={s.slug}>
                      <Link to={`/services/${s.slug}`} className="flex items-center justify-between py-3 text-sm transition-colors hover:text-primary">
                        {s.name} <span aria-hidden>→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {gallery.length > 0 && (
        <section className="pb-section" aria-label="Gallery">
          <div className="container-site">
            <GalleryGrid images={gallery} variant="masonry" label={`${p.title} gallery`} />
          </div>
        </section>
      )}

      {p.videoUrl && (
        <section className="section bg-variant-surface" aria-label="Film">
          <div className="container-site">
            <BlockTitle eyebrow="The film" title="Relive the day" />
            <VideoPlayer url={p.videoUrl} poster={gallery[0]?.url || p.coverImage} title={`${p.title} film`} />
          </div>
        </section>
      )}

      {ba.length > 0 && (
        <section className="section" aria-label="Before and after">
          <div className="container-site">
            <BlockTitle eyebrow="Transformation" title="Before & after" />
            <div className={cn('grid gap-10', ba.length > 1 && 'lg:grid-cols-2')}>
              {ba.map((b, i) => (
                <BeforeAfter key={i} before={b.beforeUrl} after={b.afterUrl} caption={b.caption} />
              ))}
            </div>
          </div>
        </section>
      )}

      {p.testimonials.length > 0 && (
        <section className="section bg-variant-surface" aria-label="Client words">
          <div className="container-site mx-auto max-w-4xl space-y-20 text-center">
            {p.testimonials.map((t) => (
              <Reveal key={t.id}>
                <figure>
                  <span className="block font-heading text-7xl leading-none text-primary" aria-hidden>
                    “
                  </span>
                  <blockquote className="t-h2 mt-2 text-balance font-heading italic">{t.quote}</blockquote>
                  <figcaption className="mt-8 flex flex-col items-center gap-2">
                    <span className="font-medium">{t.clientName}</span>
                    {t.eventLabel && <span className="text-sm text-muted">{t.eventLabel}</span>}
                    <Stars rating={t.rating} />
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {p.related.length > 0 && (
        <section className="section" aria-label="Related projects">
          <div className="container-site">
            <BlockTitle eyebrow="More stories" title="You may also love" />
            <Stagger className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {p.related.map((r) => (
                <motion.div key={r.id} variants={staggerItem}>
                  <ProjectTile p={r} />
                </motion.div>
              ))}
            </Stagger>
          </div>
        </section>
      )}

      <InquiryBand title="Let’s create your story" body="Share a few details and a senior planner will be in touch within one business day." href="/inquire" image={gallery[1]?.url || p.coverImage} />
    </>
  );
}
