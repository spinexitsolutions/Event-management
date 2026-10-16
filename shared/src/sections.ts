import { z } from 'zod';
import { ctaSchema, imageSchema, mediaUrl } from './common';

/**
 * CMS section registry for the public website.
 *
 * Every page is an ordered list of sections. Each section `type` maps to
 *  - a zod `props` schema (server validates on publish; client parses before rendering, applying defaults)
 *  - builder metadata (`SECTION_META`): label, description, editable fields, layout variants, defaults
 *  - a React renderer on the client (client/src/sections/registry.tsx)
 */

const text = (max = 120) => z.string().trim().max(max).default('');
const longText = (max = 2000) => z.string().trim().max(max).default('');

export const sectionBackgroundSchema = z.object({
  variant: z.enum(['default', 'surface', 'contrast', 'image']).default('default'),
  imageUrl: mediaUrl.default(''),
  overlay: z.number().min(0).max(1).default(0.55),
});

const common = {
  eyebrow: text(60),
  heading: text(160),
  subheading: longText(500),
  anchorId: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9-]*$/, 'Lowercase letters, numbers and hyphens')
    .default(''),
  background: sectionBackgroundSchema.default({}),
};

const variant = <T extends [string, ...string[]]>(values: T) => z.enum(values).default(values[0] as never);

export const heroSlideSchema = z.object({
  imageUrl: mediaUrl,
  alt: z.string().trim().max(200).default(''),
  /** Optional licensed background video (mp4/webm). Poster = imageUrl. Not autoplayed on mobile / reduced motion. */
  videoUrl: mediaUrl.default(''),
  caption: text(120),
});

const statItem = z.object({
  label: z.string().trim().min(1).max(50),
  value: z.number().min(0).max(10_000_000).default(0),
  suffix: z.string().trim().max(6).default(''),
  /** `manual` shows `value` (only publish verified figures); other metrics are calculated from the database. */
  metric: z.enum(['manual', 'completedEvents', 'clientsServed', 'citiesServed', 'publishedProjects']).default('manual'),
});

const featureItem = z.object({
  icon: z.string().trim().max(40).default('sparkles'),
  title: z.string().trim().min(1).max(80),
  body: text(400),
});

const processStep = z.object({ title: z.string().trim().min(1).max(80), body: text(400) });

export const sectionPropsSchemas = {
  hero: z.object({
    ...common,
    headline: z.string().trim().min(1).max(140),
    subheadline: longText(320),
    slides: z.array(heroSlideSchema).min(1, 'Add at least one hero image').max(8),
    ctas: z.array(ctaSchema).max(3).default([]),
    variant: variant(['fullscreen', 'split', 'centered']),
    align: z.enum(['left', 'center']).default('left'),
    overlay: z.number().min(0).max(1).default(0.45),
    intervalSeconds: z.number().int().min(3).max(20).default(7),
    showScrollHint: z.boolean().default(true),
  }),
  intro: z.object({
    ...common,
    body: longText(4000),
    imageUrl: mediaUrl.default(''),
    imageAlt: text(200),
    secondaryImageUrl: mediaUrl.default(''),
    signature: text(80),
    cta: ctaSchema.optional(),
    variant: variant(['split', 'editorial']),
  }),
  categories: z.object({ ...common, limit: z.number().int().min(1).max(24).default(8), variant: variant(['mosaic', 'grid', 'carousel']) }),
  featuredProjects: z.object({
    ...common,
    limit: z.number().int().min(1).max(12).default(4),
    featuredOnly: z.boolean().default(true),
    categorySlug: text(80),
    variant: variant(['editorial', 'grid', 'carousel']),
    cta: ctaSchema.optional(),
  }),
  services: z.object({ ...common, limit: z.number().int().min(1).max(30).default(9), variant: variant(['cards', 'list', 'compact']) }),
  features: z.object({
    ...common,
    items: z.array(featureItem).min(1).max(12),
    imageUrl: mediaUrl.default(''),
    imageAlt: text(200),
    variant: variant(['grid', 'split']),
  }),
  process: z.object({ ...common, steps: z.array(processStep).min(1).max(10), variant: variant(['timeline', 'numbered']) }),
  gallery: z.object({
    ...common,
    source: z.enum(['manual', 'portfolio']).default('manual'),
    images: z.array(imageSchema).max(40).default([]),
    limit: z.number().int().min(1).max(40).default(12),
    variant: variant(['masonry', 'grid', 'carousel']),
  }),
  testimonials: z.object({ ...common, limit: z.number().int().min(1).max(24).default(6), variant: variant(['carousel', 'grid', 'spotlight']) }),
  packages: z.object({ ...common, limit: z.number().int().min(1).max(12).default(3), featuredOnly: z.boolean().default(false), variant: variant(['cards', 'list']) }),
  venues: z.object({ ...common, limit: z.number().int().min(1).max(12).default(4), variant: variant(['cards', 'carousel']) }),
  stats: z.object({ ...common, items: z.array(statItem).min(1).max(6), footnote: text(160) }),
  logos: z.object({ ...common, limit: z.number().int().min(1).max(40).default(12), variant: variant(['marquee', 'grid']), grayscale: z.boolean().default(true) }),
  faq: z.object({ ...common, limit: z.number().int().min(1).max(50).default(8), group: text(60), variant: variant(['accordion', 'two-column']) }),
  cta: z.object({
    ...common,
    body: longText(600),
    ctas: z.array(ctaSchema).max(3).default([]),
    imageUrl: mediaUrl.default(''),
    variant: variant(['image', 'minimal', 'split']),
  }),
  inquiryForm: z.object({ ...common, body: longText(600), variant: variant(['card', 'inline']) }),
  contact: z.object({ ...common, body: longText(800), showMap: z.boolean().default(true), showForm: z.boolean().default(true) }),
  newsletter: z.object({ ...common, body: longText(400) }),
  richText: z.object({ ...common, body: longText(20000), align: z.enum(['left', 'center']).default('left'), width: z.enum(['narrow', 'wide']).default('narrow') }),
  imageText: z.object({
    ...common,
    body: longText(4000),
    imageUrl: mediaUrl.default(''),
    imageAlt: text(200),
    imageSide: z.enum(['left', 'right']).default('right'),
    ctas: z.array(ctaSchema).max(2).default([]),
  }),
  video: z.object({
    ...common,
    /** Licensed mp4/webm URL, or a YouTube/Vimeo URL. */
    videoUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || /^(\/(?!\/)|https:\/\/)/.test(v), 'Use an uploaded video or an https URL')
      .default(''),
    posterUrl: mediaUrl.default(''),
    posterAlt: text(200),
  }),
  stage3d: z.object({
    ...common,
    body: longText(800),
    preset: z.enum(['wedding-mandap', 'concert-stage', 'gala-dinner']).default('wedding-mandap'),
    accentColor: z.string().regex(/^#([0-9a-fA-F]{6})$/).or(z.literal('')).default(''),
    ctas: z.array(ctaSchema).max(2).default([]),
    posterUrl: mediaUrl.default(''),
  }),
  team: z.object({ ...common, limit: z.number().int().min(1).max(40).default(8) }),
  blog: z.object({ ...common, limit: z.number().int().min(1).max(12).default(3) }),
  quote: z.object({ ...common, quote: z.string().trim().min(1).max(500), attribution: text(120), imageUrl: mediaUrl.default('') }),
};

export type SectionType = keyof typeof sectionPropsSchemas;
export const SECTION_TYPES = Object.keys(sectionPropsSchemas) as SectionType[];
export type SectionProps<T extends SectionType> = z.infer<(typeof sectionPropsSchemas)[T]>;

const sectionIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{4,40}$/, 'Invalid section id');

export const sectionSchema = z.discriminatedUnion(
  'type',
  SECTION_TYPES.map((type) =>
    z.object({ id: sectionIdSchema, type: z.literal(type), enabled: z.boolean().default(true), props: sectionPropsSchemas[type] }),
  ) as unknown as [z.ZodDiscriminatedUnionOption<'type'>, ...z.ZodDiscriminatedUnionOption<'type'>[]],
);

export type Section = { [K in SectionType]: { id: string; type: K; enabled: boolean; props: SectionProps<K> } }[SectionType];

/** Drafts may be saved while incomplete; publishing requires every section to pass `sectionSchema`. */
export const draftSectionSchema = z.object({
  id: sectionIdSchema,
  type: z.enum(SECTION_TYPES as [SectionType, ...SectionType[]]),
  enabled: z.boolean().default(true),
  props: z.record(z.unknown()).default({}),
});
export type DraftSection = z.infer<typeof draftSectionSchema>;

export interface SectionIssue {
  index: number;
  id?: string;
  type?: string;
  issues: { path: string; message: string }[];
}

export function validateSections(sections: unknown[]): { ok: true; sections: Section[] } | { ok: false; errors: SectionIssue[] } {
  const errors: SectionIssue[] = [];
  const out: Section[] = [];
  const ids = new Set<string>();
  sections.forEach((raw, index) => {
    const parsed = sectionSchema.safeParse(raw);
    const r = raw as { id?: string; type?: string };
    if (!parsed.success) {
      errors.push({ index, id: r?.id, type: r?.type, issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
      return;
    }
    const s = parsed.data as unknown as Section;
    if (ids.has(s.id)) errors.push({ index, id: s.id, type: s.type, issues: [{ path: 'id', message: 'Duplicate section id' }] });
    ids.add(s.id);
    out.push(s);
  });
  return errors.length ? { ok: false, errors } : { ok: true, sections: out };
}

/** Parses a single published section leniently for rendering (applies defaults; returns null if unusable). */
export function parseSectionForRender(raw: unknown): Section | null {
  const parsed = sectionSchema.safeParse(raw);
  return parsed.success ? (parsed.data as unknown as Section) : null;
}

/* ----------------------------- Builder metadata ---------------------------- */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'markdown'
  | 'number'
  | 'boolean'
  | 'select'
  | 'image'
  | 'video'
  | 'color'
  | 'cta'
  | 'ctas'
  | 'stringList'
  | 'images'
  | 'heroSlides'
  | 'statItems'
  | 'featureItems'
  | 'processSteps'
  | 'background';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

export interface SectionMeta {
  label: string;
  description: string;
  group: 'Hero & story' | 'Showcase' | 'Social proof' | 'Conversion' | 'Content';
  /** Where the content comes from, shown in the builder. */
  dataSource?: string;
  variants?: { value: string; label: string }[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

const opt = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const head: FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow (small label above heading)', type: 'text' },
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'subheading', label: 'Subheading', type: 'textarea' },
];
const tail: FieldDef[] = [
  { key: 'background', label: 'Background', type: 'background' },
  { key: 'anchorId', label: 'Anchor id (for #links)', type: 'text', help: 'Lowercase letters, numbers and hyphens' },
];
const limitField = (max: number, label = 'Items to show'): FieldDef => ({ key: 'limit', label, type: 'number', min: 1, max });
const variantField = (options: { value: string; label: string }[]): FieldDef => ({ key: 'variant', label: 'Layout', type: 'select', options });

const V = {
  hero: opt(['fullscreen', 'Full-screen slideshow'], ['split', 'Split image & text'], ['centered', 'Centered statement']),
  intro: opt(['split', 'Split with images'], ['editorial', 'Editorial centred']),
  categories: opt(['mosaic', 'Mosaic'], ['grid', 'Grid'], ['carousel', 'Carousel']),
  projects: opt(['editorial', 'Editorial alternating'], ['grid', 'Grid'], ['carousel', 'Carousel']),
  services: opt(['cards', 'Image cards'], ['list', 'Numbered list'], ['compact', 'Compact grid']),
  features: opt(['grid', 'Icon grid'], ['split', 'Split with image']),
  process: opt(['timeline', 'Timeline'], ['numbered', 'Numbered columns']),
  gallery: opt(['masonry', 'Masonry'], ['grid', 'Uniform grid'], ['carousel', 'Carousel']),
  testimonials: opt(['carousel', 'Carousel'], ['grid', 'Grid'], ['spotlight', 'Spotlight']),
  packages: opt(['cards', 'Cards'], ['list', 'List']),
  venues: opt(['cards', 'Cards'], ['carousel', 'Carousel']),
  logos: opt(['marquee', 'Scrolling marquee'], ['grid', 'Grid']),
  faq: opt(['accordion', 'Accordion'], ['two-column', 'Two columns']),
  cta: opt(['image', 'Full-bleed image'], ['minimal', 'Minimal'], ['split', 'Split']),
  inquiryForm: opt(['card', 'Card'], ['inline', 'Inline']),
};

export const SECTION_META: Record<SectionType, SectionMeta> = {
  hero: {
    label: 'Cinematic hero',
    description: 'Full-screen hero with crossfading photography, optional video, headline and buttons.',
    group: 'Hero & story',
    variants: V.hero,
    fields: [
      { key: 'eyebrow', label: 'Eyebrow', type: 'text' },
      { key: 'headline', label: 'Headline', type: 'text' },
      { key: 'subheadline', label: 'Subheadline', type: 'textarea' },
      { key: 'slides', label: 'Hero images', type: 'heroSlides' },
      { key: 'ctas', label: 'Buttons', type: 'ctas' },
      variantField(V.hero),
      { key: 'align', label: 'Text alignment', type: 'select', options: opt(['left', 'Left'], ['center', 'Centre']) },
      { key: 'overlay', label: 'Image darkening (0–1)', type: 'number', min: 0, max: 1 },
      { key: 'intervalSeconds', label: 'Seconds per slide', type: 'number', min: 3, max: 20 },
      { key: 'showScrollHint', label: 'Show scroll hint', type: 'boolean' },
      { key: 'anchorId', label: 'Anchor id', type: 'text' },
    ],
    defaults: {
      eyebrow: 'Luxury event design & production',
      headline: 'Celebrations, composed like cinema',
      subheadline: 'We design and produce weddings, galas and brand experiences with obsessive attention to detail.',
      slides: [],
      ctas: [
        { label: 'Book your event', href: '/inquire', variant: 'primary' },
        { label: 'Explore our work', href: '/portfolio', variant: 'secondary' },
      ],
    },
  },
  intro: {
    label: 'Introduction / story',
    description: 'Editorial introduction with images, body copy and signature.',
    group: 'Hero & story',
    variants: V.intro,
    fields: [
      ...head,
      { key: 'body', label: 'Body', type: 'markdown' },
      { key: 'imageUrl', label: 'Main image', type: 'image' },
      { key: 'imageAlt', label: 'Main image alt text', type: 'text' },
      { key: 'secondaryImageUrl', label: 'Secondary image', type: 'image' },
      { key: 'signature', label: 'Signature line', type: 'text' },
      { key: 'cta', label: 'Button', type: 'cta' },
      variantField(V.intro),
      ...tail,
    ],
    defaults: { heading: 'An atelier for unforgettable occasions', body: '' },
  },
  categories: {
    label: 'Event categories',
    description: 'Published event categories with cover photography.',
    group: 'Showcase',
    dataSource: 'Event categories',
    variants: V.categories,
    fields: [...head, limitField(24), variantField(V.categories), ...tail],
    defaults: { eyebrow: 'What we create', heading: 'Occasions we design', limit: 8 },
  },
  featuredProjects: {
    label: 'Featured projects',
    description: 'Portfolio projects marked as featured (only those authorised for publication).',
    group: 'Showcase',
    dataSource: 'Portfolio',
    variants: V.projects,
    fields: [
      ...head,
      limitField(12),
      { key: 'featuredOnly', label: 'Featured projects only', type: 'boolean' },
      { key: 'categorySlug', label: 'Limit to category (slug, optional)', type: 'text' },
      { key: 'cta', label: 'Button', type: 'cta' },
      variantField(V.projects),
      ...tail,
    ],
    defaults: { eyebrow: 'Selected work', heading: 'Recent celebrations', limit: 4, cta: { label: 'View the portfolio', href: '/portfolio', variant: 'secondary' } },
  },
  services: {
    label: 'Services',
    description: 'Published services.',
    group: 'Showcase',
    dataSource: 'Services',
    variants: V.services,
    fields: [...head, limitField(30), variantField(V.services), ...tail],
    defaults: { eyebrow: 'Services', heading: 'Everything, orchestrated', limit: 9 },
  },
  features: {
    label: 'Why choose us',
    description: 'Icon + text highlights, optionally beside an image.',
    group: 'Hero & story',
    variants: V.features,
    fields: [...head, { key: 'items', label: 'Highlights', type: 'featureItems' }, { key: 'imageUrl', label: 'Image (split layout)', type: 'image' }, { key: 'imageAlt', label: 'Image alt text', type: 'text' }, variantField(V.features), ...tail],
    defaults: { eyebrow: 'Why us', heading: 'The difference is in the details', items: [{ icon: 'sparkles', title: 'Bespoke design', body: '' }] },
  },
  process: {
    label: 'Planning process',
    description: 'Step-by-step process timeline.',
    group: 'Hero & story',
    variants: V.process,
    fields: [...head, { key: 'steps', label: 'Steps', type: 'processSteps' }, variantField(V.process), ...tail],
    defaults: { eyebrow: 'How we work', heading: 'Our planning process', steps: [{ title: 'Discovery', body: '' }] },
  },
  gallery: {
    label: 'Gallery',
    description: 'Image gallery with lightbox — hand-picked images or the latest portfolio photography.',
    group: 'Showcase',
    variants: V.gallery,
    fields: [
      ...head,
      { key: 'source', label: 'Images from', type: 'select', options: opt(['manual', 'Chosen images'], ['portfolio', 'Latest portfolio photography']) },
      { key: 'images', label: 'Images', type: 'images' },
      limitField(40, 'Images to show (portfolio source)'),
      variantField(V.gallery),
      ...tail,
    ],
    defaults: { eyebrow: 'Gallery', heading: 'Moments we have made', source: 'portfolio', limit: 12 },
  },
  testimonials: {
    label: 'Testimonials',
    description: 'Client-approved testimonials.',
    group: 'Social proof',
    dataSource: 'Testimonials',
    variants: V.testimonials,
    fields: [...head, limitField(24), variantField(V.testimonials), ...tail],
    defaults: { eyebrow: 'Kind words', heading: 'In our clients’ words', limit: 6 },
  },
  packages: {
    label: 'Event packages',
    description: 'Visible packages with transparent “Starting from” or “Request a quote” pricing.',
    group: 'Conversion',
    dataSource: 'Packages',
    variants: V.packages,
    fields: [...head, limitField(12), { key: 'featuredOnly', label: 'Featured packages only', type: 'boolean' }, variantField(V.packages), ...tail],
    defaults: { eyebrow: 'Packages', heading: 'Curated starting points', limit: 3 },
  },
  venues: {
    label: 'Venues & destinations',
    description: 'Public venue and destination highlights.',
    group: 'Showcase',
    dataSource: 'Venues',
    variants: V.venues,
    fields: [...head, limitField(12), variantField(V.venues), ...tail],
    defaults: { eyebrow: 'Destinations', heading: 'Venues we love', limit: 4 },
  },
  stats: {
    label: 'Statistics',
    description: 'Animated counters. Use live metrics or verified manual figures only.',
    group: 'Social proof',
    fields: [...head, { key: 'items', label: 'Statistics', type: 'statItems' }, { key: 'footnote', label: 'Footnote (e.g. “As of 2026”)', type: 'text' }, ...tail],
    defaults: { items: [{ label: 'Events delivered', value: 0, suffix: '+', metric: 'completedEvents' }] },
  },
  logos: {
    label: 'Client & partner logos',
    description: 'Logos of clients and partners you are authorised to display.',
    group: 'Social proof',
    dataSource: 'Client logos',
    variants: V.logos,
    fields: [...head, limitField(40), { key: 'grayscale', label: 'Monochrome logos', type: 'boolean' }, variantField(V.logos), ...tail],
    defaults: { eyebrow: 'Trusted by', heading: '', limit: 12 },
  },
  faq: {
    label: 'FAQs',
    description: 'Accordion of published FAQs, optionally filtered by group.',
    group: 'Content',
    dataSource: 'FAQs',
    variants: V.faq,
    fields: [...head, limitField(50), { key: 'group', label: 'Group filter (optional)', type: 'text' }, variantField(V.faq), ...tail],
    defaults: { eyebrow: 'FAQ', heading: 'Questions, answered', limit: 8 },
  },
  cta: {
    label: 'Call to action',
    description: 'Inquiry call-to-action band.',
    group: 'Conversion',
    variants: V.cta,
    fields: [...head, { key: 'body', label: 'Body', type: 'textarea' }, { key: 'ctas', label: 'Buttons', type: 'ctas' }, { key: 'imageUrl', label: 'Background image', type: 'image' }, variantField(V.cta), ...tail],
    defaults: { heading: 'Let’s begin your celebration', ctas: [{ label: 'Book your event', href: '/inquire', variant: 'primary' }] },
  },
  inquiryForm: {
    label: 'Inquiry form',
    description: 'The full multi-step event inquiry form embedded in the page.',
    group: 'Conversion',
    variants: V.inquiryForm,
    fields: [...head, { key: 'body', label: 'Intro text', type: 'textarea' }, variantField(V.inquiryForm), ...tail],
    defaults: { eyebrow: 'Inquire', heading: 'Tell us about your event', anchorId: 'inquire' },
  },
  contact: {
    label: 'Contact',
    description: 'Contact details, short contact form and map (details from Global settings).',
    group: 'Conversion',
    dataSource: 'Global settings',
    fields: [...head, { key: 'body', label: 'Body', type: 'textarea' }, { key: 'showForm', label: 'Show contact form', type: 'boolean' }, { key: 'showMap', label: 'Show map', type: 'boolean' }, ...tail],
    defaults: { eyebrow: 'Contact', heading: 'Visit the studio', anchorId: 'contact' },
  },
  newsletter: {
    label: 'Newsletter',
    description: 'Email signup with consent.',
    group: 'Conversion',
    fields: [...head, { key: 'body', label: 'Body', type: 'textarea' }, ...tail],
    defaults: { heading: 'Inspiration, occasionally' },
  },
  richText: {
    label: 'Rich text',
    description: 'Free-form formatted text (Markdown: headings, lists, links, bold, italics).',
    group: 'Content',
    fields: [
      ...head,
      { key: 'body', label: 'Body', type: 'markdown' },
      { key: 'align', label: 'Alignment', type: 'select', options: opt(['left', 'Left'], ['center', 'Centre']) },
      { key: 'width', label: 'Width', type: 'select', options: opt(['narrow', 'Narrow (reading)'], ['wide', 'Wide']) },
      ...tail,
    ],
    defaults: { heading: 'Heading', body: '' },
  },
  imageText: {
    label: 'Image + text',
    description: 'Two-column image and copy.',
    group: 'Content',
    fields: [
      ...head,
      { key: 'body', label: 'Body', type: 'markdown' },
      { key: 'imageUrl', label: 'Image', type: 'image' },
      { key: 'imageAlt', label: 'Image alt text', type: 'text' },
      { key: 'imageSide', label: 'Image side', type: 'select', options: opt(['left', 'Left'], ['right', 'Right']) },
      { key: 'ctas', label: 'Buttons', type: 'ctas' },
      ...tail,
    ],
    defaults: { heading: 'Heading', body: '' },
  },
  video: {
    label: 'Video feature',
    description: 'Licensed showreel (uploaded file, YouTube or Vimeo) with poster image.',
    group: 'Showcase',
    fields: [...head, { key: 'videoUrl', label: 'Video', type: 'video' }, { key: 'posterUrl', label: 'Poster image', type: 'image' }, { key: 'posterAlt', label: 'Poster alt text', type: 'text' }, ...tail],
    defaults: { heading: 'Watch the showreel' },
  },
  stage3d: {
    label: '3D stage preview',
    description: 'Interactive 3D stage/venue concept (lightweight; static poster on mobile or without WebGL).',
    group: 'Showcase',
    fields: [
      ...head,
      { key: 'body', label: 'Body', type: 'textarea' },
      { key: 'preset', label: 'Scene', type: 'select', options: opt(['wedding-mandap', 'Wedding mandap'], ['concert-stage', 'Concert stage'], ['gala-dinner', 'Gala dinner']) },
      { key: 'accentColor', label: 'Accent colour (optional)', type: 'color' },
      { key: 'posterUrl', label: 'Fallback image', type: 'image' },
      { key: 'ctas', label: 'Buttons', type: 'ctas' },
      ...tail,
    ],
    defaults: { eyebrow: 'Design studio', heading: 'Explore a stage concept in 3D', preset: 'wedding-mandap' },
  },
  team: {
    label: 'Team',
    description: 'Published team members.',
    group: 'Content',
    dataSource: 'Team',
    fields: [...head, limitField(40), ...tail],
    defaults: { eyebrow: 'The studio', heading: 'Creative directors & planners', limit: 8 },
  },
  blog: {
    label: 'Journal',
    description: 'Latest published blog posts.',
    group: 'Content',
    dataSource: 'Blog',
    fields: [...head, limitField(12), ...tail],
    defaults: { eyebrow: 'Journal', heading: 'Notes from the studio', limit: 3 },
  },
  quote: {
    label: 'Pull quote',
    description: 'A large editorial quote.',
    group: 'Social proof',
    fields: [...head, { key: 'quote', label: 'Quote', type: 'textarea' }, { key: 'attribution', label: 'Attribution', type: 'text' }, { key: 'imageUrl', label: 'Background image', type: 'image' }, ...tail],
    defaults: { quote: 'Every celebration deserves to feel like the only one.' },
  },
};

export function newSectionId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `s_${Date.now().toString(36)}${rand}`.slice(0, 32);
}

/** Builds a section with defaults applied (falls back to raw defaults for incomplete drafts). */
export function createSection(type: SectionType, overrides: Record<string, unknown> = {}): DraftSection {
  const props = { ...SECTION_META[type].defaults, ...overrides };
  const parsed = sectionPropsSchemas[type].safeParse(props);
  return { id: newSectionId(), type, enabled: true, props: parsed.success ? (parsed.data as Record<string, unknown>) : props };
}

