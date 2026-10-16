import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { RESERVED_SLUGS, type Seo } from '@maison/shared';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Field, Input, Toggle } from '@/admin/ui';
import { useSite } from '@/app/SiteProvider';
import { api, ApiError, errorMessage } from '@/lib/api';
import { CharCount, Callout, FieldGroup } from '../components/bits';
import { CountedTextarea } from '../components/inputs';
import { ImageField } from '../components/MediaFields';
import type { PageRow } from '../lib/types';
import { publicPath } from '../lib/util';

export interface PageMeta {
  title: string;
  seo: Seo;
  featuredImage: string;
}

export function PageSettingsDrawer({ open, onClose, page, meta, onChange, errors }: { open: boolean; onClose: () => void; page: PageRow; meta: PageMeta; onChange: (m: PageMeta) => void; errors: Record<string, string> }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { site } = useSite();
  const [slug, setSlug] = useState(page.slug);
  const [slugError, setSlugError] = useState<string>();
  useEffect(() => {
    setSlug(page.slug);
    setSlugError(undefined);
  }, [page.slug, open]);
  const fixedUrl = ['HOME', 'ABOUT', 'CONTACT'].includes(page.kind);
  const saveSlug = useMutation({
    mutationFn: () => api.patch<PageRow>(`/admin/cms/pages/${page.id}/meta`, { slug }),
    onSuccess: () => {
      toast.success('Page URL updated', `The page now lives at /${slug}. Update any links that pointed to the old URL.`);
      void qc.invalidateQueries({ queryKey: ['cms-page', page.id] });
      void qc.invalidateQueries({ queryKey: ['cms-pages'] });
    },
    onError: (e) => {
      setSlugError(e instanceof ApiError && e.status === 409 ? 'Another page already uses this URL' : errorMessage(e));
    },
  });
  const seo = meta.seo;
  const setSeo = (p: Partial<Seo>) => onChange({ ...meta, seo: { ...seo, ...p } });
  const tpl = site?.seo.titleTemplate || '%s';
  const shownTitle = tpl.replace('%s', seo.title || meta.title || 'Page title');
  const shownDesc = seo.description || site?.seo.description || 'Add a description so search engines show a helpful summary.';
  const localSlugError = !slug ? 'Required' : RESERVED_SLUGS.includes(slug) ? 'This URL is used by a built-in page' : !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? 'Use lowercase letters, numbers and hyphens' : undefined;
  return (
    <Modal open={open} onClose={onClose} title="Page settings" side>
      <div className="space-y-8">
        <FieldGroup title="Page">
          <Field label="Title" required error={errors['meta.title']} hint="Used in the admin, the browser tab and as the default SEO title.">
            <Input value={meta.title} maxLength={120} onChange={(e) => onChange({ ...meta, title: e.target.value })} invalid={!!errors['meta.title'] || !meta.title.trim()} />
          </Field>
          <Field label="Page URL" error={slugError ?? (slug !== page.slug ? localSlugError : undefined)} hint={fixedUrl ? `This built-in page always lives at ${publicPath(page)}.` : 'Changing the URL takes effect immediately (it is not part of the draft).'}>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center rounded-lg border border-adm-line bg-adm-bg/60">
                <span className="pl-3 text-sm text-adm-muted">/</span>
                <input className="w-full bg-transparent px-1 py-2 text-sm outline-none disabled:text-adm-muted" value={fixedUrl ? publicPath(page).slice(1) : slug} disabled={fixedUrl} maxLength={80} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} aria-label="Page URL" />
              </div>
              {!fixedUrl && (
                <button type="button" className="adm-btn-secondary" disabled={slug === page.slug || !!localSlugError || saveSlug.isPending} onClick={() => saveSlug.mutate()}>
                  {saveSlug.isPending ? 'Saving…' : 'Change URL'}
                </button>
              )}
            </div>
          </Field>
          <Field label="Featured image" hint="Used when this page is shown as a card or shared, if no SEO image is set." error={errors['meta.featuredImage']}>
            <ImageField value={meta.featuredImage} onChange={(featuredImage) => onChange({ ...meta, featuredImage })} label="featured image" />
          </Field>
        </FieldGroup>

        <FieldGroup title="Search & sharing" description="How this page appears in Google and when shared on WhatsApp, LinkedIn and social media.">
          <div className="rounded-lg border border-adm-line bg-white p-3" aria-label="Search result preview">
            <p className="truncate text-xs text-emerald-800">
              {(site?.seo.siteUrl || window.location.origin).replace(/\/$/, '')}
              {publicPath(page)}
            </p>
            <p className="truncate text-[17px] leading-snug text-[#1a0dab]">{shownTitle}</p>
            <p className="line-clamp-2 text-xs text-neutral-600">{shownDesc}</p>
          </div>
          <Field label={<span className="flex items-center justify-between">SEO title <CharCount value={seo.title ?? ''} max={70} recommended={60} /></span>} hint="Leave empty to use the page title. About 50–60 characters is ideal." error={errors['meta.seo.title']}>
            <Input value={seo.title ?? ''} maxLength={70} onChange={(e) => setSeo({ title: e.target.value })} />
          </Field>
          <Field label={<span className="flex items-center justify-between">Meta description <span /></span>} hint="About 120–155 characters: what will visitors find on this page?" error={errors['meta.seo.description']}>
            <CountedTextarea value={seo.description ?? ''} max={170} onChange={(description) => setSeo({ description })} />
          </Field>
          <Field label="Share image" hint="1200 × 630px works best for link previews." error={errors['meta.seo.image']}>
            <ImageField value={seo.image ?? ''} onChange={(image) => setSeo({ image })} label="share image" />
          </Field>
          <Toggle checked={!!seo.noIndex} onChange={(noIndex) => setSeo({ noIndex })} label="Hide this page from search engines (noindex)" />
          {seo.noIndex && <Callout tone="warn">Search engines will be asked not to list this page. Use this for thank-you pages or private landing pages.</Callout>}
        </FieldGroup>
        <p className="text-xs text-adm-muted">Title, SEO and images are saved with the draft and go live when you publish.</p>
      </div>
    </Modal>
  );
}
