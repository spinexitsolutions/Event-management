import { businessSettingsSchema, siteSettingsSchema, themeTokensSchema, type BusinessSettings, type SiteSettings, type ThemeTokens } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { DEFAULT_BUSINESS, DEFAULT_SITE, DEFAULT_THEME_TOKENS } from '../content/defaults';

/**
 * Site configuration documents with draft → publish → versions:
 *   "theme" (ThemeTokens) and "site" (SiteSettings: branding, navigation, footer, contact, SEO …).
 * "business" (private BusinessSettings) is saved directly (no publishing).
 */
export type ConfigKey = 'theme' | 'site';
const SCHEMAS = { theme: themeTokensSchema, site: siteSettingsSchema } as const;
const DEFAULTS = { theme: DEFAULT_THEME_TOKENS, site: DEFAULT_SITE } as const;

const CACHE_MS = 15_000;
const cache = new Map<string, { at: number; value: unknown; version: number }>();
export const invalidateConfigCache = () => cache.clear();

async function ensure(key: ConfigKey | 'business') {
  const row = await prisma.siteConfig.findUnique({ where: { key } });
  if (row) return row;
  const initial = key === 'business' ? DEFAULT_BUSINESS : DEFAULTS[key];
  return prisma.siteConfig.upsert({
    where: { key },
    update: {},
    create: { key, draft: initial as object, published: initial as object, publishedVersion: key === 'business' ? 0 : 1, versions: key === 'business' ? undefined : { create: { version: 1, data: initial as object, note: 'Initial version' } } },
  });
}

async function published<T>(key: ConfigKey): Promise<{ value: T; version: number }> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { value: hit.value as T, version: hit.version };
  const row = await ensure(key);
  // Parse with schema so newly added fields get defaults even for older stored versions.
  const parsed = SCHEMAS[key].safeParse(row.published ?? DEFAULTS[key]);
  const value = (parsed.success ? parsed.data : DEFAULTS[key]) as T;
  cache.set(key, { at: Date.now(), value, version: row.publishedVersion });
  return { value, version: row.publishedVersion };
}

export const getPublishedTheme = async () => (await published<ThemeTokens>('theme')).value;
export const getPublishedSite = async () => (await published<SiteSettings>('site')).value;
export async function getPublishedBundle() {
  const [theme, site] = await Promise.all([published<ThemeTokens>('theme'), published<SiteSettings>('site')]);
  return { theme: theme.value, site: site.value, version: `${theme.version}.${site.version}` };
}

export async function getDraft(key: ConfigKey) {
  const row = await ensure(key);
  const latest = await prisma.siteConfigVersion.findFirst({ where: { configKey: key }, orderBy: { version: 'desc' } });
  return {
    draft: row.draft,
    published: row.published,
    publishedVersion: row.publishedVersion,
    hasUnpublishedChanges: JSON.stringify(row.draft) !== JSON.stringify(row.published),
    updatedAt: row.updatedAt,
    lastPublishedAt: latest?.createdAt ?? null,
  };
}

/** Drafts are validated loosely (shape) so editors can save work in progress; publish validates strictly. */
export async function saveDraft(key: ConfigKey, data: unknown, userId?: string) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw AppError.badRequest('Draft must be an object');
  await ensure(key);
  const row = await prisma.siteConfig.update({ where: { key }, data: { draft: data as object, updatedById: userId ?? null } });
  return row.draft;
}

export async function publishConfig(key: ConfigKey, userId?: string, note = '') {
  const row = await ensure(key);
  const parsed = SCHEMAS[key].safeParse(row.draft);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Fix the highlighted settings before publishing', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  const version = row.publishedVersion + 1;
  await prisma.$transaction([
    prisma.siteConfigVersion.create({ data: { configKey: key, version, data: parsed.data as object, note, publishedById: userId ?? null } }),
    prisma.siteConfig.update({ where: { key }, data: { draft: parsed.data as object, published: parsed.data as object, publishedVersion: version } }),
  ]);
  invalidateConfigCache();
  return { version };
}

export const listVersions = (key: ConfigKey) =>
  prisma.siteConfigVersion.findMany({ where: { configKey: key }, orderBy: { version: 'desc' }, take: 50, select: { id: true, version: true, note: true, createdAt: true, publishedById: true } });

/** Restores an older version into the draft (the editor then reviews and publishes it). */
export async function restoreVersion(key: ConfigKey, version: number, userId?: string) {
  const v = await prisma.siteConfigVersion.findUnique({ where: { configKey_version: { configKey: key, version } } });
  if (!v) throw AppError.notFound('Version');
  await prisma.siteConfig.update({ where: { key }, data: { draft: v.data as object, updatedById: userId ?? null } });
  return v.data;
}

export async function discardDraft(key: ConfigKey) {
  const row = await ensure(key);
  await prisma.siteConfig.update({ where: { key }, data: { draft: row.published ?? DEFAULTS[key] } });
}

export async function getBusiness(): Promise<BusinessSettings> {
  const hit = cache.get('business');
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as BusinessSettings;
  const row = await ensure('business');
  const parsed = businessSettingsSchema.safeParse(row.draft);
  const value = parsed.success ? parsed.data : DEFAULT_BUSINESS;
  cache.set('business', { at: Date.now(), value, version: 0 });
  return value;
}

export async function updateBusiness(data: unknown, userId?: string) {
  const parsed = businessSettingsSchema.parse(data);
  await ensure('business');
  await prisma.siteConfig.update({ where: { key: 'business' }, data: { draft: parsed as object, published: parsed as object, updatedById: userId ?? null } });
  invalidateConfigCache();
  return parsed;
}
