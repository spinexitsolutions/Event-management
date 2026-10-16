import { BookOpen, Building, Grid3x3, HelpCircle, MessageSquareQuote, Package, Star, Users, Wrench, type LucideIcon } from 'lucide-react';

/** Field configuration for the content editor (mirrors server/src/modules/content.schemas.ts). */
export type FieldSpec =
  | { kind: 'text'; key: string; label: string; max: number; required?: boolean; help?: string; placeholder?: string }
  | { kind: 'textarea'; key: string; label: string; max: number; rows?: number; required?: boolean; help?: string; placeholder?: string }
  | { kind: 'markdown'; key: string; label: string; max: number; help?: string; rows?: number }
  | { kind: 'slug'; key: 'slug'; label: string; from: string }
  | { kind: 'image'; key: string; label: string; altKey?: string; help?: string; aspect?: string; required?: boolean }
  | { kind: 'gallery'; key: string; label: string; max: number; help?: string }
  | { kind: 'strings'; key: string; label: string; max: number; itemMax: number; help?: string; placeholder?: string; lower?: boolean }
  | { kind: 'faqs'; key: string; label: string; max: number }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[]; help?: string }
  | { kind: 'number'; key: string; label: string; min: number; max: number; nullable?: boolean; help?: string }
  | { kind: 'money'; key: string; label: string; help?: string; internal?: boolean }
  | { kind: 'boolean'; key: string; label: string; help?: string }
  | { kind: 'date'; key: string; label: string; help?: string }
  | { kind: 'datetime'; key: string; label: string; help?: string }
  | { kind: 'seo'; key: 'seo' }
  | { kind: 'relationMulti'; key: string; label: string; collection: 'services' | 'categories'; help?: string }
  | { kind: 'relationSingle'; key: string; label: string; collection: 'categories' | 'projects'; help?: string }
  | { kind: 'video'; key: string; label: string; help?: string }
  | { kind: 'icon'; key: string; label: string }
  | { kind: 'link'; key: string; label: string; help?: string }
  | { kind: 'rating'; key: string; label: string }
  | { kind: 'pricing' }
  | { kind: 'addOns'; key: 'addOns' }
  | { kind: 'socials'; key: 'socials' }
  | { kind: 'beforeAfter'; key: 'beforeAfter' }
  | { kind: 'guard'; key: string; noteKey?: string; title: string; why: string };

export interface FieldGroupSpec {
  title: string;
  description?: string;
  side?: boolean;
  fields: FieldSpec[];
}

export interface CollectionConfig {
  key: string;
  label: string;
  singular: string;
  description: string;
  icon: LucideIcon;
  titleField: string;
  imageField?: string;
  subtitle?: (row: Record<string, unknown>) => string;
  publicPath?: (row: Record<string, unknown>) => string | null;
  reorder: boolean;
  categoryFilter?: boolean;
  groupFilter?: boolean;
  featuredField?: string;
  defaults: () => Record<string, unknown>;
  groups: FieldGroupSpec[];
}

const seoGroup: FieldGroupSpec = { title: 'Search & sharing', side: true, fields: [{ kind: 'seo', key: 'seo' }] };
const SEO_DEFAULT = { title: '', description: '', image: '', noIndex: false };

export const COLLECTIONS: CollectionConfig[] = [
  {
    key: 'categories',
    label: 'Event categories',
    singular: 'Event category',
    description: 'Weddings, corporate events, birthdays… each with its own landing page.',
    icon: Grid3x3,
    titleField: 'name',
    imageField: 'coverImage',
    subtitle: (r) => String(r.tagline ?? ''),
    publicPath: (r) => `/events/${r.slug}`,
    reorder: true,
    defaults: () => ({ slug: '', name: '', tagline: '', summary: '', body: '', coverImage: '', coverAlt: '', gallery: [], highlights: [], faqs: [], seo: SEO_DEFAULT, sortOrder: 0, status: 'DRAFT', serviceIds: [] }),
    groups: [
      {
        title: 'Basics',
        fields: [
          { kind: 'text', key: 'name', label: 'Name', max: 100, required: true, placeholder: 'Luxury Weddings' },
          { kind: 'slug', key: 'slug', label: 'URL', from: 'name' },
          { kind: 'text', key: 'tagline', label: 'Tagline', max: 160, help: 'One evocative line shown under the name.' },
          { kind: 'textarea', key: 'summary', label: 'Summary', max: 600, help: 'Used on cards and as the intro of the category page.' },
          { kind: 'markdown', key: 'body', label: 'Page content', max: 20000 },
        ],
      },
      { title: 'Imagery', fields: [{ kind: 'image', key: 'coverImage', label: 'Cover image', altKey: 'coverAlt' }, { kind: 'gallery', key: 'gallery', label: 'Gallery', max: 40 }] },
      { title: 'Highlights & FAQs', fields: [{ kind: 'strings', key: 'highlights', label: 'Highlights', max: 12, itemMax: 160, placeholder: 'e.g. Bespoke mandap design' }, { kind: 'faqs', key: 'faqs', label: 'Frequently asked questions', max: 20 }] },
      { title: 'Related services', side: true, fields: [{ kind: 'relationMulti', key: 'serviceIds', label: 'Services offered', collection: 'services' }] },
      seoGroup,
    ],
  },
  {
    key: 'services',
    label: 'Services',
    singular: 'Service',
    description: 'Planning, décor, catering, entertainment and every other service you offer.',
    icon: Wrench,
    titleField: 'name',
    imageField: 'coverImage',
    subtitle: (r) => String(r.summary ?? '').slice(0, 80),
    publicPath: (r) => `/services/${r.slug}`,
    reorder: true,
    defaults: () => ({ slug: '', name: '', summary: '', body: '', icon: 'sparkles', coverImage: '', coverAlt: '', gallery: [], features: [], faqs: [], seo: SEO_DEFAULT, defaultPriceMinor: null, defaultUnit: '', sortOrder: 0, status: 'DRAFT', categoryIds: [] }),
    groups: [
      {
        title: 'Basics',
        fields: [
          { kind: 'text', key: 'name', label: 'Name', max: 100, required: true, placeholder: 'Decoration & Floral Design' },
          { kind: 'slug', key: 'slug', label: 'URL', from: 'name' },
          { kind: 'icon', key: 'icon', label: 'Icon' },
          { kind: 'textarea', key: 'summary', label: 'Summary', max: 600 },
          { kind: 'markdown', key: 'body', label: 'Page content', max: 20000 },
        ],
      },
      { title: 'Imagery', fields: [{ kind: 'image', key: 'coverImage', label: 'Cover image', altKey: 'coverAlt' }, { kind: 'gallery', key: 'gallery', label: 'Gallery', max: 40 }] },
      { title: 'What’s included & FAQs', fields: [{ kind: 'strings', key: 'features', label: 'Features', max: 20, itemMax: 160, placeholder: 'e.g. Floral concept and mood boards' }, { kind: 'faqs', key: 'faqs', label: 'Frequently asked questions', max: 20 }] },
      {
        title: 'Internal pricing',
        side: true,
        description: 'For quotations only — never shown on the website.',
        fields: [
          { kind: 'money', key: 'defaultPriceMinor', label: 'Internal reference price', internal: true, help: 'Pre-fills quotation lines. Leave empty if it varies.' },
          { kind: 'text', key: 'defaultUnit', label: 'Unit', max: 20, placeholder: 'per event, per guest…' },
        ],
      },
      { title: 'Event categories', side: true, fields: [{ kind: 'relationMulti', key: 'categoryIds', label: 'Shown under', collection: 'categories' }] },
      seoGroup,
    ],
  },
  {
    key: 'packages',
    label: 'Packages',
    singular: 'Package',
    description: 'Curated starting points with transparent “starting from” or on-request pricing.',
    icon: Package,
    titleField: 'name',
    imageField: 'coverImage',
    subtitle: (r) => [r.tier, (r.category as { name?: string } | null)?.name].filter(Boolean).join(' · '),
    publicPath: (r) => (r.visible ? `/packages/${r.slug}` : null),
    reorder: true,
    categoryFilter: true,
    featuredField: 'featured',
    defaults: () => ({ slug: '', name: '', tier: '', summary: '', body: '', coverImage: '', coverAlt: '', gallery: [], inclusions: [], addOns: [], exclusions: [], terms: '', availability: '', guestMin: null, guestMax: null, pricingModel: 'ON_REQUEST', priceMinor: null, currency: 'INR', discountBps: 0, discountLabel: '', validFrom: null, validUntil: null, featured: false, visible: true, status: 'DRAFT', sortOrder: 0, categoryId: null, serviceIds: [] }),
    groups: [
      {
        title: 'Basics',
        fields: [
          { kind: 'text', key: 'name', label: 'Name', max: 100, required: true, placeholder: 'Signature Wedding' },
          { kind: 'slug', key: 'slug', label: 'URL', from: 'name' },
          { kind: 'text', key: 'tier', label: 'Tier label', max: 40, placeholder: 'Signature, Premium, Bespoke…' },
          { kind: 'textarea', key: 'summary', label: 'Summary', max: 600 },
          { kind: 'markdown', key: 'body', label: 'Description', max: 20000 },
        ],
      },
      { title: 'Pricing', fields: [{ kind: 'pricing' }] },
      {
        title: 'What’s included',
        fields: [
          { kind: 'strings', key: 'inclusions', label: 'Inclusions', max: 40, itemMax: 200, placeholder: 'e.g. Dedicated planner from booking to event day' },
          { kind: 'addOns', key: 'addOns' },
          { kind: 'strings', key: 'exclusions', label: 'Not included', max: 30, itemMax: 200, placeholder: 'e.g. Venue rental' },
        ],
      },
      {
        title: 'Guests, dates & terms',
        fields: [
          { kind: 'number', key: 'guestMin', label: 'Minimum guests', min: 1, max: 100000, nullable: true },
          { kind: 'number', key: 'guestMax', label: 'Maximum guests', min: 1, max: 100000, nullable: true },
          { kind: 'date', key: 'validFrom', label: 'Offer valid from', help: 'Optional. Leave empty for no start date.' },
          { kind: 'date', key: 'validUntil', label: 'Offer valid until', help: 'Optional. The package is hidden automatically after this date.' },
          { kind: 'text', key: 'availability', label: 'Availability note', max: 300, placeholder: 'e.g. Available October – March' },
          { kind: 'markdown', key: 'terms', label: 'Terms', max: 5000, rows: 4 },
        ],
      },
      { title: 'Imagery', fields: [{ kind: 'image', key: 'coverImage', label: 'Cover image', altKey: 'coverAlt' }, { kind: 'gallery', key: 'gallery', label: 'Gallery', max: 30 }] },
      {
        title: 'Visibility',
        side: true,
        fields: [
          { kind: 'boolean', key: 'visible', label: 'Show on the website', help: 'Hidden packages can still be used in quotations.' },
          { kind: 'boolean', key: 'featured', label: 'Featured', help: 'Featured packages appear first and in “featured only” sections.' },
        ],
      },
      { title: 'Relations', side: true, fields: [{ kind: 'relationSingle', key: 'categoryId', label: 'Event category', collection: 'categories' }, { kind: 'relationMulti', key: 'serviceIds', label: 'Services included', collection: 'services' }] },
    ],
  },
  {
    key: 'projects',
    label: 'Portfolio',
    singular: 'Portfolio project',
    description: 'Real events you have produced — published only with the client’s consent.',
    icon: Star,
    titleField: 'title',
    imageField: 'coverImage',
    subtitle: (r) => [(r.category as { name?: string } | null)?.name, r.city, r.venueName].filter(Boolean).join(' · '),
    publicPath: (r) => `/portfolio/${r.slug}`,
    reorder: true,
    categoryFilter: true,
    featuredField: 'featured',
    defaults: () => ({ slug: '', title: '', summary: '', story: '', categoryId: null, city: '', venueName: '', eventDate: null, guestCount: null, theme: '', concept: '', coverImage: '', coverAlt: '', gallery: [], beforeAfter: [], videoUrl: '', publicationConsent: false, consentNote: '', featured: false, status: 'DRAFT', sortOrder: 0, seo: SEO_DEFAULT, serviceIds: [] }),
    groups: [
      {
        title: 'Story',
        fields: [
          { kind: 'text', key: 'title', label: 'Title', max: 160, required: true, placeholder: 'A monsoon wedding at Umaid Bhawan' },
          { kind: 'slug', key: 'slug', label: 'URL', from: 'title' },
          { kind: 'textarea', key: 'summary', label: 'Summary', max: 600 },
          { kind: 'text', key: 'theme', label: 'Theme', max: 160, placeholder: 'e.g. Royal Rajasthani, ivory and marigold' },
          { kind: 'markdown', key: 'concept', label: 'Design concept', max: 3000, rows: 5 },
          { kind: 'markdown', key: 'story', label: 'The story', max: 20000 },
        ],
      },
      {
        title: 'Event details',
        fields: [
          { kind: 'text', key: 'city', label: 'City', max: 80 },
          { kind: 'text', key: 'venueName', label: 'Venue', max: 160 },
          { kind: 'date', key: 'eventDate', label: 'Event date' },
          { kind: 'number', key: 'guestCount', label: 'Guest count', min: 1, max: 100000, nullable: true },
        ],
      },
      {
        title: 'Imagery & film',
        fields: [
          { kind: 'image', key: 'coverImage', label: 'Cover image', altKey: 'coverAlt' },
          { kind: 'gallery', key: 'gallery', label: 'Gallery', max: 80 },
          { kind: 'beforeAfter', key: 'beforeAfter' },
          { kind: 'video', key: 'videoUrl', label: 'Film (optional)', help: 'Upload an MP4 or paste a YouTube / Vimeo link.' },
        ],
      },
      {
        title: 'Publication consent',
        side: true,
        fields: [
          {
            kind: 'guard',
            key: 'publicationConsent',
            noteKey: 'consentNote',
            title: 'The client has agreed to this event being shown publicly',
            why: 'Weddings and private events are personal. A project can only be published once you have recorded the client’s consent (and any conditions, e.g. “no faces of guests”).',
          },
        ],
      },
      { title: 'Highlight', side: true, fields: [{ kind: 'boolean', key: 'featured', label: 'Featured on the homepage', help: 'Featured projects appear in “Featured projects” sections.' }] },
      { title: 'Relations', side: true, fields: [{ kind: 'relationSingle', key: 'categoryId', label: 'Event category', collection: 'categories' }, { kind: 'relationMulti', key: 'serviceIds', label: 'Services delivered', collection: 'services' }] },
      seoGroup,
    ],
  },
  {
    key: 'testimonials',
    label: 'Testimonials',
    singular: 'Testimonial',
    description: 'Client words — published only with the client’s approval.',
    icon: MessageSquareQuote,
    titleField: 'clientName',
    imageField: 'photoUrl',
    subtitle: (r) => `“${String(r.quote ?? '').slice(0, 70)}${String(r.quote ?? '').length > 70 ? '…' : ''}”`,
    reorder: true,
    featuredField: 'featured',
    defaults: () => ({ clientName: '', eventLabel: '', quote: '', rating: null, photoUrl: '', projectId: null, clientApproved: false, featured: false, status: 'DRAFT', sortOrder: 0 }),
    groups: [
      {
        title: 'Testimonial',
        fields: [
          { kind: 'text', key: 'clientName', label: 'Client name', max: 120, required: true, help: 'As the client agreed to be credited, e.g. “Priya & Arjun”.' },
          { kind: 'text', key: 'eventLabel', label: 'Event', max: 120, placeholder: 'Destination wedding, Udaipur' },
          { kind: 'textarea', key: 'quote', label: 'Quote', max: 1500, rows: 6, required: true, help: 'Use the client’s exact words.' },
          { kind: 'rating', key: 'rating', label: 'Rating (optional)' },
          { kind: 'image', key: 'photoUrl', label: 'Photo (optional)', aspect: 'aspect-square' },
        ],
      },
      {
        title: 'Client approval',
        side: true,
        fields: [{ kind: 'guard', key: 'clientApproved', title: 'The client approved this text for publication', why: 'Testimonials must be genuine and approved. Record approval before publishing — keep the email or message where the client agreed.' }],
      },
      { title: 'Display', side: true, fields: [{ kind: 'boolean', key: 'featured', label: 'Featured' }, { kind: 'relationSingle', key: 'projectId', label: 'Linked portfolio project', collection: 'projects' }] },
    ],
  },
  {
    key: 'team',
    label: 'Team',
    singular: 'Team member',
    description: 'Creative directors, planners and the people behind the studio.',
    icon: Users,
    titleField: 'name',
    imageField: 'photoUrl',
    subtitle: (r) => String(r.title ?? ''),
    reorder: true,
    defaults: () => ({ name: '', title: '', bio: '', photoUrl: '', socials: [], sortOrder: 0, status: 'DRAFT' }),
    groups: [
      {
        title: 'Profile',
        fields: [
          { kind: 'text', key: 'name', label: 'Name', max: 120, required: true },
          { kind: 'text', key: 'title', label: 'Role', max: 120, placeholder: 'Creative Director' },
          { kind: 'markdown', key: 'bio', label: 'Bio', max: 2000, rows: 5 },
          { kind: 'image', key: 'photoUrl', label: 'Portrait', aspect: 'aspect-[4/5]' },
        ],
      },
      { title: 'Social profiles', side: true, fields: [{ kind: 'socials', key: 'socials' }] },
    ],
  },
  {
    key: 'faqs',
    label: 'FAQs',
    singular: 'FAQ',
    description: 'Answers to common questions, grouped by topic.',
    icon: HelpCircle,
    titleField: 'question',
    subtitle: (r) => String(r.group ?? ''),
    reorder: true,
    groupFilter: true,
    defaults: () => ({ question: '', answer: '', group: 'General', sortOrder: 0, status: 'PUBLISHED' }),
    groups: [
      {
        title: 'Question',
        fields: [
          { kind: 'text', key: 'question', label: 'Question', max: 200, required: true },
          { kind: 'markdown', key: 'answer', label: 'Answer', max: 3000, rows: 6 },
          { kind: 'text', key: 'group', label: 'Group', max: 60, help: 'FAQ sections can show one group, e.g. “Payments” or “Weddings”.' },
        ],
      },
    ],
  },
  {
    key: 'logos',
    label: 'Client logos',
    singular: 'Client logo',
    description: 'Brands you have worked with — only those you may display.',
    icon: Building,
    titleField: 'name',
    imageField: 'logoUrl',
    subtitle: (r) => String(r.href ?? ''),
    reorder: true,
    defaults: () => ({ name: '', logoUrl: '', href: '', authorized: false, sortOrder: 0, status: 'DRAFT' }),
    groups: [
      {
        title: 'Logo',
        fields: [
          { kind: 'text', key: 'name', label: 'Company name', max: 120, required: true },
          { kind: 'image', key: 'logoUrl', label: 'Logo', required: true, aspect: 'aspect-[3/2]', help: 'SVG or transparent PNG works best.' },
          { kind: 'link', key: 'href', label: 'Website (optional)' },
        ],
      },
      {
        title: 'Permission',
        side: true,
        fields: [{ kind: 'guard', key: 'authorized', title: 'We have permission to display this logo', why: 'Logos are trademarks. Show a client’s logo only with their written permission (or under your contract).' }],
      },
    ],
  },
  {
    key: 'blog',
    label: 'Journal',
    singular: 'Journal post',
    description: 'Articles and news for the Journal.',
    icon: BookOpen,
    titleField: 'title',
    imageField: 'coverImage',
    subtitle: (r) => [r.kind === 'NEWS' ? 'News' : 'Article', r.authorName].filter(Boolean).join(' · '),
    publicPath: (r) => `/journal/${r.slug}`,
    reorder: false,
    defaults: () => ({ slug: '', title: '', excerpt: '', body: '', coverImage: '', coverAlt: '', authorName: '', tags: [], kind: 'ARTICLE', status: 'DRAFT', publishedAt: null, seo: SEO_DEFAULT }),
    groups: [
      {
        title: 'Post',
        fields: [
          { kind: 'text', key: 'title', label: 'Title', max: 160, required: true },
          { kind: 'slug', key: 'slug', label: 'URL', from: 'title' },
          { kind: 'textarea', key: 'excerpt', label: 'Excerpt', max: 400, help: 'Shown on cards and in search results.' },
          { kind: 'markdown', key: 'body', label: 'Body', max: 60000, rows: 16 },
          { kind: 'image', key: 'coverImage', label: 'Cover image', altKey: 'coverAlt' },
        ],
      },
      {
        title: 'Details',
        side: true,
        fields: [
          { kind: 'select', key: 'kind', label: 'Type', options: [{ value: 'ARTICLE', label: 'Article' }, { value: 'NEWS', label: 'News' }] },
          { kind: 'text', key: 'authorName', label: 'Author', max: 80 },
          { kind: 'datetime', key: 'publishedAt', label: 'Publish date', help: 'Set automatically when first published. A future date schedules the post.' },
          { kind: 'strings', key: 'tags', label: 'Tags', max: 10, itemMax: 30, lower: true, placeholder: 'e.g. weddings' },
        ],
      },
      seoGroup,
    ],
  },
];

export const COLLECTION_MAP: Record<string, CollectionConfig> = Object.fromEntries(COLLECTIONS.map((c) => [c.key, c]));
