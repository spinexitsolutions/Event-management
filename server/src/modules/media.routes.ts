import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { deleteStored, storeFile } from '../services/storage.service';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 20 } });

export const mediaRouter = Router();
mediaRouter.use(requirePermission('media.manage'));

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: z.string().trim().max(100).optional(),
  kind: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  folder: z.string().trim().max(80).optional(),
});

mediaRouter.get(
  '/',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof listQuery>>(req);
    const { page, limit, skip, take } = paginate(q, 200);
    const where = {
      isPrivate: false,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.folder ? { folder: q.folder } : {}),
      ...(q.q ? { OR: [{ filename: { contains: q.q, mode: 'insensitive' as const } }, { alt: { contains: q.q, mode: 'insensitive' as const } }, { tags: { has: q.q.toLowerCase() } }] } : {}),
    };
    const [items, total, folders] = await Promise.all([
      prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.mediaAsset.count({ where }),
      prisma.mediaAsset.groupBy({ by: ['folder'], where: { isPrivate: false }, _count: true, orderBy: { folder: 'asc' } }),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), folders: folders.map((f) => ({ name: f.folder, count: f._count })) });
  }),
);

mediaRouter.post(
  '/',
  upload.array('files', 20),
  ah(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw AppError.badRequest('Choose at least one file');
    const folder = String(req.body.folder ?? 'General').slice(0, 80) || 'General';
    const created = [];
    const errors: { filename: string; message: string }[] = [];
    for (const f of files) {
      try {
        const stored = await storeFile(f.buffer, f.originalname, { allow: ['IMAGE', 'VIDEO'] });
        created.push(
          await prisma.mediaAsset.create({
            data: { ...stored, filename: f.originalname.slice(0, 200), folder, alt: String(req.body.alt ?? '').slice(0, 200), uploadedById: req.user!.id, tags: [] },
          }),
        );
      } catch (e) {
        errors.push({ filename: f.originalname, message: (e as Error).message });
      }
    }
    if (!created.length) throw new AppError(415, 'UPLOAD_FAILED', errors[0]?.message ?? 'Upload failed', errors);
    ok(res, created, { errors }, 201);
  }),
);

/** Registers an external (e.g. Unsplash/Pexels) https image in the library with its licence credit. */
mediaRouter.post(
  '/external',
  validate({
    body: z.object({
      url: z.string().url().startsWith('https://'),
      alt: z.string().trim().max(200).default(''),
      credit: z.string().trim().max(200).default(''),
      folder: z.string().trim().max(80).default('General'),
      kind: z.enum(['IMAGE', 'VIDEO']).default('IMAGE'),
    }),
  }),
  ah(async (req, res) => {
    const m = await prisma.mediaAsset.create({
      data: { url: req.body.url, provider: 'external', kind: req.body.kind, mime: req.body.kind === 'IMAGE' ? 'image/*' : 'video/*', filename: req.body.url.split('/').pop()?.split('?')[0]?.slice(0, 120) || 'external', alt: req.body.alt, credit: req.body.credit, folder: req.body.folder, uploadedById: req.user!.id, tags: [] },
    });
    ok(res, m, undefined, 201);
  }),
);

mediaRouter.patch(
  '/:id',
  validate({
    body: z.object({
      alt: z.string().trim().max(200).optional(),
      caption: z.string().trim().max(200).optional(),
      credit: z.string().trim().max(200).optional(),
      folder: z.string().trim().min(1).max(80).optional(),
      tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(20).optional(),
    }),
  }),
  ah(async (req, res) => {
    const m = await prisma.mediaAsset.update({ where: { id: req.params.id, isPrivate: false }, data: req.body });
    ok(res, m);
  }),
);

/** Replaces the file behind an asset. Keeps the id; the URL changes, so references are updated everywhere. */
mediaRouter.post(
  '/:id/replace',
  upload.single('file'),
  ah(async (req, res) => {
    const existing = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, isPrivate: false } });
    if (!existing) throw AppError.notFound('Media');
    if (!req.file) throw AppError.badRequest('Choose a file');
    const stored = await storeFile(req.file.buffer, req.file.originalname, { allow: [existing.kind === 'DOCUMENT' ? 'DOCUMENT' : existing.kind] });
    const updated = await prisma.mediaAsset.update({ where: { id: existing.id }, data: { ...stored, filename: req.file.originalname.slice(0, 200) } });
    const replaced = await replaceUrlReferences(existing.url, stored.url);
    await deleteStored(existing.provider, existing.storageKey, false);
    await audit(req, { action: 'media.replace', entityType: 'MediaAsset', entityId: existing.id, summary: `Replaced ${existing.filename}; updated ${replaced} references` });
    ok(res, updated, { referencesUpdated: replaced });
  }),
);

mediaRouter.get(
  '/:id/usage',
  ah(async (req, res) => {
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: req.params.id } });
    ok(res, await findUrlUsage(m.url));
  }),
);

mediaRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const m = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, isPrivate: false } });
    if (!m) throw AppError.notFound('Media');
    const usage = await findUrlUsage(m.url);
    if (usage.length && req.query.force !== 'true') throw new AppError(409, 'IN_USE', `This file is used in ${usage.length} place(s). Replace it or remove it there first.`, usage);
    await prisma.mediaAsset.delete({ where: { id: m.id } });
    await deleteStored(m.provider, m.storageKey, false);
    await audit(req, { action: 'media.delete', entityType: 'MediaAsset', entityId: m.id, summary: m.filename });
    ok(res, { ok: true });
  }),
);

/* ───── URL reference tracking across content (JSON text search) ───── */

const TEXT_TABLES: { table: string; label: string; titleCol: string }[] = [
  { table: 'Page', label: 'Page', titleCol: 'title' },
  { table: 'SiteConfig', label: 'Site settings', titleCol: 'key' },
  { table: 'EventCategory', label: 'Event category', titleCol: 'name' },
  { table: 'Service', label: 'Service', titleCol: 'name' },
  { table: 'Package', label: 'Package', titleCol: 'name' },
  { table: 'PortfolioProject', label: 'Portfolio project', titleCol: 'title' },
  { table: 'Testimonial', label: 'Testimonial', titleCol: 'clientName' },
  { table: 'TeamMember', label: 'Team member', titleCol: 'name' },
  { table: 'ClientLogo', label: 'Client logo', titleCol: 'name' },
  { table: 'BlogPost', label: 'Blog post', titleCol: 'title' },
  { table: 'Venue', label: 'Venue', titleCol: 'name' },
];

export async function findUrlUsage(url: string) {
  if (!url) return [];
  const out: { type: string; title: string }[] = [];
  for (const t of TEXT_TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ title: string }[]>(`SELECT "${t.titleCol}"::text AS title FROM "${t.table}" WHERE row_to_json("${t.table}")::text LIKE $1 LIMIT 20`, `%${url.replace(/[%_]/g, '\\$&')}%`);
    for (const r of rows) out.push({ type: t.label, title: r.title });
  }
  return out;
}

/** Rewrites URL references inside text/JSON columns of content tables. Returns rows touched. */
async function replaceUrlReferences(oldUrl: string, newUrl: string) {
  if (!oldUrl || oldUrl === newUrl) return 0;
  let total = 0;
  const jsonCols: Record<string, string[]> = {
    Page: ['draft'],
    // Published snapshots are updated too, so replacing a file never leaves a live page with a broken image.
    PageVersion: ['content'],
    SiteConfigVersion: ['data'],
    SiteConfig: ['draft', 'published'],
    EventCategory: ['gallery', 'seo'],
    Service: ['gallery', 'seo'],
    Package: ['gallery'],
    PortfolioProject: ['gallery', 'beforeAfter', 'seo'],
    Venue: ['images'],
    BlogPost: ['seo'],
  };
  const textCols: Record<string, string[]> = {
    EventCategory: ['coverImage'],
    Service: ['coverImage'],
    Package: ['coverImage'],
    PortfolioProject: ['coverImage', 'videoUrl'],
    Testimonial: ['photoUrl'],
    TeamMember: ['photoUrl'],
    ClientLogo: ['logoUrl'],
    BlogPost: ['coverImage'],
    Venue: ['coverImage'],
  };
  for (const [table, cols] of Object.entries(jsonCols)) {
    for (const c of cols) {
      total += await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${c}" = replace("${c}"::text, $1, $2)::jsonb WHERE "${c}"::text LIKE $3`, oldUrl, newUrl, `%${oldUrl.replace(/[%_]/g, '\\$&')}%`);
    }
  }
  for (const [table, cols] of Object.entries(textCols)) {
    for (const c of cols) total += await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${c}" = $2 WHERE "${c}" = $1`, oldUrl, newUrl);
  }
  return total;
}
