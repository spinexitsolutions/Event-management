import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useSite } from '@/app/SiteProvider';
import { Img } from '@/components/ui/Img';
import { Markdown } from '@/components/ui/Markdown';
import { Reveal } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/lib/format';
import type { PostCard } from '@/lib/types';
import { PostTile } from '@/sections/cards';
import { BlockTitle, Breadcrumbs, GridSkeleton, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';
import { HeaderSpacer } from '@/components/layout/PublicLayout';

const PER_PAGE = 9;

export function JournalIndex() {
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = useQuery({ queryKey: ['public-blog', tag, page], queryFn: () => api.getPaged<PostCard[]>('/public/blog', { tag, page, limit: PER_PAGE }), placeholderData: keepPreviousData });
  const tagsQ = useQuery({ queryKey: ['public-blog-tags'], queryFn: () => api.get<PostCard[]>('/public/blog', { limit: 100 }), staleTime: 300_000 });
  const tags = [...new Set((tagsQ.data ?? []).flatMap((p) => p.tags ?? []))].sort();
  const pages = q.data?.meta?.pages ?? 1;
  const posts = q.data?.data ?? [];
  const go = (patch: { tag?: string; page?: number }) => {
    const next = new URLSearchParams();
    const t = patch.tag ?? tag;
    const pg = patch.page ?? 1;
    if (t) next.set('tag', t);
    if (pg > 1) next.set('page', String(pg));
    setParams(next);
  };
  const [lead, ...rest] = page === 1 && !tag ? posts : [undefined, ...posts];
  return (
    <>
      <Seo title={tag ? `Journal · ${tag}` : 'Journal'} description="Notes, inspiration and news from the studio." />
      <PageHeader eyebrow="Journal" title="Notes from the studio" intro="Inspiration, behind-the-scenes stories and planning wisdom from our planners and designers." crumbs={[{ label: 'Home', href: '/' }, { label: 'Journal' }]}>
        {tags.length > 0 && (
          <div className="mt-12 flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
            <button type="button" className="chip text-xs" data-active={!tag} aria-pressed={!tag} onClick={() => go({ tag: '' })}>
              All stories
            </button>
            {tags.map((t) => (
              <button key={t} type="button" className="chip text-xs capitalize" data-active={tag === t} aria-pressed={tag === t} onClick={() => go({ tag: tag === t ? '' : t })}>
                {t}
              </button>
            ))}
          </div>
        )}
      </PageHeader>
      <section className="container-site pb-section">
        {q.isLoading ? (
          <GridSkeleton aspect="aspect-[4/3]" />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !posts.length ? (
          <EmptyState title={tag ? 'No stories with this topic yet' : 'The journal is being written'} body="Please check back soon." />
        ) : (
          <div className={cn('transition-opacity', q.isPlaceholderData && 'opacity-60')}>
            {lead && (
              <Reveal className="mb-20">
                <Link to={`/journal/${lead.slug}`} className="group grid items-center gap-10 lg:grid-cols-12">
                  <div className="aspect-[16/10] overflow-hidden rounded-theme-img bg-surface lg:col-span-7">
                    <Img src={lead.coverImage} alt={lead.coverAlt || lead.title} width={1400} priority sizes="(max-width: 1024px) 100vw, 58vw" className="h-full w-full object-cover transition-transform duration-[1.6s] ease-lux group-hover:scale-[1.04]" fallbackClassName="h-full w-full" />
                  </div>
                  <div className="lg:col-span-5">
                    <p className="eyebrow">Latest · {fmtDate(lead.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <h2 className="t-h1 mt-5 transition-colors group-hover:text-primary">{lead.title}</h2>
                    {lead.excerpt && <p className="lead mt-5">{lead.excerpt}</p>}
                    {lead.authorName && <p className="mt-6 text-sm text-muted">By {lead.authorName}</p>}
                  </div>
                </Link>
              </Reveal>
            )}
            <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
              {rest.filter(Boolean).map((p, i) => (
                <Reveal key={p!.id} delay={(i % 3) * 0.08}>
                  <PostTile p={p!} />
                </Reveal>
              ))}
            </div>
            {pages > 1 && (
              <nav className="mt-20 flex items-center justify-center gap-2" aria-label="Pagination">
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-primary disabled:opacity-30" disabled={page <= 1} onClick={() => go({ page: page - 1 })} aria-label="Previous page">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" onClick={() => go({ page: n })} aria-current={n === page ? 'page' : undefined} className={cn('h-11 min-w-11 rounded-full px-3 text-sm transition', n === page ? 'bg-primary text-on-primary' : 'hover:text-primary')}>
                    {n}
                  </button>
                ))}
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-line hover:border-primary disabled:opacity-30" disabled={page >= pages} onClick={() => go({ page: page + 1 })} aria-label="Next page">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        )}
      </section>
    </>
  );
}

interface Article extends PostCard {
  body: string;
  seo: { title?: string; description?: string; image?: string };
  updatedAt: string;
  more: { slug: string; title: string; coverImage: string; coverAlt: string; publishedAt: string }[];
}

export function ArticlePage() {
  const { slug = '' } = useParams();
  const { site } = useSite();
  const q = useQuery({ queryKey: ['public-article', slug], queryFn: () => api.get<Article>(`/public/blog/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="We couldn’t find that story" /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data!;
  const origin = site?.seo.siteUrl || window.location.origin;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': a.kind === 'NEWS' ? 'NewsArticle' : 'BlogPosting',
    headline: a.title,
    description: a.seo?.description || a.excerpt,
    image: a.coverImage ? [a.coverImage.startsWith('http') ? a.coverImage : `${origin}${a.coverImage}`] : undefined,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    author: a.authorName ? { '@type': 'Person', name: a.authorName } : { '@type': 'Organization', name: site?.brand.name },
    publisher: { '@type': 'Organization', name: site?.brand.name, ...(site?.brand.logoUrl ? { logo: { '@type': 'ImageObject', url: site.brand.logoUrl.startsWith('http') ? site.brand.logoUrl : `${origin}${site.brand.logoUrl}` } } : {}) },
    mainEntityOfPage: `${origin}/journal/${a.slug}`,
    keywords: a.tags?.join(', ') || undefined,
  };
  return (
    <>
      <Seo title={a.seo?.title || a.title} description={a.seo?.description || a.excerpt} image={a.seo?.image || a.coverImage} jsonLd={jsonLd} />
      <HeaderSpacer />
      <article>
        <header className="container-site pb-14 pt-16 md:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="flex justify-center">
              <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Journal', href: '/journal' }, { label: a.kind === 'NEWS' ? 'News' : 'Story' }]} />
            </div>
            <h1 className="t-h1 mt-10 text-balance">{a.title}</h1>
            {a.excerpt && <p className="lead mx-auto mt-6 max-w-2xl">{a.excerpt}</p>}
            <p className="mt-8 text-[0.7rem] uppercase text-muted" style={{ letterSpacing: '0.22em' }}>
              {fmtDate(a.publishedAt, { day: 'numeric', month: 'long', year: 'numeric' })}
              {a.authorName && ` · ${a.authorName}`}
            </p>
          </div>
        </header>
        {a.coverImage && (
          <div className="container-site">
            <div className="aspect-[16/9] overflow-hidden rounded-theme-img bg-surface">
              <Img src={a.coverImage} alt={a.coverAlt || a.title} priority width={2000} sizes="(max-width: 1344px) 100vw, 1344px" className="h-full w-full object-cover" fallbackClassName="h-full w-full" />
            </div>
          </div>
        )}
        <div className="container-site py-16 md:py-24">
          <Markdown className="mx-auto max-w-[44rem] text-[1.08rem] leading-[1.9] [&>p:first-child]:first-letter:float-left [&>p:first-child]:first-letter:mr-3 [&>p:first-child]:first-letter:font-heading [&>p:first-child]:first-letter:text-[4.2rem] [&>p:first-child]:first-letter:leading-[0.85] [&>p:first-child]:first-letter:text-primary">
            {a.body}
          </Markdown>
          {!!a.tags?.length && (
            <div className="mx-auto mt-14 flex max-w-[44rem] flex-wrap gap-2 border-t border-line pt-8">
              {a.tags.map((t) => (
                <Link key={t} to={`/journal?tag=${encodeURIComponent(t)}`} className="chip text-xs capitalize">
                  {t}
                </Link>
              ))}
            </div>
          )}
        </div>
      </article>
      {a.more.length > 0 && (
        <section className="section bg-variant-surface" aria-label="More stories">
          <div className="container-site">
            <BlockTitle eyebrow="Keep reading" title="More from the journal" />
            <div className="grid gap-x-8 gap-y-14 md:grid-cols-3">
              {a.more.map((m) => (
                <PostTile key={m.slug} p={{ id: m.slug, slug: m.slug, title: m.title, coverImage: m.coverImage, coverAlt: m.coverAlt, publishedAt: m.publishedAt, excerpt: '' }} />
              ))}
            </div>
          </div>
        </section>
      )}
      <InquiryBand title="Inspired? Let’s plan yours." href="/inquire" />
    </>
  );
}
