import { DEFAULT_THEME, type BusinessSettings, type SiteSettings, type ThemeTokens, businessSettingsSchema } from '@maison/shared';

/** Starting site configuration. Everything here is editable in Admin → Website. Contact details are placeholders. */
export const DEFAULT_SITE: SiteSettings = {
  brand: {
    name: 'Maison Aurelle',
    tagline: 'Luxury event design & production',
    logoUrl: '',
    logoLightUrl: '',
    logoAlt: 'Maison Aurelle',
    faviconUrl: '',
    wordmark: 'MAISON AURELLE',
  },
  company: {
    about: 'An event design and production atelier creating weddings, galas, brand experiences and private celebrations.',
    email: 'hello@example.com',
    phone: '+91 00000 00000',
    whatsapp: '',
    whatsappMessage: 'Hello! I would like to plan an event.',
    addressLine: 'Studio address (update in Admin → Website → Global settings)',
    city: 'Mumbai',
    region: 'Maharashtra',
    postalCode: '',
    country: 'India',
    hours: 'Mon–Sat, 10:00–19:00 · Consultations by appointment',
    mapEmbedUrl: '',
  },
  social: [
    { network: 'instagram', url: 'https://instagram.com/' },
    { network: 'pinterest', url: 'https://pinterest.com/' },
  ],
  navigation: [
    {
      label: 'Events',
      href: '/events',
      newTab: false,
      children: [
        { label: 'Luxury Weddings', href: '/events/luxury-weddings', newTab: false },
        { label: 'Destination Weddings', href: '/events/destination-weddings', newTab: false },
        { label: 'Corporate Events', href: '/events/corporate-events', newTab: false },
        { label: 'Birthday Parties', href: '/events/birthday-parties', newTab: false },
        { label: 'Concerts & Festivals', href: '/events/concerts-and-festivals', newTab: false },
        { label: 'All occasions', href: '/events', newTab: false },
      ],
    },
    { label: 'Services', href: '/services', newTab: false, children: [] },
    { label: 'Portfolio', href: '/portfolio', newTab: false, children: [] },
    { label: 'Packages', href: '/packages', newTab: false, children: [] },
    { label: 'About', href: '/about', newTab: false, children: [] },
    { label: 'Journal', href: '/journal', newTab: false, children: [] },
    { label: 'Contact', href: '/contact', newTab: false, children: [] },
  ],
  footer: {
    blurb: 'Weddings, celebrations and brand experiences — designed with intention and produced with precision.',
    columns: [
      {
        title: 'Occasions',
        links: [
          { label: 'Luxury Weddings', href: '/events/luxury-weddings', newTab: false },
          { label: 'Destination Weddings', href: '/events/destination-weddings', newTab: false },
          { label: 'Corporate Events', href: '/events/corporate-events', newTab: false },
          { label: 'Private Parties', href: '/events/private-parties', newTab: false },
        ],
      },
      {
        title: 'Studio',
        links: [
          { label: 'About us', href: '/about', newTab: false },
          { label: 'Portfolio', href: '/portfolio', newTab: false },
          { label: 'Packages', href: '/packages', newTab: false },
          { label: 'Journal', href: '/journal', newTab: false },
        ],
      },
      {
        title: 'Clients',
        links: [
          { label: 'Book your event', href: '/inquire', newTab: false },
          { label: 'Track an inquiry', href: '/track', newTab: false },
          { label: 'Client portal', href: '/portal', newTab: false },
          { label: 'Contact', href: '/contact', newTab: false },
        ],
      },
    ],
    legalText: '© Maison Aurelle. All rights reserved.',
    legalLinks: [
      { label: 'Privacy', href: '/privacy-policy', newTab: false },
      { label: 'Terms', href: '/terms', newTab: false },
    ],
  },
  announcement: { enabled: false, text: 'Now booking destination weddings for the 2027 season.', href: '/inquire', linkLabel: 'Inquire' },
  newsletter: { heading: 'The private list', body: 'Occasional inspiration, new destinations and seasonal openings. No spam — unsubscribe anytime.' },
  inquiry: {
    budgetRanges: ['Under ₹5 lakh', '₹5–15 lakh', '₹15–30 lakh', '₹30–60 lakh', '₹60 lakh – ₹1 crore', '₹1 crore+', 'Not sure yet'],
    serviceOptions: [
      'Complete event planning',
      'Venue selection',
      'Stage & mandap design',
      'Décor & florals',
      'Lighting & sound',
      'Catering coordination',
      'Photography & videography',
      'Entertainment & artists',
      'Guest management',
      'Invitations',
      'Logistics & transport',
      'Accommodation & travel',
      'Live streaming',
    ],
    successMessage: 'Thank you. A senior planner will be in touch within one business day.',
    allowUploads: true,
  },
  seo: {
    title: 'Maison Aurelle — Luxury Event Design & Production',
    description: 'Luxury weddings, destination celebrations, corporate events and private parties — designed and produced end to end.',
    image: '',
    noIndex: false,
    siteUrl: '',
    titleTemplate: '%s · Maison Aurelle',
    organizationType: 'LocalBusiness',
  },
  floatingWhatsApp: true,
  cookieNotice: true,
};

export const DEFAULT_THEME_TOKENS: ThemeTokens = DEFAULT_THEME;

export const DEFAULT_BUSINESS: BusinessSettings = businessSettingsSchema.parse({
  legalName: '',
  quotation: {
    defaultTaxes: [{ name: 'GST', rateBps: 1800 }],
    terms:
      'Prices are valid until the date shown. Bookings are confirmed only after the signed agreement and the advance payment are received. ' +
      'Third-party vendor rates are subject to availability at the time of confirmation. Changes to scope after confirmation will be quoted separately.',
  },
  invoice: { footer: 'Thank you for your business.', bankDetails: '' },
  cancellationPolicy: 'Cancellation terms are set out in your event agreement.',
  refundRules: [
    { daysBefore: 90, refundBps: 7500 },
    { daysBefore: 30, refundBps: 2500 },
    { daysBefore: 0, refundBps: 0 },
  ],
});
