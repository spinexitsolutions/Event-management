import { z } from 'zod';

/** Relative paths, in-page anchors, http(s), mailto and tel links. Blocks javascript:/data: URLs. */
export const safeHref = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === '' || /^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(v),
    'Link must be a relative path (/page), an anchor (#section), an http(s) URL, mailto: or tel:',
  );

/** Media URL: uploaded files (/uploads/...), bundled assets (/images/...), or https URLs (Cloudinary, Unsplash, Pexels). */
export const mediaUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === '' || /^(\/(?!\/)|https:\/\/)/i.test(v), 'Media must be an uploaded file or an https URL');

export const hexColor = z.string().regex(/^#([0-9a-fA-F]{6})$/, 'Use a 6-digit hex colour such as #C6A76B');

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens');

export const idSchema = z.string().min(1).max(40);

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(160);
export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20)
  .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');

export const ctaSchema = z.object({
  label: z.string().trim().min(1).max(40),
  href: safeHref,
  variant: z.enum(['primary', 'secondary', 'ghost']).default('primary'),
});
export type Cta = z.infer<typeof ctaSchema>;

export const imageSchema = z.object({
  url: mediaUrl,
  alt: z.string().trim().max(200).default(''),
  caption: z.string().trim().max(200).default(''),
});
export type ImageRef = z.infer<typeof imageSchema>;

export const seoSchema = z.object({
  title: z.string().trim().max(70).default(''),
  description: z.string().trim().max(170).default(''),
  image: mediaUrl.default(''),
  noIndex: z.boolean().default(false),
});
export type Seo = z.infer<typeof seoSchema>;

export const faqItemSchema = z.object({
  question: z.string().trim().min(1).max(200),
  answer: z.string().trim().min(1).max(2000),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const CONTENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
