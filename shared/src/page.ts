import { z } from 'zod';
import { mediaUrl, seoSchema, slugSchema } from './common';
import { draftSectionSchema } from './sections';

/** Slugs used by built-in routes; CMS pages cannot take them. */
export const RESERVED_SLUGS = [
  'admin', 'portal', 'login', 'register', 'api', 'uploads', 'preview', 'inquire', 'track', 'forgot-password', 'reset-password',
  'events', 'services', 'portfolio', 'packages', 'blog', 'journal', 'about', 'contact', 'venues', 'rsvp', 'q', 'sitemap.xml', 'robots.txt',
];

export const PAGE_KINDS = ['HOME', 'ABOUT', 'CONTACT', 'STANDARD', 'LEGAL'] as const;

export const pageMetaSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: slugSchema,
  seo: seoSchema.default({}),
  featuredImage: mediaUrl.default(''),
});

export const pageDraftSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  seo: seoSchema.optional(),
  featuredImage: mediaUrl.optional(),
  sections: z.array(draftSectionSchema).max(60).optional(),
});
export type PageDraft = z.infer<typeof pageDraftSchema>;
