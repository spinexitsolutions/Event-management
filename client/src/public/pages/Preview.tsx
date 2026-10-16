import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import { parseSectionForRender, SECTION_META, type Section, type SectionType } from '@maison/shared';
import { HeaderSpacer, useTransparentHeader } from '@/components/layout/PublicLayout';
import { Seo } from '@/components/ui/Seo';
import { api, ApiError } from '@/lib/api';
import type { PublicPage } from '@/lib/types';
import { SectionRenderer, startsWithDarkHero } from '@/sections/registry';
import { PageError, PageSkeleton } from '../components/page';
import { CmsPageView } from './CmsPage';

type Entry = { ok: true; section: Section } | { ok: false; id: string; type: string };

const NoIndex = () => (
  <Helmet>
    <meta name="robots" content="noindex,nofollow" />
  </Helmet>
);

function highlight(id: string) {
  const el = document.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.style.transition = 'outline-color 0.6s ease';
  el.style.outline = '2px solid rgb(var(--c-primary))';
  el.style.outlineOffset = '-2px';
  window.setTimeout(() => {
    el.style.outlineColor = 'transparent';
  }, 1400);
  window.setTimeout(() => {
    el.style.outline = '';
    el.style.outlineOffset = '';
  }, 2100);
}

function IncompleteSection({ id, type }: { id: string; type: string }) {
  const label = SECTION_META[type as SectionType]?.label ?? type;
  return (
    <div data-section-id={id} className="container-site py-8">
      <div className="rounded-theme-img border border-dashed border-warning/70 bg-warning/5 px-6 py-6 text-center text-sm">
        <p className="font-medium text-ink">Incomplete section · {label}</p>
        <p className="mt-1 text-muted">Fill in the required fields to see it here. It will not appear on the live site until it is complete.</p>
      </div>
    </div>
  );
}

/** Draft page preview for the CMS builder (inside the admin iframe). */
export function PagePreview() {
  const { pageId = '' } = useParams();
  const q = useQuery({ queryKey: ['cms-preview', pageId], queryFn: () => api.get<PublicPage & { invalidSections?: number }>(`/admin/cms/pages/${encodeURIComponent(pageId)}/preview`), retry: false });
  const [draft, setDraft] = useState<Entry[] | null>(null);
  const refetch = q.refetch;

  const onMessage = useCallback(
    (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || e.data.source !== 'maison-admin') return;
      const msg = e.data as { type: string; sections?: unknown[]; sectionId?: string };
      if (msg.type === 'preview-sections' && Array.isArray(msg.sections)) {
        setDraft(
          msg.sections.map((raw) => {
            const parsed = parseSectionForRender(raw);
            if (parsed) return { ok: true as const, section: parsed };
            const r = (raw ?? {}) as { id?: string; type?: string; enabled?: boolean };
            return { ok: false as const, id: String(r.id ?? Math.random()), type: String(r.type ?? 'section') };
          }),
        );
      } else if (msg.type === 'scroll-to' && msg.sectionId) {
        highlight(msg.sectionId);
      } else if (msg.type === 'refresh') {
        // Keep the posted draft; refetching only refreshes data for data-backed sections.
        void refetch();
      }
    },
    [refetch],
  );
  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMessage]);

  const entries: Entry[] = draft ?? (q.data?.sections ?? []).map((s) => ({ ok: true as const, section: s }));
  const visible = entries.filter((e) => !e.ok || e.section.enabled);
  const sections = visible.filter((e): e is { ok: true; section: Section } => e.ok).map((e) => e.section);
  const dark = visible[0]?.ok === true && startsWithDarkHero(sections);
  useTransparentHeader(dark);

  if (q.isLoading)
    return (
      <>
        <NoIndex />
        <PageSkeleton />
      </>
    );
  if (q.error) {
    const auth = q.error instanceof ApiError && [401, 403].includes(q.error.status);
    return (
      <>
        <NoIndex />
        <Seo title="Preview" noIndex />
        {auth ? (
          <>
            <HeaderSpacer />
            <div className="container-site flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
              <p className="eyebrow mb-4">Preview</p>
              <h1 className="t-h2">Previews are for the studio team</h1>
              <p className="lead mt-4 max-w-md">Please sign in with a staff account that can edit pages to see unpublished drafts.</p>
              <Link to={`/login?next=${encodeURIComponent(window.location.pathname)}`} className="btn btn-primary mt-8">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        )}
      </>
    );
  }
  const data = q.data?.data ?? {};
  let index = 0;
  return (
    <>
      <NoIndex />
      <Seo title={`Preview · ${q.data?.title ?? ''}`} noIndex />
      {!dark && <HeaderSpacer />}
      {visible.length === 0 && (
        <div className="container-site py-32 text-center text-muted">
          <p className="t-h3 font-heading text-ink">This page has no sections yet</p>
          <p className="mt-2 text-sm">Add a section in the builder to start designing.</p>
        </div>
      )}
      {visible.map((e) => (e.ok ? <SectionRenderer key={e.section.id} section={e.section} data={data[e.section.id]} index={index++} preview /> : <IncompleteSection key={e.id} id={e.id} type={e.type} />))}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 bg-black/75 px-3 py-1.5 font-admin text-[11px] font-medium uppercase tracking-wider text-white backdrop-blur">Draft preview</div>
    </>
  );
}

/** Published homepage for the theme editor preview (SiteProvider applies draft theme messages). */
export function SitePreview() {
  return (
    <>
      <NoIndex />
      <CmsPageView slug="home" />
    </>
  );
}
