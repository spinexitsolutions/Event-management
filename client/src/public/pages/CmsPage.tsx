import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { HeaderSpacer, useTransparentHeader } from '@/components/layout/PublicLayout';
import { Seo } from '@/components/ui/Seo';
import { api } from '@/lib/api';
import type { PublicPage } from '@/lib/types';
import { PageRenderer, startsWithDarkHero } from '@/sections/registry';
import { isNotFound, NotFoundView, PageError, PageSkeleton } from '../components/page';

export function usePublicPage(slug: string) {
  return useQuery({ queryKey: ['public-page', slug], queryFn: () => api.get<PublicPage>(`/public/pages/${encodeURIComponent(slug)}`) });
}

/** Renders a published CMS page (home, about, contact, legal and any custom page). */
export function CmsPageView({ slug }: { slug: string }) {
  const q = usePublicPage(slug);
  const dark = !!q.data && startsWithDarkHero(q.data.sections);
  useTransparentHeader(dark || (q.isLoading && slug === 'home'));
  if (q.isLoading) return <PageSkeleton hero={slug === 'home'} />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const page = q.data!;
  return (
    <>
      <Seo title={slug === 'home' ? page.seo?.title || undefined : page.seo?.title || page.title} description={page.seo?.description} image={page.seo?.image || page.featuredImage} noIndex={page.seo?.noIndex} />
      {!dark && <HeaderSpacer />}
      <PageRenderer page={page} />
    </>
  );
}

export default function CmsPage({ slug: fixed }: { slug?: string }) {
  const { slug = '' } = useParams();
  return <CmsPageView key={fixed ?? slug} slug={fixed ?? slug} />;
}

export const HomePage = () => <CmsPageView slug="home" />;
export const AboutPage = () => <CmsPageView slug="about" />;
export const ContactPage = () => <CmsPageView slug="contact" />;
