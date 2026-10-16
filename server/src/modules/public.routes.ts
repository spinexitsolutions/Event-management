import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { contactSubmitSchema, emailSchema, inquirySubmitSchema, trackInquirySchema } from '@maison/shared';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { randomToken } from '../lib/crypto';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { formLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { createInquiry, trackInquiry, assertHuman } from '../services/inquiry.service';
import {
  cardPackage,
  cardProject,
  publicLogoWhere,
  publicPackageWhere,
  publicProjectWhere,
  publicTestimonialWhere,
  renderableSections,
  resolveSectionData,
} from '../services/publicData.service';
import { getPublishedBundle, getPublishedSite } from '../services/siteConfig.service';
import { storeFile } from '../services/storage.service';

export const publicRouter = Router();
const published = { status: 'PUBLISHED' as const };

/** Theme + global settings + content version. Clients poll `version` to pick up publishes without reloads. */
publicRouter.get(
  '/bootstrap',
  ah(async (_req, res) => {
    const bundle = await getPublishedBundle();
    const [pages, categories] = await Promise.all([
      prisma.page.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, kind: true, title: true } }),
      prisma.eventCategory.findMany({ where: published, select: { id: true, slug: true, name: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    res.set('Cache-Control', 'public, max-age=15');
    ok(res, {
      ...bundle,
      pages,
      categories,
      integrations: { payments: env.PAYMENT_PROVIDER, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY ?? '' },
    });
  }),
);

publicRouter.get(
  '/version',
  ah(async (_req, res) => {
    const b = await getPublishedBundle();
    ok(res, { version: b.version });
  }),
);

publicRouter.get(
  '/pages/:slug',
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { slug: req.params.slug } });
    if (!page || page.status !== 'PUBLISHED') throw AppError.notFound('Page');
    const v = await prisma.pageVersion.findUnique({ where: { pageId_version: { pageId: page.id, version: page.publishedVersion } } });
    if (!v) throw AppError.notFound('Page');
    const content = v.content as { title: string; seo: unknown; featuredImage?: string; sections: unknown[] };
    const sections = renderableSections(content.sections);
    ok(res, { slug: page.slug, kind: page.kind, title: content.title, seo: content.seo, featuredImage: content.featuredImage ?? '', sections, data: await resolveSectionData(sections), version: v.version });
  }),
);

/* ───── Event categories ───── */

publicRouter.get(
  '/categories',
  ah(async (_req, res) => {
    ok(res, await prisma.eventCategory.findMany({ where: published, select: { id: true, slug: true, name: true, tagline: true, summary: true, coverImage: true, coverAlt: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }));
  }),
);

publicRouter.get(
  '/categories/:slug',
  ah(async (req, res) => {
    const c = await prisma.eventCategory.findFirst({
      where: { slug: req.params.slug, ...published },
      include: { services: { where: published, select: { id: true, slug: true, name: true, summary: true, icon: true, coverImage: true, coverAlt: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!c) throw AppError.notFound('Event category');
    const [projects, packages] = await Promise.all([
      prisma.portfolioProject.findMany({ where: { ...publicProjectWhere, categoryId: c.id }, select: cardProject, orderBy: [{ featured: 'desc' }, { eventDate: 'desc' }], take: 6 }),
      prisma.package.findMany({ where: { ...publicPackageWhere(), categoryId: c.id }, select: cardPackage, orderBy: { sortOrder: 'asc' }, take: 6 }),
    ]);
    ok(res, { ...c, projects, packages });
  }),
);

/* ───── Services ───── */

publicRouter.get(
  '/services',
  ah(async (_req, res) => {
    ok(res, await prisma.service.findMany({ where: published, select: { id: true, slug: true, name: true, summary: true, icon: true, coverImage: true, coverAlt: true, features: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }));
  }),
);

publicRouter.get(
  '/services/:slug',
  ah(async (req, res) => {
    const s = await prisma.service.findFirst({
      where: { slug: req.params.slug, ...published },
      omit: { defaultPriceMinor: true, defaultUnit: true },
      include: { categories: { where: published, select: { slug: true, name: true } } },
    });
    if (!s) throw AppError.notFound('Service');
    const [projects, related] = await Promise.all([
      prisma.portfolioProject.findMany({ where: { ...publicProjectWhere, services: { some: { id: s.id } } }, select: cardProject, orderBy: { eventDate: 'desc' }, take: 4 }),
      prisma.service.findMany({ where: { ...published, id: { not: s.id } }, select: { slug: true, name: true, summary: true, coverImage: true, coverAlt: true, icon: true }, orderBy: { sortOrder: 'asc' }, take: 3 }),
    ]);
    ok(res, { ...s, projects, related });
  }),
);

/* ───── Packages ───── */

publicRouter.get(
  '/packages',
  validate({ query: z.object({ category: z.string().max(80).optional() }) }),
  ah(async (req, res) => {
    const category = (qry<{ category?: string }>(req)).category;
    ok(res, await prisma.package.findMany({ where: { ...publicPackageWhere(), ...(category ? { category: { slug: category } } : {}) }, select: cardPackage, orderBy: [{ sortOrder: 'asc' }] }));
  }),
);

publicRouter.get(
  '/packages/:slug',
  ah(async (req, res) => {
    const p = await prisma.package.findFirst({
      where: { slug: req.params.slug, ...publicPackageWhere() },
      include: { services: { where: published, select: { slug: true, name: true, icon: true } }, category: { select: { slug: true, name: true } } },
    });
    if (!p) throw AppError.notFound('Package');
    ok(res, p);
  }),
);

/* ───── Portfolio ───── */

const portfolioQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  category: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'oldest', 'featured']).default('featured'),
});

publicRouter.get(
  '/portfolio',
  validate({ query: portfolioQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof portfolioQuery>>(req);
    const { page, limit, skip, take } = paginate(q, 48);
    const where = {
      ...publicProjectWhere,
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.city ? { city: { equals: q.city, mode: 'insensitive' as const } } : {}),
      ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' as const } }, { summary: { contains: q.q, mode: 'insensitive' as const } }, { theme: { contains: q.q, mode: 'insensitive' as const } }, { venueName: { contains: q.q, mode: 'insensitive' as const } }] } : {}),
    };
    const orderBy =
      q.sort === 'recent' ? [{ eventDate: 'desc' as const }] : q.sort === 'oldest' ? [{ eventDate: 'asc' as const }] : [{ featured: 'desc' as const }, { sortOrder: 'asc' as const }, { eventDate: 'desc' as const }];
    const [items, total, cities] = await Promise.all([
      prisma.portfolioProject.findMany({ where, select: cardProject, orderBy, skip, take }),
      prisma.portfolioProject.count({ where }),
      prisma.portfolioProject.findMany({ where: { ...publicProjectWhere, city: { not: '' } }, distinct: ['city'], select: { city: true }, orderBy: { city: 'asc' } }),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), cities: cities.map((c) => c.city) });
  }),
);

publicRouter.get(
  '/portfolio/:slug',
  ah(async (req, res) => {
    const p = await prisma.portfolioProject.findFirst({
      where: { slug: req.params.slug, ...publicProjectWhere },
      omit: { consentNote: true, publicationConsent: true },
      include: {
        category: { select: { slug: true, name: true } },
        services: { where: published, select: { slug: true, name: true } },
        testimonials: { where: publicTestimonialWhere, select: { id: true, clientName: true, eventLabel: true, quote: true, rating: true } },
      },
    });
    if (!p) throw AppError.notFound('Project');
    const related = await prisma.portfolioProject.findMany({
      where: { ...publicProjectWhere, id: { not: p.id }, ...(p.categoryId ? { categoryId: p.categoryId } : {}) },
      select: cardProject,
      orderBy: { eventDate: 'desc' },
      take: 3,
    });
    ok(res, { ...p, related });
  }),
);

/* ───── Other collections ───── */

publicRouter.get('/testimonials', ah(async (_req, res) => ok(res, await prisma.testimonial.findMany({ where: publicTestimonialWhere, select: { id: true, clientName: true, eventLabel: true, quote: true, rating: true, photoUrl: true }, orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }] }))));
publicRouter.get('/team', ah(async (_req, res) => ok(res, await prisma.teamMember.findMany({ where: published, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, title: true, bio: true, photoUrl: true, socials: true } }))));
publicRouter.get('/faqs', ah(async (_req, res) => ok(res, await prisma.faq.findMany({ where: published, orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }], select: { id: true, question: true, answer: true, group: true } }))));
publicRouter.get('/logos', ah(async (_req, res) => ok(res, await prisma.clientLogo.findMany({ where: publicLogoWhere, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, logoUrl: true, href: true } }))));
publicRouter.get(
  '/venues',
  ah(async (_req, res) => ok(res, await prisma.venue.findMany({ where: { isPublic: true, status: 'PUBLISHED' }, orderBy: { sortOrder: 'asc' }, select: { id: true, slug: true, name: true, city: true, region: true, description: true, capacityMin: true, capacityMax: true, facilities: true, coverImage: true, images: true } }))),
);
publicRouter.get(
  '/venues/:slug',
  ah(async (req, res) => {
    const v = await prisma.venue.findFirst({ where: { slug: req.params.slug, isPublic: true, status: 'PUBLISHED' }, select: { id: true, slug: true, name: true, city: true, region: true, address: true, description: true, capacityMin: true, capacityMax: true, facilities: true, coverImage: true, images: true, lat: true, lng: true } });
    if (!v) throw AppError.notFound('Venue');
    ok(res, v);
  }),
);

publicRouter.get(
  '/blog',
  validate({ query: z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), tag: z.string().max(30).optional(), kind: z.enum(['ARTICLE', 'NEWS']).optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ page?: number; limit?: number; tag?: string; kind?: 'ARTICLE' | 'NEWS' }>(req);
    const { page, limit, skip, take } = paginate(q, 24);
    const where = { ...published, publishedAt: { lte: new Date() }, ...(q.tag ? { tags: { has: q.tag } } : {}), ...(q.kind ? { kind: q.kind } : {}) };
    const [items, total] = await Promise.all([
      prisma.blogPost.findMany({ where, select: { id: true, slug: true, title: true, excerpt: true, coverImage: true, coverAlt: true, authorName: true, tags: true, kind: true, publishedAt: true }, orderBy: { publishedAt: 'desc' }, skip, take }),
      prisma.blogPost.count({ where }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

publicRouter.get(
  '/blog/:slug',
  ah(async (req, res) => {
    const post = await prisma.blogPost.findFirst({ where: { slug: req.params.slug, ...published, publishedAt: { lte: new Date() } } });
    if (!post) throw AppError.notFound('Article');
    const more = await prisma.blogPost.findMany({ where: { ...published, publishedAt: { lte: new Date() }, id: { not: post.id } }, select: { slug: true, title: true, coverImage: true, coverAlt: true, publishedAt: true }, orderBy: { publishedAt: 'desc' }, take: 3 });
    ok(res, { ...post, more });
  }),
);

/* ───── Forms ───── */

const inquiryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

/** Inspiration image upload for the inquiry form. Stored privately; linked to the inquiry on submit. */
publicRouter.post(
  '/inquiries/uploads',
  formLimiter,
  inquiryUpload.single('file'),
  ah(async (req, res) => {
    const site = await getPublishedSite();
    if (!site.inquiry.allowUploads) throw AppError.forbidden('Uploads are disabled');
    if (!req.file) throw AppError.badRequest('Choose an image');
    const stored = await storeFile(req.file.buffer, req.file.originalname, { isPrivate: true, allow: ['IMAGE'] });
    const m = await prisma.mediaAsset.create({ data: { ...stored, isPrivate: true, folder: 'inquiry-uploads', filename: req.file.originalname.slice(0, 120), tags: [] } });
    ok(res, { id: m.id, filename: m.filename }, undefined, 201);
  }),
);

publicRouter.post(
  '/inquiries',
  formLimiter,
  validate({ body: inquirySubmitSchema }),
  ah(async (req, res) => {
    const { inquiry, duplicate } = await createInquiry(req, req.body);
    ok(res, { reference: inquiry.reference, duplicate }, undefined, duplicate ? 200 : 201);
  }),
);

publicRouter.post(
  '/inquiries/track',
  formLimiter,
  validate({ body: trackInquirySchema }),
  ah(async (req, res) => ok(res, await trackInquiry(req.body.reference, req.body.email))),
);

publicRouter.post(
  '/contact',
  formLimiter,
  validate({ body: contactSubmitSchema }),
  ah(async (req, res) => {
    await assertHuman(req.body.startedAt, req.body.captchaToken, req.ip ?? null);
    const site = await getPublishedSite();
    const { inquiry } = await createInquiry(req, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone || '',
      preferredContact: 'EMAIL',
      eventType: req.body.eventType,
      categoryId: null,
      eventDate: '',
      alternativeDate: '',
      dateFlexible: true,
      location: site.company.city || 'Not specified',
      guestCount: 1,
      budgetRange: 'Not specified',
      venueRequirements: '',
      services: [],
      themePreferences: '',
      cateringRequirements: '',
      notes: req.body.message,
      referenceImages: [],
      consent: true,
      packageId: null,
      source: 'contact-form',
      utm: {},
      website: '',
    }, { humanVerified: true });
    ok(res, { reference: inquiry.reference }, undefined, 201);
  }),
);

publicRouter.post(
  '/newsletter',
  formLimiter,
  validate({ body: z.object({ email: emailSchema, consent: z.literal(true), website: z.string().max(0).default('') }) }),
  ah(async (req, res) => {
    await prisma.newsletterSubscriber.upsert({
      where: { email: req.body.email },
      update: { status: 'SUBSCRIBED' },
      create: { email: req.body.email, unsubscribeToken: randomToken(18) },
    });
    ok(res, { message: 'You are on the list.' });
  }),
);

publicRouter.post(
  '/newsletter/unsubscribe',
  validate({ body: z.object({ token: z.string().min(10).max(60) }) }),
  ah(async (req, res) => {
    await prisma.newsletterSubscriber.updateMany({ where: { unsubscribeToken: req.body.token }, data: { status: 'UNSUBSCRIBED' } });
    ok(res, { message: 'You have been unsubscribed.' });
  }),
);
