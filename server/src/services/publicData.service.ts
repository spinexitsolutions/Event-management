import type { Prisma } from '@prisma/client';
import { parseSectionForRender, type Section } from '@maison/shared';
import { prisma } from '../config/db';

/**
 * Public read models. Only PUBLISHED content is exposed, plus publication guards:
 * projects need publicationConsent, testimonials need clientApproved, logos need authorized,
 * packages must be visible and within their validity window.
 */
const now = () => new Date();
const published = { status: 'PUBLISHED' as const };

export const publicProjectWhere: Prisma.PortfolioProjectWhereInput = { ...published, publicationConsent: true };
export const publicTestimonialWhere: Prisma.TestimonialWhereInput = { ...published, clientApproved: true };
export const publicLogoWhere: Prisma.ClientLogoWhereInput = { ...published, authorized: true };
export const publicPackageWhere = (): Prisma.PackageWhereInput => ({
  ...published,
  visible: true,
  AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now() } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: new Date(now().toISOString().slice(0, 10)) } }] }],
});

const cardCategory = { id: true, slug: true, name: true, tagline: true, summary: true, coverImage: true, coverAlt: true } as const;
const cardService = { id: true, slug: true, name: true, summary: true, icon: true, coverImage: true, coverAlt: true, features: true } as const;
export const cardProject = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  city: true,
  venueName: true,
  eventDate: true,
  coverImage: true,
  coverAlt: true,
  featured: true,
  category: { select: { slug: true, name: true } },
} as const;
export const cardPackage = {
  id: true,
  slug: true,
  name: true,
  tier: true,
  summary: true,
  coverImage: true,
  coverAlt: true,
  inclusions: true,
  guestMin: true,
  guestMax: true,
  pricingModel: true,
  priceMinor: true,
  currency: true,
  discountBps: true,
  discountLabel: true,
  validUntil: true,
  featured: true,
  category: { select: { slug: true, name: true } },
} as const;
const cardVenue = { id: true, slug: true, name: true, city: true, region: true, description: true, capacityMin: true, capacityMax: true, coverImage: true, facilities: true } as const;

/** Live statistics for "stats" sections (never fabricated). */
export async function liveMetrics() {
  const [completedEvents, clientsServed, cities, publishedProjects] = await Promise.all([
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.booking.findMany({ where: { status: 'COMPLETED' }, distinct: ['clientId'], select: { clientId: true } }).then((r) => r.length),
    prisma.booking.findMany({ where: { status: 'COMPLETED', city: { not: '' } }, distinct: ['city'], select: { city: true } }).then((r) => r.length),
    prisma.portfolioProject.count({ where: publicProjectWhere }),
  ]);
  return { completedEvents, clientsServed, citiesServed: cities, publishedProjects };
}

/** Resolves the data each data-backed section needs, so a page renders from one request. */
export async function resolveSectionData(sections: Section[]) {
  const out: Record<string, unknown> = {};
  let metrics: Awaited<ReturnType<typeof liveMetrics>> | null = null;
  for (const s of sections) {
    if (!s.enabled) continue;
    switch (s.type) {
      case 'categories':
        out[s.id] = await prisma.eventCategory.findMany({ where: published, select: cardCategory, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: s.props.limit });
        break;
      case 'featuredProjects':
        out[s.id] = await prisma.portfolioProject.findMany({
          where: { ...publicProjectWhere, ...(s.props.featuredOnly ? { featured: true } : {}), ...(s.props.categorySlug ? { category: { slug: s.props.categorySlug } } : {}) },
          select: cardProject,
          orderBy: [{ sortOrder: 'asc' }, { eventDate: 'desc' }],
          take: s.props.limit,
        });
        break;
      case 'services':
        out[s.id] = await prisma.service.findMany({ where: published, select: cardService, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], take: s.props.limit });
        break;
      case 'gallery':
        if (s.props.source === 'portfolio') {
          const projects = await prisma.portfolioProject.findMany({ where: publicProjectWhere, select: { title: true, slug: true, gallery: true, coverImage: true, coverAlt: true }, orderBy: { eventDate: 'desc' }, take: 12 });
          const images: { url: string; alt: string; caption: string; href: string }[] = [];
          for (const p of projects) {
            const g = (p.gallery as { url: string; alt?: string }[]) ?? [];
            for (const img of [{ url: p.coverImage, alt: p.coverAlt }, ...g]) if (img.url) images.push({ url: img.url, alt: img.alt || p.title, caption: p.title, href: `/portfolio/${p.slug}` });
          }
          out[s.id] = images.slice(0, s.props.limit);
        }
        break;
      case 'testimonials':
        out[s.id] = await prisma.testimonial.findMany({
          where: publicTestimonialWhere,
          select: { id: true, clientName: true, eventLabel: true, quote: true, rating: true, photoUrl: true, project: { select: { slug: true, title: true } } },
          orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
          take: s.props.limit,
        });
        break;
      case 'packages':
        out[s.id] = await prisma.package.findMany({ where: { ...publicPackageWhere(), ...(s.props.featuredOnly ? { featured: true } : {}) }, select: cardPackage, orderBy: [{ sortOrder: 'asc' }], take: s.props.limit });
        break;
      case 'venues':
        out[s.id] = await prisma.venue.findMany({ where: { isPublic: true, status: 'PUBLISHED' }, select: cardVenue, orderBy: [{ sortOrder: 'asc' }], take: s.props.limit });
        break;
      case 'stats':
        metrics ??= await liveMetrics();
        out[s.id] = metrics;
        break;
      case 'logos':
        out[s.id] = await prisma.clientLogo.findMany({ where: publicLogoWhere, select: { id: true, name: true, logoUrl: true, href: true }, orderBy: { sortOrder: 'asc' }, take: s.props.limit });
        break;
      case 'faq':
        out[s.id] = await prisma.faq.findMany({ where: { ...published, ...(s.props.group ? { group: s.props.group } : {}) }, select: { id: true, question: true, answer: true, group: true }, orderBy: { sortOrder: 'asc' }, take: s.props.limit });
        break;
      case 'team':
        out[s.id] = await prisma.teamMember.findMany({ where: published, select: { id: true, name: true, title: true, bio: true, photoUrl: true, socials: true }, orderBy: { sortOrder: 'asc' }, take: s.props.limit });
        break;
      case 'blog':
        out[s.id] = await prisma.blogPost.findMany({ where: { ...published, publishedAt: { lte: now() } }, select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, coverAlt: true, publishedAt: true, kind: true }, orderBy: { publishedAt: 'desc' }, take: s.props.limit });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Parses stored sections for rendering; invalid sections are dropped (publish already validated them). */
export function renderableSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseSectionForRender).filter((s): s is Section => !!s);
}
