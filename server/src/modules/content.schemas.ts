import { z } from 'zod';
import { faqItemSchema, imageSchema, mediaUrl, safeHref, seoSchema, slugSchema, CONTENT_STATUSES } from '@maison/shared';

const status = z.enum(CONTENT_STATUSES).default('DRAFT');
const md = (max = 20000) => z.string().trim().max(max).default('');
const str = (max = 200) => z.string().trim().max(max).default('');
const minorOpt = z.number().int().min(0).max(1e13).nullable().default(null);
const dateOpt = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .default(null);

export const categoryInput = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  tagline: str(160),
  summary: str(600),
  body: md(),
  coverImage: mediaUrl.default(''),
  coverAlt: str(200),
  gallery: z.array(imageSchema).max(40).default([]),
  highlights: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
  faqs: z.array(faqItemSchema).max(20).default([]),
  seo: seoSchema.default({}),
  sortOrder: z.number().int().default(0),
  status,
  serviceIds: z.array(z.string()).max(50).default([]),
});

export const serviceInput = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(100),
  summary: str(600),
  body: md(),
  icon: str(40),
  coverImage: mediaUrl.default(''),
  coverAlt: str(200),
  gallery: z.array(imageSchema).max(40).default([]),
  features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  faqs: z.array(faqItemSchema).max(20).default([]),
  seo: seoSchema.default({}),
  defaultPriceMinor: minorOpt,
  defaultUnit: str(20),
  sortOrder: z.number().int().default(0),
  status,
  categoryIds: z.array(z.string()).max(50).default([]),
});

export const packageInput = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1).max(100),
    tier: str(40),
    summary: str(600),
    body: md(),
    coverImage: mediaUrl.default(''),
    coverAlt: str(200),
    gallery: z.array(imageSchema).max(30).default([]),
    inclusions: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
    addOns: z.array(z.object({ name: z.string().trim().min(1).max(120), description: str(300), priceMinor: minorOpt })).max(30).default([]),
    exclusions: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    terms: md(5000),
    availability: str(300),
    guestMin: z.number().int().min(1).max(100000).nullable().default(null),
    guestMax: z.number().int().min(1).max(100000).nullable().default(null),
    pricingModel: z.enum(['STARTING_FROM', 'FIXED', 'ON_REQUEST']).default('ON_REQUEST'),
    priceMinor: minorOpt,
    currency: z.string().length(3).default('INR'),
    discountBps: z.number().int().min(0).max(9000).default(0),
    discountLabel: str(60),
    validFrom: dateOpt,
    validUntil: dateOpt,
    featured: z.boolean().default(false),
    visible: z.boolean().default(true),
    status,
    sortOrder: z.number().int().default(0),
    categoryId: z.string().nullable().default(null),
    serviceIds: z.array(z.string()).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.pricingModel !== 'ON_REQUEST' && (v.priceMinor === null || v.priceMinor <= 0)) ctx.addIssue({ code: 'custom', path: ['priceMinor'], message: 'Enter a price, or choose “Request a quote”' });
    if (v.guestMin && v.guestMax && v.guestMin > v.guestMax) ctx.addIssue({ code: 'custom', path: ['guestMax'], message: 'Maximum guests must be at least the minimum' });
    if (v.validFrom && v.validUntil && v.validFrom > v.validUntil) ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'End date must be after start date' });
  });

export const projectInput = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  summary: str(600),
  story: md(),
  categoryId: z.string().nullable().default(null),
  city: str(80),
  venueName: str(160),
  eventDate: dateOpt,
  guestCount: z.number().int().min(1).max(100000).nullable().default(null),
  theme: str(160),
  concept: md(3000),
  coverImage: mediaUrl.default(''),
  coverAlt: str(200),
  gallery: z.array(imageSchema).max(80).default([]),
  beforeAfter: z.array(z.object({ beforeUrl: mediaUrl, afterUrl: mediaUrl, caption: str(160) })).max(10).default([]),
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || /^(\/(?!\/)|https:\/\/)/.test(v))
    .default(''),
  publicationConsent: z.boolean().default(false),
  consentNote: str(300),
  featured: z.boolean().default(false),
  status,
  sortOrder: z.number().int().default(0),
  seo: seoSchema.default({}),
  serviceIds: z.array(z.string()).max(50).default([]),
});

export const testimonialInput = z.object({
  clientName: z.string().trim().min(1).max(120),
  eventLabel: str(120),
  quote: z.string().trim().min(1).max(1500),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  photoUrl: mediaUrl.default(''),
  projectId: z.string().nullable().default(null),
  clientApproved: z.boolean().default(false),
  featured: z.boolean().default(false),
  status,
  sortOrder: z.number().int().default(0),
});

export const teamInput = z.object({
  name: z.string().trim().min(1).max(120),
  title: str(120),
  bio: md(2000),
  photoUrl: mediaUrl.default(''),
  socials: z.array(z.object({ network: z.string().max(20), url: safeHref })).max(6).default([]),
  sortOrder: z.number().int().default(0),
  status,
});

export const faqInput = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(3000),
  group: z.string().trim().max(60).default('General'),
  sortOrder: z.number().int().default(0),
  status: z.enum(CONTENT_STATUSES).default('PUBLISHED'),
});

export const logoInput = z.object({
  name: z.string().trim().min(1).max(120),
  logoUrl: mediaUrl.refine((v) => v !== '', 'Upload a logo'),
  href: safeHref.default(''),
  authorized: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  status,
});

export const blogInput = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(160),
  excerpt: str(400),
  body: md(60000),
  coverImage: mediaUrl.default(''),
  coverAlt: str(200),
  authorName: str(80),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  kind: z.enum(['ARTICLE', 'NEWS']).default('ARTICLE'),
  status,
  publishedAt: z.string().datetime().nullable().default(null),
  seo: seoSchema.default({}),
});

export const venueInput = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1).max(160),
  city: str(80),
  region: str(80),
  address: str(300),
  description: md(5000),
  capacityMin: z.number().int().min(1).max(100000).nullable().default(null),
  capacityMax: z.number().int().min(1).max(100000).nullable().default(null),
  facilities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  images: z.array(imageSchema).max(30).default([]),
  coverImage: mediaUrl.default(''),
  rentalPriceMinor: minorOpt,
  rentalNotes: str(1000),
  ownership: z.enum(['PARTNER', 'EXTERNAL', 'COMPANY']).default('PARTNER'),
  vendorId: z.string().nullable().default(null),
  isPublic: z.boolean().default(false),
  exclusive: z.boolean().default(true),
  lat: z.number().min(-90).max(90).nullable().default(null),
  lng: z.number().min(-180).max(180).nullable().default(null),
  status: z.enum(CONTENT_STATUSES).default('PUBLISHED'),
  sortOrder: z.number().int().default(0),
});
