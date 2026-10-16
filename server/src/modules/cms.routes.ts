import { Router } from 'express';
import { z } from 'zod';
import { pageDraftSchema, pageMetaSchema, RESERVED_SLUGS, slugSchema, validateSections, seoSchema, mediaUrl } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { ah, ok } from '../lib/http';
import { requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { renderableSections, resolveSectionData } from '../services/publicData.service';
import { discardDraft, getDraft, listVersions, publishConfig, restoreVersion, saveDraft, type ConfigKey } from '../services/siteConfig.service';
import { DEFAULT_EMAIL_TEMPLATES } from '../services/templates';

export const cmsRouter = Router();

/* ───────────────────────── Pages ───────────────────────── */

const pages = Router();
pages.use(requirePermission('cms.manage'));

pages.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.page.findMany({ orderBy: [{ kind: 'asc' }, { title: 'asc' }], select: { id: true, slug: true, kind: true, title: true, status: true, hasUnpublished: true, publishedVersion: true, updatedAt: true } });
    ok(res, rows);
  }),
);

pages.post(
  '/',
  validate({ body: pageMetaSchema.extend({ kind: z.enum(['STANDARD', 'LEGAL']).default('STANDARD'), templateFrom: z.string().optional() }) }),
  ah(async (req, res) => {
    if (RESERVED_SLUGS.includes(req.body.slug)) throw new AppError(422, 'RESERVED_SLUG', 'This URL is used by a built-in page. Choose another.');
    let sections: unknown[] = [];
    if (req.body.templateFrom) {
      const src = await prisma.page.findUnique({ where: { id: req.body.templateFrom } });
      sections = ((src?.draft as { sections?: unknown[] })?.sections ?? []).map((s) => ({ ...(s as object), id: `s_${Math.random().toString(36).slice(2, 12)}` }));
    }
    const page = await prisma.page.create({
      data: { slug: req.body.slug, kind: req.body.kind, title: req.body.title, draft: { title: req.body.title, seo: req.body.seo, featuredImage: req.body.featuredImage, sections } as object, updatedById: req.user!.id },
    });
    await audit(req, { action: 'page.create', entityType: 'Page', entityId: page.id, summary: page.slug });
    ok(res, page, undefined, 201);
  }),
);

pages.get(
  '/:id',
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    ok(res, page);
  }),
);

/** Autosave target. Drafts may be incomplete. */
pages.put(
  '/:id/draft',
  validate({ body: pageDraftSchema }),
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    const draft = { ...(page.draft as object), ...req.body };
    const updated = await prisma.page.update({ where: { id: page.id }, data: { draft, hasUnpublished: true, updatedById: req.user!.id, title: req.body.title ?? page.title } });
    ok(res, { id: updated.id, updatedAt: updated.updatedAt, hasUnpublished: true });
  }),
);

pages.patch(
  '/:id/meta',
  validate({ body: z.object({ slug: slugSchema.optional(), title: z.string().trim().min(1).max(120).optional() }) }),
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    if (req.body.slug && page.kind === 'HOME') throw AppError.badRequest('The homepage URL cannot be changed');
    if (req.body.slug && RESERVED_SLUGS.includes(req.body.slug)) throw new AppError(422, 'RESERVED_SLUG', 'This URL is used by a built-in page');
    const updated = await prisma.page.update({ where: { id: page.id }, data: req.body });
    await audit(req, { action: 'page.meta', entityType: 'Page', entityId: page.id, changes: req.body });
    ok(res, updated);
  }),
);

pages.post(
  '/:id/publish',
  validate({ body: z.object({ note: z.string().trim().max(200).default('') }) }),
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    const draft = page.draft as { title?: string; seo?: unknown; featuredImage?: string; sections?: unknown[] };
    const meta = z.object({ title: z.string().trim().min(1).max(120), seo: seoSchema.default({}), featuredImage: mediaUrl.default('') }).safeParse({ title: draft.title ?? page.title, seo: draft.seo, featuredImage: draft.featuredImage });
    if (!meta.success) throw new AppError(422, 'VALIDATION_ERROR', 'Page settings are invalid', meta.error.issues.map((i) => ({ path: `meta.${i.path.join('.')}`, message: i.message })));
    const result = validateSections(draft.sections ?? []);
    if (!result.ok) throw new AppError(422, 'SECTION_ERRORS', `${result.errors.length} section(s) need attention before publishing`, result.errors);
    const version = page.publishedVersion + 1;
    const content = { ...meta.data, sections: result.sections };
    await prisma.$transaction([
      prisma.pageVersion.create({ data: { pageId: page.id, version, content: content as object, note: req.body.note, publishedById: req.user!.id } }),
      prisma.page.update({ where: { id: page.id }, data: { status: 'PUBLISHED', publishedVersion: version, hasUnpublished: false, title: meta.data.title, draft: content as object } }),
    ]);
    await audit(req, { action: 'page.publish', entityType: 'Page', entityId: page.id, summary: `${page.slug} v${version}` });
    ok(res, { version });
  }),
);

pages.post(
  '/:id/unpublish',
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    if (page.kind === 'HOME') throw AppError.badRequest('The homepage cannot be unpublished');
    await prisma.page.update({ where: { id: page.id }, data: { status: 'UNPUBLISHED' } });
    await audit(req, { action: 'page.unpublish', entityType: 'Page', entityId: page.id, summary: page.slug });
    ok(res, { ok: true });
  }),
);

pages.get(
  '/:id/versions',
  ah(async (req, res) => {
    ok(res, await prisma.pageVersion.findMany({ where: { pageId: req.params.id }, orderBy: { version: 'desc' }, take: 50, select: { id: true, version: true, note: true, createdAt: true, publishedById: true } }));
  }),
);

/** Restores a published version into the draft (review, then publish again) — or publishes it directly. */
pages.post(
  '/:id/versions/:version/restore',
  validate({ body: z.object({ publish: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    const v = await prisma.pageVersion.findUnique({ where: { pageId_version: { pageId: req.params.id, version: Number(req.params.version) } } });
    if (!v) throw AppError.notFound('Version');
    const page = await prisma.page.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.body.publish) {
      const version = page.publishedVersion + 1;
      await prisma.$transaction([
        prisma.pageVersion.create({ data: { pageId: page.id, version, content: v.content as object, note: `Restored from v${v.version}`, publishedById: req.user!.id } }),
        prisma.page.update({ where: { id: page.id }, data: { draft: v.content as object, status: 'PUBLISHED', publishedVersion: version, hasUnpublished: false } }),
      ]);
    } else {
      await prisma.page.update({ where: { id: page.id }, data: { draft: v.content as object, hasUnpublished: true } });
    }
    await audit(req, { action: 'page.restore', entityType: 'Page', entityId: page.id, summary: `v${v.version}${req.body.publish ? ' (published)' : ''}` });
    ok(res, { ok: true });
  }),
);

pages.post(
  '/:id/discard',
  ah(async (req, res) => {
    const page = await prisma.page.findUniqueOrThrow({ where: { id: req.params.id } });
    const latest = await prisma.pageVersion.findFirst({ where: { pageId: page.id }, orderBy: { version: 'desc' } });
    if (!latest) throw AppError.badRequest('This page has never been published');
    await prisma.page.update({ where: { id: page.id }, data: { draft: latest.content as object, hasUnpublished: false } });
    ok(res, { ok: true });
  }),
);

/** Draft preview payload, shaped exactly like the public page response. */
pages.get(
  '/:id/preview',
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    const draft = page.draft as { title?: string; seo?: unknown; sections?: unknown[] };
    const sections = renderableSections(draft.sections ?? []);
    const invalid = (draft.sections?.length ?? 0) - sections.length;
    ok(res, { slug: page.slug, kind: page.kind, title: draft.title ?? page.title, seo: draft.seo ?? {}, sections, data: await resolveSectionData(sections), invalidSections: invalid });
  }),
);

pages.delete(
  '/:id',
  ah(async (req, res) => {
    const page = await prisma.page.findUnique({ where: { id: req.params.id } });
    if (!page) throw AppError.notFound('Page');
    if (['HOME', 'ABOUT', 'CONTACT'].includes(page.kind)) throw AppError.badRequest('Built-in pages cannot be deleted (you can edit or hide their sections)');
    await prisma.page.delete({ where: { id: page.id } });
    await audit(req, { action: 'page.delete', entityType: 'Page', entityId: page.id, summary: page.slug });
    ok(res, { ok: true });
  }),
);

cmsRouter.use('/pages', pages);

/* ───────────────────────── Theme & global site settings ───────────────────────── */

const site = Router();
const keyParam = (k: string): ConfigKey => {
  if (k !== 'theme' && k !== 'site') throw AppError.notFound('Configuration');
  return k;
};
site.use(requirePermission('theme.manage'));

site.get('/:key', ah(async (req, res) => ok(res, await getDraft(keyParam(req.params.key)))));
site.put(
  '/:key/draft',
  ah(async (req, res) => ok(res, await saveDraft(keyParam(req.params.key), req.body, req.user!.id))),
);
site.post(
  '/:key/publish',
  validate({ body: z.object({ note: z.string().trim().max(200).default('') }) }),
  ah(async (req, res) => {
    const key = keyParam(req.params.key);
    const r = await publishConfig(key, req.user!.id, req.body.note);
    await audit(req, { action: `${key}.publish`, entityType: 'SiteConfig', entityId: key, summary: `v${r.version}` });
    ok(res, r);
  }),
);
site.post('/:key/discard', ah(async (req, res) => ok(res, await discardDraft(keyParam(req.params.key)))));
site.get('/:key/versions', ah(async (req, res) => ok(res, await listVersions(keyParam(req.params.key)))));
site.post(
  '/:key/versions/:version/restore',
  ah(async (req, res) => {
    const key = keyParam(req.params.key);
    const data = await restoreVersion(key, Number(req.params.version), req.user!.id);
    await audit(req, { action: `${key}.restore`, entityType: 'SiteConfig', entityId: key, summary: `v${req.params.version} → draft` });
    ok(res, data);
  }),
);

cmsRouter.use('/site', site);

/* ───────────────────────── Email templates ───────────────────────── */

const templates = Router();
templates.use(requireAnyPermission('notifications.manage'));
templates.get(
  '/',
  ah(async (_req, res) => {
    const rows = await prisma.emailTemplate.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    ok(
      res,
      Object.entries(DEFAULT_EMAIL_TEMPLATES).map(([key, d]) => {
        const r = byKey.get(key);
        return { key, name: d.name, subject: r?.subject ?? d.subject, body: r?.body ?? d.body, enabled: r?.enabled ?? true, customised: !!r, variables: [...new Set((d.subject + d.body).match(/\{\{\s*\w+\s*\}\}/g) ?? [])].map((v) => v.replace(/[{}\s]/g, '')) };
      }),
    );
  }),
);
templates.put(
  '/:key',
  validate({ body: z.object({ subject: z.string().trim().min(1).max(250), body: z.string().trim().min(1).max(10000), enabled: z.boolean().default(true) }) }),
  ah(async (req, res) => {
    const def = DEFAULT_EMAIL_TEMPLATES[req.params.key];
    if (!def) throw AppError.notFound('Template');
    const row = await prisma.emailTemplate.upsert({ where: { key: req.params.key }, update: req.body, create: { key: req.params.key, name: def.name, ...req.body } });
    await audit(req, { action: 'template.update', entityType: 'EmailTemplate', entityId: row.key });
    ok(res, row);
  }),
);
templates.delete(
  '/:key',
  ah(async (req, res) => {
    await prisma.emailTemplate.deleteMany({ where: { key: req.params.key } });
    ok(res, { ok: true });
  }),
);
cmsRouter.use('/email-templates', templates);
