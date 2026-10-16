import { Router, type RequestHandler } from 'express';
import { readFileSync } from 'node:fs';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ah } from '../lib/http';
import { publicPackageWhere, publicProjectWhere } from '../services/publicData.service';
import { getPublishedSite } from '../services/siteConfig.service';

export const seoRouter = Router();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const base = async () => (await getPublishedSite()).seo.siteUrl || env.APP_URL;

seoRouter.get(
  '/robots.txt',
  ah(async (_req, res) => {
    const site = await getPublishedSite();
    const url = await base();
    res.type('text/plain').send(site.seo.noIndex ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /portal\nDisallow: /preview\nDisallow: /api/\nDisallow: /rsvp/\n\nSitemap: ${url}/sitemap.xml\n`);
  }),
);

seoRouter.get(
  '/sitemap.xml',
  ah(async (_req, res) => {
    const url = await base();
    const published = { status: 'PUBLISHED' as const };
    const [pages, cats, services, projects, packages, posts, venues] = await Promise.all([
      prisma.page.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, kind: true, updatedAt: true } }),
      prisma.eventCategory.findMany({ where: published, select: { slug: true, updatedAt: true } }),
      prisma.service.findMany({ where: published, select: { slug: true, updatedAt: true } }),
      prisma.portfolioProject.findMany({ where: publicProjectWhere, select: { slug: true, updatedAt: true } }),
      prisma.package.findMany({ where: publicPackageWhere(), select: { slug: true, updatedAt: true } }),
      prisma.blogPost.findMany({ where: { ...published, publishedAt: { lte: new Date() } }, select: { slug: true, updatedAt: true } }),
      prisma.venue.findMany({ where: { isPublic: true, status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    ]);
    const entries: [string, Date | null][] = [
      ['/', null],
      ['/events', null],
      ['/services', null],
      ['/portfolio', null],
      ['/packages', null],
      ['/venues', null],
      ['/journal', null],
      ['/inquire', null],
      ...pages.filter((p) => p.kind !== 'HOME').map((p) => [p.kind === 'ABOUT' ? '/about' : p.kind === 'CONTACT' ? '/contact' : `/${p.slug}`, p.updatedAt] as [string, Date]),
      ...cats.map((c) => [`/events/${c.slug}`, c.updatedAt] as [string, Date]),
      ...services.map((c) => [`/services/${c.slug}`, c.updatedAt] as [string, Date]),
      ...projects.map((c) => [`/portfolio/${c.slug}`, c.updatedAt] as [string, Date]),
      ...packages.map((c) => [`/packages/${c.slug}`, c.updatedAt] as [string, Date]),
      ...posts.map((c) => [`/journal/${c.slug}`, c.updatedAt] as [string, Date]),
      ...venues.map((c) => [`/venues/${c.slug}`, c.updatedAt] as [string, Date]),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Map(entries.map((e) => [e[0], e])).values()].map(([p, d]) => `  <url><loc>${esc(url + p)}</loc>${d ? `<lastmod>${d.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(xml);
  }),
);

interface Meta {
  title: string;
  description: string;
  image: string;
  noIndex?: boolean;
  jsonLd?: object;
}

/** Resolves SEO metadata for a public path so crawlers and link previews get real titles without JS. */
async function metaFor(path: string): Promise<Meta> {
  const site = await getPublishedSite();
  const t = (s: string) => (site.seo.titleTemplate.includes('%s') ? site.seo.titleTemplate.replace('%s', s) : s);
  const def: Meta = { title: site.seo.title || site.brand.name, description: site.seo.description, image: site.seo.image };
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const published = { status: 'PUBLISHED' as const };
  const pick = (seo: unknown, title: string, desc: string, image: string): Meta => {
    const s = (seo ?? {}) as { title?: string; description?: string; image?: string; noIndex?: boolean };
    return { title: t(s.title || title), description: s.description || desc || def.description, image: s.image || image || def.image, noIndex: s.noIndex };
  };
  try {
    if (!seg.length) return def;
    if (['admin', 'portal', 'preview', 'login', 'register', 'reset-password', 'verify-email', 'rsvp'].includes(seg[0])) return { ...def, noIndex: true };
    if (seg[0] === 'events' && seg[1]) {
      const c = await prisma.eventCategory.findFirst({ where: { slug: seg[1], ...published } });
      if (c) return pick(c.seo, c.name, c.summary, c.coverImage);
    }
    if (seg[0] === 'services' && seg[1]) {
      const c = await prisma.service.findFirst({ where: { slug: seg[1], ...published } });
      if (c) return pick(c.seo, c.name, c.summary, c.coverImage);
    }
    if (seg[0] === 'portfolio' && seg[1]) {
      const c = await prisma.portfolioProject.findFirst({ where: { slug: seg[1], ...publicProjectWhere } });
      if (c) return pick(c.seo, c.title, c.summary, c.coverImage);
    }
    if (seg[0] === 'packages' && seg[1]) {
      const c = await prisma.package.findFirst({ where: { slug: seg[1], ...publicPackageWhere() } });
      if (c) return pick({}, c.name, c.summary, c.coverImage);
    }
    if (seg[0] === 'journal' && seg[1]) {
      const c = await prisma.blogPost.findFirst({ where: { slug: seg[1], ...published } });
      if (c) return { ...pick(c.seo, c.title, c.excerpt, c.coverImage), jsonLd: { '@context': 'https://schema.org', '@type': 'Article', headline: c.title, datePublished: c.publishedAt, author: c.authorName ? { '@type': 'Person', name: c.authorName } : undefined, image: c.coverImage || undefined } };
    }
    const kindMap: Record<string, string> = { about: 'ABOUT', contact: 'CONTACT' };
    const page = kindMap[seg[0]] ? await prisma.page.findFirst({ where: { kind: kindMap[seg[0]], status: 'PUBLISHED' } }) : await prisma.page.findFirst({ where: { slug: seg[0], status: 'PUBLISHED' } });
    if (page) {
      const v = await prisma.pageVersion.findUnique({ where: { pageId_version: { pageId: page.id, version: page.publishedVersion } } });
      const c = (v?.content ?? {}) as { title?: string; seo?: unknown; featuredImage?: string };
      return pick(c.seo, c.title ?? page.title, '', c.featuredImage ?? '');
    }
    const titles: Record<string, string> = { events: 'Event categories', services: 'Services', portfolio: 'Portfolio', packages: 'Packages', journal: 'Journal', venues: 'Venues & destinations', inquire: 'Book your event', track: 'Track your inquiry' };
    if (titles[seg[0]]) return { ...def, title: t(titles[seg[0]]) };
  } catch {
    /* fall back to defaults */
  }
  return def;
}

/** Serves the SPA shell with per-route <title>, description, Open Graph and JSON-LD injected. */
export function renderSpaShell(indexFile: string): RequestHandler {
  let template: string | null = null;
  return ah(async (req, res) => {
    template ??= readFileSync(indexFile, 'utf8');
    const site = await getPublishedSite();
    const m = await metaFor(req.path);
    const baseUrl = await base();
    const url = baseUrl + req.path;
    const org = {
      '@context': 'https://schema.org',
      '@type': site.seo.organizationType,
      name: site.brand.name,
      url: baseUrl,
      email: site.company.email || undefined,
      telephone: site.company.phone || undefined,
      address: site.company.addressLine ? { '@type': 'PostalAddress', streetAddress: site.company.addressLine, addressLocality: site.company.city, addressRegion: site.company.region, postalCode: site.company.postalCode, addressCountry: site.company.country } : undefined,
      sameAs: site.social.map((s) => s.url).filter(Boolean),
      logo: site.brand.logoUrl ? (site.brand.logoUrl.startsWith('http') ? site.brand.logoUrl : `${baseUrl}${site.brand.logoUrl}`) : undefined,
    };
    const image = m.image && !m.image.startsWith('http') ? `${baseUrl}${m.image}` : m.image;
    const head = [
      `<title>${esc(m.title)}</title>`,
      `<meta name="description" content="${esc(m.description)}">`,
      `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${esc(site.brand.name)}">`,
      `<meta property="og:title" content="${esc(m.title)}">`,
      `<meta property="og:description" content="${esc(m.description)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      image ? `<meta property="og:image" content="${esc(image)}">` : '',
      `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
      m.noIndex || site.seo.noIndex ? '<meta name="robots" content="noindex,nofollow">' : '',
      site.brand.faviconUrl ? `<link rel="icon" href="${esc(site.brand.faviconUrl)}">` : '',
      `<script type="application/ld+json">${JSON.stringify(org).replace(/</g, '\\u003c')}</script>`,
      m.jsonLd ? `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
    ]
      .filter(Boolean)
      .join('\n    ');
    const html = template.replace(/<title>[\s\S]*?<\/title>/, '').replace('<!--seo-->', head);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
}
