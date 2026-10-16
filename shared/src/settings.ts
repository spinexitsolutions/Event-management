import { z } from 'zod';
import { mediaUrl, safeHref, seoSchema } from './common';
import { CURRENCIES } from './money';
import { milestoneSchema, quoteTaxSchema, DEFAULT_MILESTONES } from './quotation';

const navLink = z.object({
  label: z.string().trim().min(1).max(40),
  href: safeHref,
  newTab: z.boolean().default(false),
});
export const navItemSchema = navLink.extend({ children: z.array(navLink).max(12).default([]) });
export type NavItem = z.infer<typeof navItemSchema>;

export const footerColumnSchema = z.object({
  title: z.string().trim().min(1).max(40),
  links: z.array(navLink).max(12).default([]),
});

/** Public site configuration. Drafted and published together with the theme (versioned). */
export const siteSettingsSchema = z.object({
  brand: z.object({
    name: z.string().trim().min(1).max(60),
    tagline: z.string().trim().max(140).default(''),
    logoUrl: mediaUrl.default(''),
    logoLightUrl: mediaUrl.default(''),
    logoAlt: z.string().trim().max(120).default(''),
    faviconUrl: mediaUrl.default(''),
    /** Short text used as a logo when no logo image is uploaded. */
    wordmark: z.string().trim().max(40).default(''),
  }),
  company: z.object({
    about: z.string().trim().max(600).default(''),
    email: z.string().trim().email().or(z.literal('')).default(''),
    phone: z.string().trim().max(30).default(''),
    whatsapp: z.string().trim().max(20).regex(/^\+?\d*$/, 'Digits only, with country code').default(''),
    whatsappMessage: z.string().trim().max(200).default('Hello! I would like to plan an event.'),
    addressLine: z.string().trim().max(200).default(''),
    city: z.string().trim().max(80).default(''),
    region: z.string().trim().max(80).default(''),
    postalCode: z.string().trim().max(20).default(''),
    country: z.string().trim().max(60).default(''),
    hours: z.string().trim().max(200).default(''),
    mapEmbedUrl: z
      .string()
      .trim()
      .refine((v) => v === '' || /^https:\/\/(www\.)?google\.com\/maps\/embed\?/.test(v), 'Must be a Google Maps embed URL')
      .default(''),
  }),
  social: z
    .array(z.object({ network: z.enum(['instagram', 'facebook', 'youtube', 'linkedin', 'x', 'pinterest', 'tiktok', 'vimeo']), url: safeHref }))
    .max(10)
    .default([]),
  navigation: z.array(navItemSchema).max(10).default([]),
  footer: z.object({
    blurb: z.string().trim().max(300).default(''),
    columns: z.array(footerColumnSchema).max(5).default([]),
    legalText: z.string().trim().max(200).default(''),
    legalLinks: z.array(navLink).max(6).default([]),
  }),
  announcement: z.object({
    enabled: z.boolean().default(false),
    text: z.string().trim().max(160).default(''),
    href: safeHref.default(''),
    linkLabel: z.string().trim().max(30).default(''),
  }),
  newsletter: z.object({
    heading: z.string().trim().max(100).default('The private list'),
    body: z.string().trim().max(300).default(''),
  }),
  inquiry: z.object({
    budgetRanges: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
    serviceOptions: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
    successMessage: z.string().trim().max(400).default(''),
    allowUploads: z.boolean().default(true),
  }),
  seo: seoSchema.extend({
    siteUrl: z.string().trim().url().or(z.literal('')).default(''),
    titleTemplate: z.string().trim().max(60).default('%s'),
    organizationType: z.enum(['Organization', 'LocalBusiness', 'EventPlanner']).default('LocalBusiness'),
  }),
  floatingWhatsApp: z.boolean().default(true),
  cookieNotice: z.boolean().default(true),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** Internal business configuration (not public; not part of draft/publish). */
export const businessSettingsSchema = z.object({
  legalName: z.string().trim().max(160).default(''),
  taxId: z.string().trim().max(30).default(''),
  currency: z.enum(CURRENCIES).default('INR'),
  timezone: z.string().trim().max(60).default('Asia/Kolkata'),
  quotation: z.object({
    prefix: z.string().trim().max(8).regex(/^[A-Z]*$/).default('QT'),
    validityDays: z.number().int().min(1).max(180).default(14),
    defaultTaxes: z.array(quoteTaxSchema).max(5).default([]),
    defaultMilestones: z.array(milestoneSchema).min(1).max(8).default(DEFAULT_MILESTONES),
    terms: z.string().trim().max(8000).default(''),
  }).default({}),
  invoice: z.object({
    prefix: z.string().trim().max(8).regex(/^[A-Z]*$/).default('INV'),
    footer: z.string().trim().max(1000).default(''),
    bankDetails: z.string().trim().max(1000).default(''),
  }).default({}),
  cancellationPolicy: z.string().trim().max(5000).default(''),
  /** Percentage of paid amounts that is refundable when a client cancels N+ days before the event. */
  refundRules: z
    .array(z.object({ daysBefore: z.number().int().min(0).max(730), refundBps: z.number().int().min(0).max(10_000) }))
    .max(8)
    .default([]),
  notifications: z.object({
    adminEmails: z.array(z.string().trim().email()).max(10).default([]),
    automations: z
      .object({
        inquiryConfirmation: z.boolean().default(true),
        adminInquiryAlert: z.boolean().default(true),
        consultationReminder: z.boolean().default(true),
        quotationSent: z.boolean().default(true),
        bookingConfirmation: z.boolean().default(true),
        paymentConfirmation: z.boolean().default(true),
        paymentDueReminder: z.boolean().default(true),
        eventReminder: z.boolean().default(true),
        vendorTaskReminder: z.boolean().default(true),
        eventCompletion: z.boolean().default(true),
        feedbackRequest: z.boolean().default(true),
      })
      .default({}),
    paymentReminderDays: z.array(z.number().int().min(0).max(60)).max(5).default([7, 1]),
    eventReminderDays: z.array(z.number().int().min(0).max(60)).max(5).default([14, 2]),
    whatsappEnabled: z.boolean().default(false),
  }).default({}),
  dataRetentionMonths: z.number().int().min(6).max(120).default(36),
});
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;
