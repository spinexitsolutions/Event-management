/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router } from 'express';
import { z, type ZodTypeAny } from 'zod';
import type { Permission } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { blogInput, categoryInput, faqInput, logoInput, packageInput, projectInput, serviceInput, teamInput, testimonialInput, venueInput } from './content.schemas';

/**
 * Generic admin CRUD for content collections (categories, services, packages, portfolio, testimonials,
 * team, FAQs, logos, blog, venues): list/search/filter, get, create, update, duplicate, reorder,
 * status changes (publish/archive) and delete — with publication guards and audit logging.
 */
interface CollectionDef {
  model: string;
  label: string;
  input: ZodTypeAny;
  search: string[];
  hasSlug: boolean;
  titleField: string;
  /** m2m: input key → relation field */
  relations?: Record<string, string>;
  include?: Record<string, unknown>;
  defaultOrder?: Record<string, 'asc' | 'desc'>[];
  dates?: string[];
  bigints?: string[];
  /** Throws when a record is not allowed to be published. */
  canPublish?: (data: any) => string | null;
  permission?: Permission;
}

export const COLLECTIONS: Record<string, CollectionDef> = {
  categories: {
    model: 'eventCategory',
    label: 'Event category',
    input: categoryInput,
    search: ['name', 'slug'],
    hasSlug: true,
    titleField: 'name',
    relations: { serviceIds: 'services' },
    include: { services: { select: { id: true, name: true } }, _count: { select: { projects: true, packages: true } } },
  },
  services: {
    model: 'service',
    label: 'Service',
    input: serviceInput,
    search: ['name', 'slug'],
    hasSlug: true,
    titleField: 'name',
    relations: { categoryIds: 'categories' },
    include: { categories: { select: { id: true, name: true } } },
    bigints: ['defaultPriceMinor'],
  },
  packages: {
    model: 'package',
    label: 'Package',
    input: packageInput,
    search: ['name', 'slug', 'tier'],
    hasSlug: true,
    titleField: 'name',
    relations: { serviceIds: 'services' },
    include: { services: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } },
    dates: ['validFrom', 'validUntil'],
    bigints: ['priceMinor'],
  },
  projects: {
    model: 'portfolioProject',
    label: 'Portfolio project',
    input: projectInput,
    search: ['title', 'slug', 'city', 'venueName'],
    hasSlug: true,
    titleField: 'title',
    relations: { serviceIds: 'services' },
    include: { services: { select: { id: true, name: true } }, category: { select: { id: true, name: true } } },
    dates: ['eventDate'],
    canPublish: (d) => (d.publicationConsent ? null : 'Confirm you are authorised to display this event before publishing it'),
  },
  testimonials: {
    model: 'testimonial',
    label: 'Testimonial',
    input: testimonialInput,
    search: ['clientName', 'quote', 'eventLabel'],
    hasSlug: false,
    titleField: 'clientName',
    include: { project: { select: { id: true, title: true } } },
    canPublish: (d) => (d.clientApproved ? null : 'Record the client’s approval before publishing this testimonial'),
  },
  team: { model: 'teamMember', label: 'Team member', input: teamInput, search: ['name', 'title'], hasSlug: false, titleField: 'name' },
  faqs: { model: 'faq', label: 'FAQ', input: faqInput, search: ['question', 'answer', 'group'], hasSlug: false, titleField: 'question' },
  logos: {
    model: 'clientLogo',
    label: 'Client logo',
    input: logoInput,
    search: ['name'],
    hasSlug: false,
    titleField: 'name',
    canPublish: (d) => (d.authorized ? null : 'Confirm you have permission to display this logo before publishing it'),
  },
  blog: {
    model: 'blogPost',
    label: 'Blog post',
    input: blogInput,
    search: ['title', 'slug', 'excerpt'],
    hasSlug: true,
    titleField: 'title',
    dates: ['publishedAt'],
    defaultOrder: [{ createdAt: 'desc' }],
  },
  venues: {
    model: 'venue',
    label: 'Venue',
    input: venueInput,
    search: ['name', 'city', 'slug'],
    hasSlug: true,
    titleField: 'name',
    include: { vendor: { select: { id: true, name: true } } },
    bigints: ['rentalPriceMinor'],
    permission: 'venues.manage',
  },
};

function toDb(def: CollectionDef, data: Record<string, any>, mode: 'create' | 'update') {
  const out: Record<string, any> = { ...data };
  for (const [key, rel] of Object.entries(def.relations ?? {})) {
    if (key in out) {
      const ids: string[] = out[key] ?? [];
      out[rel] = mode === 'create' ? { connect: ids.map((id) => ({ id })) } : { set: ids.map((id) => ({ id })) };
      delete out[key];
    }
  }
  for (const d of def.dates ?? []) if (d in out) out[d] = out[d] ? new Date(out[d].length === 10 ? `${out[d]}T00:00:00Z` : out[d]) : null;
  for (const b of def.bigints ?? []) if (b in out) out[b] = out[b] === null || out[b] === undefined ? null : BigInt(out[b]);
  // Category / project relations via scalar FK are fine as-is (categoryId, projectId, vendorId).
  return out;
}

function fromDb(def: CollectionDef, row: any) {
  if (!row) return row;
  const out = { ...row };
  for (const [key, rel] of Object.entries(def.relations ?? {})) if (Array.isArray(row[rel])) out[key] = row[rel].map((r: { id: string }) => r.id);
  for (const d of def.dates ?? []) if (row[d] instanceof Date) out[d] = (def.model === 'blogPost' ? row[d].toISOString() : row[d].toISOString().slice(0, 10));
  return out;
}

export function collectionRouter(key: string) {
  const def = COLLECTIONS[key];
  const r = Router();
  const delegate = () => (prisma as any)[def.model];
  r.use(requirePermission(def.permission ?? 'cms.manage'));

  const listQuery = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
    q: z.string().trim().max(100).optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
    categoryId: z.string().optional(),
    group: z.string().optional(),
  });

  r.get(
    '/',
    validate({ query: listQuery }),
    ah(async (req, res) => {
      const q = qry<z.infer<typeof listQuery>>(req);
      const { page, limit, skip, take } = paginate(q, 200);
      const where: any = {};
      if (q.status) where.status = q.status;
      else where.status = { not: 'ARCHIVED' };
      if (q.categoryId && ['packages', 'projects'].includes(key)) where.categoryId = q.categoryId;
      if (q.group && key === 'faqs') where.group = q.group;
      if (q.q) where.OR = def.search.map((f) => ({ [f]: { contains: q.q, mode: 'insensitive' } }));
      const [items, total] = await Promise.all([
        delegate().findMany({ where, include: def.include, orderBy: def.defaultOrder ?? [{ sortOrder: 'asc' }, { createdAt: 'desc' }], skip, take }),
        delegate().count({ where }),
      ]);
      ok(res, items.map((i: any) => fromDb(def, i)), pageMeta(page, limit, total));
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      const row = await delegate().findUnique({ where: { id: req.params.id }, include: def.include });
      if (!row) throw AppError.notFound(def.label);
      ok(res, fromDb(def, row));
    }),
  );

  r.post(
    '/',
    validate({ body: def.input }),
    ah(async (req, res) => {
      if (req.body.status === 'PUBLISHED' && def.canPublish) {
        const reason = def.canPublish(req.body);
        if (reason) throw new AppError(422, 'PUBLISH_BLOCKED', reason);
      }
      if (key === 'blog' && req.body.status === 'PUBLISHED' && !req.body.publishedAt) req.body.publishedAt = new Date().toISOString();
      const row = await delegate().create({ data: toDb(def, req.body, 'create'), include: def.include });
      await audit(req, { action: `${key}.create`, entityType: def.model, entityId: row.id, summary: String(row[def.titleField] ?? '') });
      ok(res, fromDb(def, row), undefined, 201);
    }),
  );

  r.put(
    '/:id',
    validate({ body: def.input }),
    ah(async (req, res) => {
      const existing = await delegate().findUnique({ where: { id: req.params.id } });
      if (!existing) throw AppError.notFound(def.label);
      if (req.body.status === 'PUBLISHED' && def.canPublish) {
        const reason = def.canPublish(req.body);
        if (reason) throw new AppError(422, 'PUBLISH_BLOCKED', reason);
      }
      if (key === 'blog' && req.body.status === 'PUBLISHED' && !req.body.publishedAt) req.body.publishedAt = (existing.publishedAt ?? new Date()).toISOString();
      const row = await delegate().update({ where: { id: req.params.id }, data: toDb(def, req.body, 'update'), include: def.include });
      await audit(req, { action: `${key}.update`, entityType: def.model, entityId: row.id, summary: String(row[def.titleField] ?? '') });
      ok(res, fromDb(def, row));
    }),
  );

  r.patch(
    '/:id/status',
    validate({ body: z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) }) }),
    ah(async (req, res) => {
      const existing = await delegate().findUnique({ where: { id: req.params.id } });
      if (!existing) throw AppError.notFound(def.label);
      if (req.body.status === 'PUBLISHED' && def.canPublish) {
        const reason = def.canPublish(existing);
        if (reason) throw new AppError(422, 'PUBLISH_BLOCKED', reason);
      }
      const data: any = { status: req.body.status };
      if (key === 'blog' && req.body.status === 'PUBLISHED' && !existing.publishedAt) data.publishedAt = new Date();
      const row = await delegate().update({ where: { id: existing.id }, data });
      await audit(req, { action: `${key}.status`, entityType: def.model, entityId: row.id, summary: `${row[def.titleField]} → ${req.body.status}` });
      ok(res, fromDb(def, row));
    }),
  );

  r.post(
    '/reorder',
    validate({ body: z.object({ ids: z.array(z.string()).min(1).max(500) }) }),
    ah(async (req, res) => {
      if (key === 'blog') throw AppError.badRequest('Blog posts are ordered by date');
      await prisma.$transaction(req.body.ids.map((id: string, i: number) => delegate().update({ where: { id }, data: { sortOrder: i } })));
      ok(res, { ok: true });
    }),
  );

  r.post(
    '/:id/duplicate',
    ah(async (req, res) => {
      const existing = await delegate().findUnique({ where: { id: req.params.id }, include: def.include });
      if (!existing) throw AppError.notFound(def.label);
      const copy = fromDb(def, existing);
      for (const k of ['id', 'createdAt', 'updatedAt', 'category', 'services', 'categories', 'project', 'vendor', '_count']) delete copy[k];
      copy.status = key === 'faqs' ? 'DRAFT' : 'DRAFT';
      copy[def.titleField] = `${copy[def.titleField]} (copy)`.slice(0, 160);
      if (def.hasSlug) {
        let slug = `${existing.slug}-copy`.slice(0, 70);
        for (let n = 2; await delegate().findUnique({ where: { slug } }); n++) slug = `${existing.slug}-copy-${n}`.slice(0, 80);
        copy.slug = slug;
      }
      const data = toDb(def, def.input instanceof z.ZodEffects ? (def.input as any)._def.schema.parse(copy) : def.input.parse(copy), 'create');
      const row = await delegate().create({ data, include: def.include });
      await audit(req, { action: `${key}.duplicate`, entityType: def.model, entityId: row.id, summary: `From ${existing.id}` });
      ok(res, fromDb(def, row), undefined, 201);
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      const existing = await delegate().findUnique({ where: { id: req.params.id } });
      if (!existing) throw AppError.notFound(def.label);
      await delegate().delete({ where: { id: existing.id } });
      await audit(req, { action: `${key}.delete`, entityType: def.model, entityId: existing.id, summary: String(existing[def.titleField] ?? '') });
      ok(res, { ok: true });
    }),
  );

  return r;
}
