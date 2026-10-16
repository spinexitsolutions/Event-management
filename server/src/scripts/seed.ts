/**
 * Seeds roles, site configuration, pages and a starter catalogue (idempotent — existing rows are kept).
 *   npm run seed            → structure + starter catalogue (safe for production; review before publishing)
 *   npm run seed -- --demo  → ALSO adds SAMPLE operational data (venues, portfolio, vendors, clients, bookings,
 *                             payments) for demonstrations. Every sample record is labelled “Sample”.
 * No user accounts are created — run `npm run create-admin`.
 */
import { validateSections, createSection, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS, ROLE_LABELS, calculateQuote, DEFAULT_MILESTONES, milestoneDueDate, type QuotePricingInput } from '@maison/shared';
import { prisma } from '../config/db';
import { CATEGORIES, FAQS, PACKAGES, SERVICES, coverOf, img } from '../content/catalog';
import { IMG, alt } from '../content/images';
import { getPublishedSite } from '../services/siteConfig.service';
import { DEFAULT_TASK_TEMPLATES } from '../modules/tasks.routes';

const demo = process.argv.includes('--demo');
const log = (...a: unknown[]) => console.log('•', ...a);
const sec = (type: Parameters<typeof createSection>[0], props: Record<string, unknown> = {}) => createSection(type, props);

async function seedRoles() {
  for (const key of ROLE_KEYS) {
    const existing = await prisma.role.findUnique({ where: { key } });
    if (!existing) await prisma.role.create({ data: { key, name: ROLE_LABELS[key], permissions: DEFAULT_ROLE_PERMISSIONS[key], isSystem: true } });
    else if (key === 'SUPER_ADMIN') await prisma.role.update({ where: { key }, data: { permissions: Object.keys(PERMISSIONS) } });
  }
  log('roles');
}

function homeSections() {
  return [
    sec('hero', {
      eyebrow: 'Luxury event design & production',
      headline: 'Celebrations, composed like cinema',
      subheadline: 'Weddings, galas and brand experiences — designed with intention and produced with obsessive precision.',
      slides: [
        { imageUrl: IMG.receptionLights, alt: alt.receptionLights, caption: 'Wedding receptions' },
        { imageUrl: IMG.ballroom, alt: alt.ballroom, caption: 'Grand galas' },
        { imageUrl: IMG.weddingAisle, alt: alt.weddingAisle, caption: 'Ceremonies' },
        { imageUrl: IMG.concert, alt: alt.concert, caption: 'Live production' },
      ],
      ctas: [
        { label: 'Book your event', href: '/inquire', variant: 'primary' },
        { label: 'Explore our work', href: '/portfolio', variant: 'secondary' },
      ],
    }),
    sec('intro', {
      eyebrow: 'The atelier',
      heading: 'An atelier for unforgettable occasions',
      body: 'We are planners, designers and producers who believe the best celebrations feel effortless to the people in them — because every detail behind the scenes has been considered.\n\nFrom the first conversation to the last guest’s goodbye, one dedicated team carries your vision: concept, budget, vendors, production and hospitality.',
      imageUrl: IMG.tableSetting,
      imageAlt: alt.tableSetting,
      secondaryImageUrl: IMG.weddingBouquet,
      signature: 'The studio team',
      cta: { label: 'About the studio', href: '/about', variant: 'secondary' },
    }),
    sec('categories', { eyebrow: 'What we create', heading: 'Occasions we design', limit: 8 }),
    sec('featuredProjects', { eyebrow: 'Selected work', heading: 'Recent celebrations', limit: 4, featuredOnly: false, cta: { label: 'View the portfolio', href: '/portfolio', variant: 'secondary' } }),
    sec('services', { eyebrow: 'Services', heading: 'Everything, orchestrated', subheading: 'Engage us for complete planning, or for the specialist services your event needs.', limit: 9 }),
    sec('features', {
      eyebrow: 'Why us',
      heading: 'The difference is in the details',
      variant: 'split',
      imageUrl: IMG.receptionTables,
      imageAlt: alt.receptionTables,
      items: [
        { icon: 'sparkles', title: 'Bespoke design', body: 'Every concept is created for you — never a template. 3D visualisation lets you see it before it is built.' },
        { icon: 'shield-check', title: 'One accountable team', body: 'A single planner owns your event end to end, backed by production, logistics and hospitality specialists.' },
        { icon: 'receipt', title: 'Transparent pricing', body: 'Line-by-line proposals, clear payment schedules and a secure portal to track every rupee.' },
        { icon: 'clock', title: 'Run to the minute', body: 'Detailed run-of-show documents and an on-site command team keep every moment on time.' },
      ],
    }),
    sec('process', {
      eyebrow: 'How we work',
      heading: 'Our planning process',
      steps: [
        { title: 'Discovery', body: 'A consultation to understand your vision, guests, priorities and budget.' },
        { title: 'Proposal', body: 'A transparent, itemised proposal you can review and approve online.' },
        { title: 'Design', body: 'Concept, moodboards and 3D visualisation refined with you.' },
        { title: 'Production', body: 'Vendors confirmed, logistics locked and every detail rehearsed.' },
        { title: 'Celebration', body: 'Our team runs the day so you can be fully present.' },
      ],
    }),
    sec('stats', {
      heading: '',
      items: [
        { label: 'Events delivered', value: 0, suffix: '', metric: 'completedEvents' },
        { label: 'Happy clients', value: 0, suffix: '', metric: 'clientsServed' },
        { label: 'Cities', value: 0, suffix: '', metric: 'citiesServed' },
        { label: 'Portfolio stories', value: 0, suffix: '', metric: 'publishedProjects' },
      ],
      footnote: 'Live figures from our booking records.',
      background: { variant: 'surface', imageUrl: '', overlay: 0.5 },
    }),
    sec('gallery', { eyebrow: 'Gallery', heading: 'Moments we have made', source: 'portfolio', limit: 10, variant: 'masonry' }),
    sec('stage3d', { eyebrow: 'Design studio', heading: 'Explore a stage concept in 3D', body: 'Rotate a sample mandap design the way our clients review concepts with us. Every design is modelled before a single flower is ordered.', preset: 'wedding-mandap', posterUrl: IMG.weddingAisle, ctas: [{ label: 'Start your design', href: '/inquire', variant: 'primary' }] }),
    sec('testimonials', { eyebrow: 'Kind words', heading: 'In our clients’ words', limit: 6 }),
    sec('packages', { eyebrow: 'Packages', heading: 'Curated starting points', subheading: 'Transparent starting prices — every event is then tailored in a personal proposal.', limit: 3, featuredOnly: true }),
    sec('venues', { eyebrow: 'Destinations', heading: 'Venues we love', limit: 4 }),
    sec('logos', { eyebrow: 'Trusted by', heading: '', limit: 12 }),
    sec('faq', { eyebrow: 'FAQ', heading: 'Questions, answered', limit: 6, variant: 'two-column' }),
    sec('cta', { eyebrow: 'Begin', heading: 'Let’s begin your celebration', body: 'Share a few details and a senior planner will be in touch within one business day.', imageUrl: IMG.sparklers, ctas: [{ label: 'Book your event', href: '/inquire', variant: 'primary' }, { label: 'WhatsApp us', href: '/contact', variant: 'secondary' }] }),
    sec('newsletter', { heading: 'The private list', body: 'Occasional inspiration, new destinations and seasonal openings.', background: { variant: 'surface', imageUrl: '', overlay: 0.5 } }),
  ];
}

async function seedPage(slug: string, kind: string, title: string, sections: ReturnType<typeof sec>[], description = '') {
  if (await prisma.page.findUnique({ where: { slug } })) return;
  const checked = validateSections(sections);
  if (!checked.ok) throw new Error(`Seed page ${slug} has invalid sections: ${JSON.stringify(checked.errors)}`);
  const content = { title, seo: { title: kind === 'HOME' ? '' : title, description, image: '', noIndex: false }, featuredImage: '', sections: checked.sections } as object;
  await prisma.page.create({ data: { slug, kind, title, status: 'PUBLISHED', draft: content, hasUnpublished: false, publishedVersion: 1, versions: { create: { version: 1, content, note: 'Initial content' } } } });
  log('page', slug);
}

const LEGAL_NOTE = '> **Template — replace before launch.** This text is a starting structure, not legal advice. Have it reviewed for your jurisdiction.\n\n';

async function seedPages() {
  await seedPage('home', 'HOME', 'Home', homeSections());
  await seedPage('about', 'ABOUT', 'About us', [
    sec('hero', { variant: 'centered', eyebrow: 'About us', headline: 'We design moments people carry for a lifetime', subheadline: 'A studio of planners, designers and producers.', slides: [{ imageUrl: IMG.ballroom, alt: alt.ballroom, caption: '' }], ctas: [], showScrollHint: false }),
    sec('intro', { eyebrow: 'Our story', heading: 'Begun with a single wedding, built on referrals', body: 'Tell your company story here — how the studio began, what you believe about celebrations, and the kind of clients you love working with. Edit this text in Admin → Website → Pages → About.', imageUrl: IMG.weddingCouple, imageAlt: alt.weddingCouple }),
    sec('features', { eyebrow: 'Mission & vision', heading: 'What guides us', variant: 'grid', items: [{ icon: 'target', title: 'Mission', body: 'To design celebrations that feel personal, run flawlessly and respect every budget.' }, { icon: 'eye', title: 'Vision', body: 'To be the most trusted name for meaningful, beautifully produced events.' }, { icon: 'gem', title: 'Craft', body: 'Design, hospitality and production treated as one discipline.' }] }),
    sec('process', { eyebrow: 'Our process', heading: 'From first call to final toast', variant: 'numbered', steps: [{ title: 'Listen', body: 'We start with your story and priorities.' }, { title: 'Design', body: 'Concepts, moodboards and 3D visualisation.' }, { title: 'Produce', body: 'Vendors, logistics and rehearsals.' }, { title: 'Host', body: 'We run the day; you enjoy it.' }] }),
    sec('team', { eyebrow: 'The studio', heading: 'Creative directors & planners', limit: 12 }),
    sec('stats', { items: [{ label: 'Events delivered', value: 0, suffix: '', metric: 'completedEvents' }, { label: 'Cities', value: 0, suffix: '', metric: 'citiesServed' }], footnote: 'Live figures from our booking records.' }),
    sec('logos', { eyebrow: 'Clients & partners', heading: '', limit: 24, variant: 'grid' }),
    sec('cta', { heading: 'Plan something extraordinary', ctas: [{ label: 'Book your event', href: '/inquire', variant: 'primary' }], imageUrl: IMG.receptionLights }),
  ]);
  await seedPage('contact', 'CONTACT', 'Contact', [
    sec('hero', { variant: 'centered', eyebrow: 'Contact', headline: 'Let’s talk about your event', subheadline: 'Visit the studio, call us or send a note — we reply within one business day.', slides: [{ imageUrl: IMG.tableSetting, alt: alt.tableSetting, caption: '' }], ctas: [{ label: 'Start a detailed inquiry', href: '/inquire', variant: 'primary' }], showScrollHint: false }),
    sec('contact', { eyebrow: 'Studio', heading: 'Visit the studio', body: 'Consultations are by appointment so a planner can give you their full attention.' }),
    sec('faq', { heading: 'Before you write', limit: 4 }),
  ]);
  await seedPage('privacy-policy', 'LEGAL', 'Privacy policy', [
    sec('richText', { heading: 'Privacy policy', width: 'narrow', body: LEGAL_NOTE + '## What we collect\nContact details and event information you share through our forms and client portal, and payment confirmations from our payment provider (we never receive or store card numbers).\n\n## How we use it\nTo respond to inquiries, prepare proposals, deliver your event and meet legal and accounting obligations.\n\n## Retention\nClosed inquiries without a booking are deleted automatically after the retention period set by the business. Booking and financial records are kept as required by law.\n\n## Your rights\nContact us to access, correct or delete your personal data.' }),
  ]);
  await seedPage('terms', 'LEGAL', 'Terms of service', [
    sec('richText', { heading: 'Terms of service', width: 'narrow', body: LEGAL_NOTE + '## Bookings\nA booking is confirmed only after a signed agreement and receipt of the advance payment.\n\n## Payments\nPayments follow the schedule in your accepted proposal.\n\n## Cancellations\nCancellation and refund terms are set out in your event agreement.' }),
  ]);
}

async function seedCatalogue() {
  const svcIds = new Map<string, string>();
  for (const [i, s] of SERVICES.entries()) {
    const row = await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: { slug: s.slug, name: s.name, icon: s.icon, summary: s.summary, features: s.features, ...coverOf(s.cover), body: `${s.summary}\n\n### What’s included\n${s.features.map((f) => `- ${f}`).join('\n')}`, sortOrder: i, status: 'PUBLISHED', defaultPriceMinor: s.price ? BigInt(s.price * 100) : null, defaultUnit: s.unit ?? '' },
    });
    svcIds.set(s.slug, row.id);
  }
  log('services', SERVICES.length);
  const catIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const row = await prisma.eventCategory.upsert({
      where: { slug: c.slug },
      update: {},
      create: {
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        summary: c.summary,
        body: `${c.summary}\n\nEvery ${c.name.toLowerCase()} we plan begins with a conversation about you — your guests, your story and the feeling you want the day to leave behind.`,
        ...coverOf(c.cover),
        gallery: c.gallery.map(img),
        highlights: c.highlights,
        faqs: FAQS.slice(0, 3).map(({ question, answer }) => ({ question, answer })),
        sortOrder: i,
        status: 'PUBLISHED',
        services: { connect: c.services.filter((s) => svcIds.has(s)).map((s) => ({ id: svcIds.get(s)! })) },
      },
    });
    catIds.set(c.slug, row.id);
  }
  log('categories', CATEGORIES.length);
  for (const [i, p] of PACKAGES.entries()) {
    await prisma.package.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        slug: p.slug,
        name: p.name,
        tier: p.tier,
        summary: p.summary,
        body: p.summary,
        ...coverOf(p.cover),
        inclusions: p.inclusions,
        exclusions: p.exclusions,
        addOns: p.addOns ?? [],
        terms: 'Indicative starting price — your final price is set out in a personalised proposal. Subject to date and venue availability.',
        guestMin: p.guestMin ?? null,
        guestMax: p.guestMax ?? null,
        pricingModel: p.pricingModel,
        priceMinor: p.price ? BigInt(p.price * 100) : null,
        featured: !!p.featured,
        status: 'PUBLISHED',
        sortOrder: i,
        categoryId: p.category ? catIds.get(p.category) ?? null : null,
        services: { connect: p.services.filter((s) => svcIds.has(s)).map((s) => ({ id: svcIds.get(s)! })) },
      },
    });
  }
  log('packages', PACKAGES.length, '(review prices before launch)');
  if (!(await prisma.faq.count())) await prisma.faq.createMany({ data: FAQS.map((f, i) => ({ ...f, sortOrder: i, status: 'PUBLISHED' as const })) });
  for (const t of DEFAULT_TASK_TEMPLATES) {
    if (!(await prisma.taskTemplate.findFirst({ where: { name: t.name } }))) await prisma.taskTemplate.create({ data: { name: t.name, eventType: t.eventType, items: t.items as object } });
  }
  log('faqs, task templates');
  return { svcIds, catIds };
}

/* ─────────────── Demo data (clearly labelled samples) ─────────────── */

async function seedDemo(ids: { svcIds: Map<string, string>; catIds: Map<string, string> }) {
  if (await prisma.portfolioProject.findFirst({ where: { slug: 'sample-palace-wedding-udaipur' } })) return log('demo data already present');
  const venues = [
    { slug: 'sample-lakeside-palace', name: 'Lakeside Palace (Sample)', city: 'Udaipur', region: 'Rajasthan', cap: [80, 600], cover: 'weddingOutdoor' as const, facilities: ['Lakeside lawns', 'Heritage courtyards', 'On-site rooms'] },
    { slug: 'sample-grand-ballroom', name: 'The Grand Ballroom (Sample)', city: 'Mumbai', region: 'Maharashtra', cap: [100, 900], cover: 'ballroom' as const, facilities: ['Pillarless ballroom', 'Pre-function foyer', 'Valet'] },
    { slug: 'sample-beach-resort', name: 'Seaside Resort (Sample)', city: 'Goa', region: 'Goa', cap: [40, 300], cover: 'receptionLights' as const, facilities: ['Beach deck', 'Sunset lawns', 'Spa'] },
    { slug: 'sample-convention-centre', name: 'City Convention Centre (Sample)', city: 'Bengaluru', region: 'Karnataka', cap: [100, 3000], cover: 'conferenceHall' as const, facilities: ['Plenary hall', 'Breakout rooms', 'Exhibition floor'] },
  ];
  const venueIds: string[] = [];
  for (const [i, v] of venues.entries()) {
    const row = await prisma.venue.create({ data: { slug: v.slug, name: v.name, city: v.city, region: v.region, description: `Sample venue for demonstration. Replace with your partner venues.`, capacityMin: v.cap[0], capacityMax: v.cap[1], facilities: v.facilities, ...{ coverImage: IMG[v.cover] }, images: [img(v.cover)], isPublic: true, sortOrder: i } });
    venueIds.push(row.id);
  }
  const projects = [
    { slug: 'sample-palace-wedding-udaipur', title: 'A Lakeside Palace Wedding (Sample)', cat: 'luxury-weddings', city: 'Udaipur', venue: 'Lakeside Palace', theme: 'Ivory, blush & antique gold', cover: 'weddingAisle' as const, gallery: ['weddingCouple', 'receptionLights', 'tableSetting', 'weddingBouquet', 'sparklers'] as const, guests: 350, featured: true, date: '2026-02-14' },
    { slug: 'sample-leadership-summit', title: 'Annual Leadership Summit (Sample)', cat: 'corporate-events', city: 'Bengaluru', venue: 'City Convention Centre', theme: 'Future-forward minimalism', cover: 'conference' as const, gallery: ['speaker', 'conferenceHall', 'businessEvent'] as const, guests: 1200, featured: true, date: '2026-03-21' },
    { slug: 'sample-golden-anniversary', title: 'A Golden Anniversary Soirée (Sample)', cat: 'anniversary-celebrations', city: 'Mumbai', venue: 'The Grand Ballroom', theme: 'Old-world glamour', cover: 'ballroom' as const, gallery: ['toast', 'fineDining', 'receptionTables'] as const, guests: 180, featured: true, date: '2025-12-06' },
    { slug: 'sample-music-festival', title: 'Sunset Music Festival (Sample)', cat: 'concerts-and-festivals', city: 'Goa', venue: 'Seaside grounds', theme: 'Neon tropics', cover: 'festival' as const, gallery: ['concert', 'concertLights', 'concertCrowd', 'stageCrowd'] as const, guests: 6000, featured: true, date: '2025-12-28' },
    { slug: 'sample-first-birthday', title: 'An Enchanted First Birthday (Sample)', cat: 'birthday-parties', city: 'Pune', venue: 'Private villa', theme: 'Storybook garden', cover: 'balloons' as const, gallery: ['confetti', 'celebrating'] as const, guests: 90, featured: false, date: '2026-01-18' },
    { slug: 'sample-product-launch', title: 'Flagship Product Launch (Sample)', cat: 'product-launches', city: 'Delhi', venue: 'Rooftop arena', theme: 'Light & motion', cover: 'eventLights' as const, gallery: ['eventLights', 'speaker', 'partyCrowd'] as const, guests: 400, featured: false, date: '2026-04-09' },
  ];
  for (const [i, p] of projects.entries()) {
    await prisma.portfolioProject.create({
      data: {
        slug: p.slug,
        title: p.title,
        summary: `Sample portfolio entry for demonstration — replace with your own authorised project. ${p.guests} guests in ${p.city}.`,
        story: `This is **sample content** included with the demo data so you can see how a project page looks.\n\nDescribe the brief, the design concept and the moments that made the event special. Only publish events your clients have authorised you to display.`,
        categoryId: ids.catIds.get(p.cat) ?? null,
        city: p.city,
        venueName: p.venue,
        eventDate: new Date(`${p.date}T00:00:00Z`),
        guestCount: p.guests,
        theme: p.theme,
        concept: 'Sample concept description.',
        ...coverOf(p.cover),
        gallery: p.gallery.map((k) => img(k)),
        publicationConsent: true,
        consentNote: 'SAMPLE DATA — uses licensed stock photography; not a real client event.',
        featured: p.featured,
        status: 'PUBLISHED',
        sortOrder: i,
      },
    });
  }
  // Team & testimonials are left as DRAFTS: never publish invented people or quotes.
  await prisma.teamMember.createMany({ data: [{ name: 'Sample Planner', title: 'Creative Director', bio: 'Replace with a real team member profile.', sortOrder: 0, status: 'DRAFT' }, { name: 'Sample Producer', title: 'Head of Production', bio: 'Replace with a real team member profile.', sortOrder: 1, status: 'DRAFT' }] });
  await prisma.testimonial.create({ data: { clientName: 'Sample Client', eventLabel: 'Wedding (sample)', quote: 'Draft testimonial for layout testing. Publish only real, client-approved testimonials.', rating: 5, status: 'DRAFT', clientApproved: false } });
  await prisma.blogPost.createMany({
    data: [
      { slug: 'how-to-plan-a-destination-wedding', title: 'How to plan a destination wedding without the stress', excerpt: 'Timelines, guest travel and the questions to ask every venue.', body: '## Start with the guest list\nYour guest count shapes everything — venue, travel and budget.\n\n## Visit before you commit\nA recce reveals what photographs never show: access, acoustics, weather backups.\n\n## Book rooms early\nRoom blocks in peak season disappear quickly. Secure them as soon as the date is confirmed.', coverImage: IMG.weddingOutdoor, coverAlt: alt.weddingOutdoor, authorName: 'The studio', tags: ['weddings', 'destination'], status: 'PUBLISHED', publishedAt: new Date('2026-08-12T09:00:00Z') },
      { slug: 'conference-run-of-show-checklist', title: 'The conference run-of-show checklist we use', excerpt: 'Cue sheets, speaker briefings and the rehearsal that saves the day.', body: '## Build the run-of-show early\nEvery segment, transition and cue in one living document.\n\n## Brief every speaker\nTimings, slides, mic type and walk-on cues.\n\n## Rehearse transitions\nMost on-stage problems happen between segments, not during them.', coverImage: IMG.speaker, coverAlt: alt.speaker, authorName: 'The studio', tags: ['corporate'], status: 'PUBLISHED', publishedAt: new Date('2026-09-02T09:00:00Z') },
      { slug: 'tablescape-trends', title: 'Tablescapes: five ideas for this season', excerpt: 'Layered textures, low florals and candlelight that flatters every guest.', body: '## Go low with florals\nConversation flows when guests can see each other.\n\n## Layer textures\nLinen, glass and brass create depth.\n\n## Candlelight\nWarm, low light is the most flattering light there is.', coverImage: IMG.tableSetting, coverAlt: alt.tableSetting, authorName: 'The studio', tags: ['design'], status: 'PUBLISHED', publishedAt: new Date('2026-09-20T09:00:00Z') },
    ],
  });
  // Vendors & inventory (internal).
  const vendorData = [
    ['Sample Florals Co.', 'Florists', ['Mumbai', 'Pune']],
    ['Sample Gourmet Catering', 'Caterers', ['Mumbai', 'Goa']],
    ['Sample Light & Sound', 'Sound and lighting', ['Pan-India']],
    ['Sample Studio Films', 'Videographers', ['Pan-India']],
    ['Sample Fleet Transport', 'Transportation', ['Mumbai', 'Udaipur']],
  ] as const;
  const vendorIds: string[] = [];
  for (const [name, category, areas] of vendorData) {
    const v = await prisma.vendor.create({ data: { name, category, contactName: 'Sample contact', email: 'vendor@example.com', phone: '+91 00000 00000', serviceAreas: [...areas], services: [category], priceNotes: 'Sample pricing notes', rating: 4, notes: 'SAMPLE vendor for demonstration.' } });
    vendorIds.push(v.id);
  }
  await prisma.resource.createMany({
    data: [
      { name: 'Moving-head lights', category: 'Lighting', sku: 'LGT-MH-01', ownership: 'OWNED', quantity: 24, unit: 'pcs' },
      { name: 'Line-array speakers', category: 'Sound', sku: 'SND-LA-01', ownership: 'OWNED', quantity: 12, unit: 'pcs' },
      { name: 'Chiavari chairs (gold)', category: 'Furniture', sku: 'FUR-CH-01', ownership: 'OWNED', quantity: 400, unit: 'pcs' },
      { name: 'Brass candelabras', category: 'Decor', sku: 'DEC-CB-01', ownership: 'OWNED', quantity: 60, unit: 'pcs' },
      { name: 'Truss system 12m', category: 'Staging', ownership: 'VENDOR', vendorId: vendorIds[2], quantity: 4, unit: 'sets' },
    ],
  });

  // Clients, inquiries, quotations, bookings and payments for the dashboard.
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  const addDays = (n: number) => new Date(today.getTime() + n * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const svc = (slug: string) => SERVICES.find((s) => s.slug === slug)!;
  const scenarios = [
    { name: 'Sample Client — Asha & Rohan', email: 'sample.asha@example.com', cat: 'luxury-weddings', title: 'Wedding celebration (sample)', days: 120, venue: 0, guests: 300, services: ['wedding-planning', 'stage-and-mandap-design', 'decoration-and-floral-design'], stage: 'CONFIRMED' as const },
    { name: 'Sample Client — Northwind Ltd', email: 'sample.northwind@example.com', cat: 'corporate-events', title: 'Annual offsite (sample)', days: 45, venue: 3, guests: 450, services: ['corporate-event-production', 'audio-visual-production'], stage: 'AWAITING_ADVANCE' as const },
    { name: 'Sample Client — Meera K.', email: 'sample.meera@example.com', cat: 'birthday-parties', title: 'Fiftieth birthday dinner (sample)', days: -20, venue: 1, guests: 120, services: ['decoration-and-floral-design', 'entertainment-and-artist-booking'], stage: 'COMPLETED' as const },
    { name: 'Sample Client — Kabir S.', email: 'sample.kabir@example.com', cat: 'anniversary-celebrations', title: 'Silver anniversary (sample)', days: -60, venue: 2, guests: 150, services: ['complete-event-planning', 'catering-coordination'], stage: 'COMPLETED' as const },
  ];
  let n = 0;
  for (const s of scenarios) {
    n++;
    const client = await prisma.client.create({ data: { name: s.name, email: s.email, phone: '+91 00000 0000' + n, source: 'website', notes: 'SAMPLE client for demonstration.' } });
    const inquiry = await prisma.inquiry.create({ data: { reference: `INQ-SAMPL${n}`, clientId: client.id, name: s.name, email: s.email, phone: client.phone, eventType: CATEGORIES.find((c) => c.slug === s.cat)!.name, categoryId: ids.catIds.get(s.cat), eventDate: addDays(s.days), location: venues[s.venue].city, guestCount: s.guests, budgetRange: '₹15–30 lakh', services: s.services.map((x) => svc(x).name), status: 'WON', source: 'website', createdAt: addDays(Math.min(s.days, 0) - 90) } });
    const lines = s.services.map((x, i) => ({ id: `l${i}`, serviceId: ids.svcIds.get(x) ?? null, name: svc(x).name, description: '', quantityX100: 100, unit: svc(x).unit ?? '', unitPriceMinor: (svc(x).price ?? 100000) * 100, discountBps: 0, optional: false, selected: true, taxable: true }));
    const pricing: QuotePricingInput = { lines, discountType: 'NONE', discountValue: 0, taxes: [{ name: 'GST', rateBps: 1800 }], fees: [], milestones: DEFAULT_MILESTONES };
    const t = calculateQuote(pricing);
    const quote = await prisma.quotation.create({
      data: {
        number: `QT-SAMPLE-${n}`, title: s.title, clientId: client.id, inquiryId: inquiry.id, eventDate: addDays(s.days), venue: venues[s.venue].name, guestCount: s.guests, status: 'CONVERTED', acceptedVersion: 1, sentAt: addDays(Math.min(s.days, 0) - 70), respondedAt: addDays(Math.min(s.days, 0) - 60),
        versions: { create: { version: 1, lines: lines as object, taxes: pricing.taxes as object, fees: [], milestones: DEFAULT_MILESTONES as object, subtotalMinor: BigInt(t.subtotalMinor), discountMinor: 0n, taxMinor: BigInt(t.taxMinor), feesMinor: 0n, totalMinor: BigInt(t.totalMinor), breakdown: t as object, lockedAt: addDays(Math.min(s.days, 0) - 70), terms: 'Sample terms.' } },
      },
    });
    const accepted = addDays(Math.min(s.days, 0) - 60);
    const booking = await prisma.booking.create({
      data: {
        reference: `EV-SAMPLE-${n}`, title: s.title, clientId: client.id, quotationId: quote.id, inquiryId: inquiry.id, categoryId: ids.catIds.get(s.cat), eventDate: addDays(s.days), venueId: venueIds[s.venue], venueName: venues[s.venue].name, city: venues[s.venue].city, guestCount: s.guests,
        status: s.stage, contractValueMinor: BigInt(t.totalMinor), contractSignedAt: s.stage === 'AWAITING_ADVANCE' ? accepted : accepted, confirmedAt: s.stage !== 'AWAITING_ADVANCE' ? accepted : null, completedAt: s.stage === 'COMPLETED' ? addDays(s.days + 1) : null, createdAt: accepted,
        services: { create: lines.map((l, i) => ({ name: l.name, amountMinor: BigInt(t.lines[i].netMinor), sortOrder: i, serviceId: l.serviceId })) },
        installments: { create: t.milestones.map((m, i) => ({ label: m.label, amountMinor: BigInt(m.amountMinor), dueDate: new Date(`${milestoneDueDate(m, iso(addDays(s.days)), accepted)}T00:00:00Z`), sortOrder: i })) },
      },
      include: { installments: { orderBy: { sortOrder: 'asc' } } },
    });
    const paidCount = s.stage === 'COMPLETED' ? booking.installments.length : s.stage === 'CONFIRMED' ? 1 : 0;
    for (const inst of booking.installments.slice(0, paidCount)) {
      await prisma.payment.create({ data: { bookingId: booking.id, installmentId: inst.id, provider: 'manual', amountMinor: inst.amountMinor, currency: 'INR', status: 'PAID', method: 'bank_transfer', reference: `SAMPLE-${booking.reference}-${inst.sortOrder}`, paidAt: inst.dueDate && inst.dueDate < today ? inst.dueDate : accepted } });
      await prisma.installment.update({ where: { id: inst.id }, data: { paidMinor: inst.amountMinor, status: 'PAID' } });
    }
    await prisma.expense.create({ data: { bookingId: booking.id, vendorId: vendorIds[n % vendorIds.length], category: 'Vendor payment', description: 'Sample vendor invoice', amountMinor: BigInt(Math.round(t.totalMinor * 0.35)), incurredOn: addDays(Math.min(s.days, 0) - 10), status: s.stage === 'COMPLETED' ? 'PAID' : 'UNPAID' } });
  }
  // A couple of fresh inquiries for the pipeline.
  const fresh = [
    ['Sample Lead — Priya N.', 'sample.priya@example.com', 'Destination Weddings', 'Goa', 220, 'NEW'],
    ['Sample Lead — Acme Corp', 'sample.acme@example.com', 'Conferences & Seminars', 'Mumbai', 800, 'CONSULTATION_SCHEDULED'],
    ['Sample Lead — Dev P.', 'sample.dev@example.com', 'Private Parties', 'Pune', 60, 'CONTACTED'],
  ] as const;
  for (const [i, f] of fresh.entries()) {
    const c = await prisma.client.create({ data: { name: f[0], email: f[1], source: 'website', notes: 'SAMPLE lead.' } });
    await prisma.inquiry.create({ data: { reference: `INQ-SAMPLN${i}`, clientId: c.id, name: f[0], email: f[1], phone: '+91 00000 00000', eventType: f[2], eventDate: addDays(90 + i * 30), location: f[3], guestCount: f[4], budgetRange: '₹15–30 lakh', services: [], status: f[5], notes: 'Sample inquiry for demonstration.', createdAt: addDays(-i - 1) } });
  }
  log('demo data (labelled “Sample”)');
}

async function main() {
  await seedRoles();
  const site = await getPublishedSite(); // ensures theme/site/business config rows exist
  void site;
  await prisma.siteConfig.findUnique({ where: { key: 'theme' } });
  const { getPublishedTheme, getBusiness } = await import('../services/siteConfig.service');
  await getPublishedTheme();
  await getBusiness();
  await seedPages();
  const ids = await seedCatalogue();
  if (demo) await seedDemo(ids);
  console.log(`\nSeed complete${demo ? ' (with SAMPLE demo data)' : ''}. Next: npm run create-admin`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
