import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowRight, Image as ImageIcon, MailOpen, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/admin/ui';
import { useAuth } from '@/app/AuthProvider';
import { api } from '@/lib/api';
import { COLLECTIONS } from '../content/collections';

export default function ContentHub() {
  const { can } = useAuth();
  const counts = useQueries({
    queries: COLLECTIONS.map((c) => ({
      queryKey: ['cms-content-count', c.key],
      queryFn: async () => {
        const [all, pub] = await Promise.all([api.getPaged(`/admin/content/${c.key}`, { limit: 1 }), api.getPaged(`/admin/content/${c.key}`, { limit: 1, status: 'PUBLISHED' })]);
        return { total: all.meta?.total ?? 0, published: pub.meta?.total ?? 0 };
      },
    })),
  });
  const subs = useQuery({ queryKey: ['cms-subscribers'], queryFn: () => api.get<{ id: string; status: string }[]>('/admin/settings/newsletter') });
  const media = useQuery({ queryKey: ['cms-media-count'], queryFn: () => api.getPaged('/admin/media', { limit: 1 }), enabled: can('media.manage') });

  return (
    <div>
      <PageHeader title="Content library" subtitle="Everything the website shows: categories, services, packages, portfolio, testimonials and more. Published items appear on the site automatically." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {COLLECTIONS.map((c, i) => {
          const q = counts[i];
          return (
            <Link key={c.key} to={`/admin/website/content/${c.key}`} className="adm-card group flex flex-col p-5 transition hover:border-adm-gold/60 hover:shadow-lg focus-visible:border-adm-gold focus-visible:outline-none">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FBF7EE] text-adm-gold transition group-hover:bg-adm-gold group-hover:text-white">
                  <c.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <ArrowRight className="h-4 w-4 text-adm-muted transition group-hover:translate-x-0.5 group-hover:text-adm-ink" />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold">{c.label}</h2>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-adm-muted">{c.description}</p>
              <div className="mt-4 flex items-center gap-4 border-t border-adm-line pt-3 text-xs">
                {q.isLoading ? (
                  <span className="h-4 w-24 animate-pulse rounded bg-adm-line/70" />
                ) : q.isError ? (
                  <span className="text-red-600">Couldn’t load counts</span>
                ) : (
                  <>
                    <span>
                      <strong className="text-sm tabular-nums">{q.data?.total}</strong> <span className="text-adm-muted">items</span>
                    </span>
                    <span>
                      <strong className="text-sm tabular-nums text-emerald-700">{q.data?.published}</strong> <span className="text-adm-muted">published</span>
                    </span>
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <h2 className="mb-3 mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-adm-muted">Related</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link to="/admin/website/subscribers" className="adm-card group flex items-center gap-4 p-4 transition hover:border-adm-gold/60">
          <MailOpen className="h-5 w-5 text-adm-gold" strokeWidth={1.5} />
          <span className="flex-1">
            <span className="block text-sm font-medium">Newsletter subscribers</span>
            <span className="block text-xs text-adm-muted">{subs.data ? `${subs.data.filter((s) => s.status !== 'UNSUBSCRIBED').length} subscribed` : subs.isError ? 'Unavailable' : 'Loading…'}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-adm-muted" />
        </Link>
        {can('media.manage') && (
          <Link to="/admin/website/media" className="adm-card group flex items-center gap-4 p-4 transition hover:border-adm-gold/60">
            <ImageIcon className="h-5 w-5 text-adm-gold" strokeWidth={1.5} />
            <span className="flex-1">
              <span className="block text-sm font-medium">Media library</span>
              <span className="block text-xs text-adm-muted">{media.data ? `${media.data.meta?.total ?? 0} files` : 'Photos, videos and logos'}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-adm-muted" />
          </Link>
        )}
        {can('venues.manage') && (
          <Link to="/admin/venues" className="adm-card group flex items-center gap-4 p-4 transition hover:border-adm-gold/60">
            <MapPin className="h-5 w-5 text-adm-gold" strokeWidth={1.5} />
            <span className="flex-1">
              <span className="block text-sm font-medium">Venues & destinations</span>
              <span className="block text-xs text-adm-muted">Managed under Operations → Venues</span>
            </span>
            <ArrowRight className="h-4 w-4 text-adm-muted" />
          </Link>
        )}
      </div>
    </div>
  );
}
