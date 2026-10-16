import type { Permission, Section, SiteSettings, ThemeTokens } from '@maison/shared';

export interface Bootstrap {
  theme: ThemeTokens;
  site: SiteSettings;
  version: string;
  pages: { slug: string; kind: string; title: string }[];
  categories: { id: string; slug: string; name: string }[];
  integrations: { payments: 'sandbox' | 'razorpay'; turnstileSiteKey: string };
}

export interface Me {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  title: string | null;
  avatarUrl: string | null;
  roleKey: string;
  roleName: string;
  mfaEnabled: boolean;
  permissions: Permission[];
  isStaff: boolean;
  clientId: string | null;
}

export interface PublicPage {
  slug: string;
  kind: string;
  title: string;
  seo: { title?: string; description?: string; image?: string; noIndex?: boolean };
  featuredImage?: string;
  sections: Section[];
  data: Record<string, unknown>;
}

export interface CategoryCard { id: string; slug: string; name: string; tagline: string; summary: string; coverImage: string; coverAlt: string }
export interface ServiceCard { id: string; slug: string; name: string; summary: string; icon: string; coverImage: string; coverAlt: string; features?: string[] }
export interface ProjectCard { id: string; slug: string; title: string; summary: string; city: string; venueName: string; eventDate: string | null; coverImage: string; coverAlt: string; featured: boolean; category: { slug: string; name: string } | null }
export interface PackageCard {
  id: string; slug: string; name: string; tier: string; summary: string; coverImage: string; coverAlt: string; inclusions: string[];
  guestMin: number | null; guestMax: number | null; pricingModel: 'STARTING_FROM' | 'FIXED' | 'ON_REQUEST'; priceMinor: number | null; currency: string;
  discountBps: number; discountLabel: string; validUntil: string | null; featured: boolean; category: { slug: string; name: string } | null;
}
export interface VenueCard { id: string; slug: string; name: string; city: string; region: string; description: string; capacityMin: number | null; capacityMax: number | null; coverImage: string; facilities: string[] }
export interface TestimonialCard { id: string; clientName: string; eventLabel: string; quote: string; rating: number | null; photoUrl: string; project?: { slug: string; title: string } | null }
export interface TeamCard { id: string; name: string; title: string; bio: string; photoUrl: string; socials: { network: string; url: string }[] }
export interface FaqItem { id: string; question: string; answer: string; group: string }
export interface LogoItem { id: string; name: string; logoUrl: string; href: string }
export interface PostCard { id: string; slug: string; title: string; excerpt: string; coverImage: string; coverAlt: string; publishedAt: string; kind?: string; authorName?: string; tags?: string[] }
export interface GalleryImage { url: string; alt: string; caption?: string; href?: string }
