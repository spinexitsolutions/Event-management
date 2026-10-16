import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, MapPin, Users } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Reveal, Stagger, staggerItem } from '@/components/ui/Reveal';
import { Seo } from '@/components/ui/Seo';
import { EmptyState } from '@/components/ui/States';
import { api } from '@/lib/api';
import type { GalleryImage, VenueCard } from '@/lib/types';
import { VenueTile } from '@/sections/cards';
import { GalleryGrid } from '@/sections/showcase';
import { BlockTitle, GridSkeleton, ImageHero, InquiryBand, isNotFound, NotFoundView, PageError, PageHeader, PageSkeleton } from '../components/page';

export function VenuesIndex() {
  const q = useQuery({ queryKey: ['public-venues'], queryFn: () => api.get<VenueCard[]>('/public/venues') });
  return (
    <>
      <Seo title="Venues & destinations" description="Palaces, beaches, ballrooms and private estates we love to design for." />
      <PageHeader eyebrow="Destinations" title="Venues we love" intro="Palaces, beaches, ballrooms and private estates — places where we know every corridor and sunset." crumbs={[{ label: 'Home', href: '/' }, { label: 'Venues' }]} />
      <section className="container-site pb-section">
        {q.isLoading ? (
          <GridSkeleton count={4} cols="sm:grid-cols-2 lg:grid-cols-4" />
        ) : q.error ? (
          <PageError error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Destinations coming soon" body="We work at venues across the country and abroad — ask us for recommendations." />
        ) : (
          <Stagger className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-4">
            {q.data.map((v) => (
              <motion.div key={v.id} variants={staggerItem}>
                <VenueTile v={v} />
              </motion.div>
            ))}
          </Stagger>
        )}
      </section>
      <InquiryBand title="Looking for the perfect setting?" body="Tell us your guest count and dream location — we will shortlist venues for you." href="/inquire" />
    </>
  );
}

interface VenueDetailData extends VenueCard {
  address: string;
  images: (GalleryImage | string)[];
  lat: number | null;
  lng: number | null;
}

export function VenueDetail() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['public-venue', slug], queryFn: () => api.get<VenueDetailData>(`/public/venues/${encodeURIComponent(slug)}`) });
  if (q.isLoading) return <PageSkeleton hero />;
  if (q.error) return isNotFound(q.error) ? <NotFoundView title="We couldn’t find that venue" /> : <PageError error={q.error} onRetry={() => void q.refetch()} />;
  const v = q.data!;
  const images: GalleryImage[] = (v.images ?? []).map((i) => (typeof i === 'string' ? { url: i, alt: v.name } : { url: i.url, alt: i.alt || v.name, caption: i.caption })).filter((i) => i.url);
  const cap = v.capacityMax ? `${v.capacityMin ? `${v.capacityMin.toLocaleString()}–` : 'Up to '}${v.capacityMax.toLocaleString()} guests` : '';
  const place = [v.city, v.region].filter(Boolean).join(', ');
  return (
    <>
      <Seo title={v.name} description={v.description.slice(0, 160)} image={v.coverImage} jsonLd={{ '@context': 'https://schema.org', '@type': 'Place', name: v.name, address: v.address || place, ...(v.lat && v.lng ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}) }} />
      <ImageHero image={v.coverImage} alt={v.name} eyebrow={place || 'Venue'} title={v.name} height="medium" crumbs={[{ label: 'Home', href: '/' }, { label: 'Venues', href: '/venues' }, { label: v.name }]} />
      <section className="section">
        <div className="container-site grid grid-cols-1 gap-16 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <p className="whitespace-pre-line font-heading text-[clamp(1.4rem,2.2vw,2rem)] leading-snug">{v.description}</p>
          </Reveal>
          <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-9">
            <div className="card space-y-6 p-8 md:p-10">
              {(v.address || place) && (
                <p className="flex gap-3">
                  <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={1.25} />
                  <span>{v.address || place}</span>
                </p>
              )}
              {cap && (
                <p className="flex gap-3">
                  <Users className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={1.25} />
                  <span>{cap}</span>
                </p>
              )}
              {v.facilities.length > 0 && (
                <div className="border-t border-line pt-6">
                  <p className="eyebrow mb-4">Facilities</p>
                  <ul className="space-y-2.5 text-sm">
                    {v.facilities.map((f, i) => (
                      <li key={i} className="flex gap-3">
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Link to="/inquire" className="btn btn-primary w-full">
                Plan an event here
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      {images.length > 0 && (
        <section className="pb-section" aria-label="Gallery">
          <div className="container-site">
            <BlockTitle eyebrow="Gallery" title="A closer look" />
            <GalleryGrid images={images} variant="masonry" label={`${v.name} gallery`} />
          </div>
        </section>
      )}
      <InquiryBand title={`Celebrate at ${v.name}`} href="/inquire" />
    </>
  );
}
