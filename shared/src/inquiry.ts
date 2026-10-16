import { z } from 'zod';
import { emailSchema, phoneSchema } from './common';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

export const GUEST_RANGES = ['Under 50', '50–100', '100–250', '250–500', '500–1,000', '1,000+'] as const;

/** Public multi-step inquiry form. Validated on the client per step and in full on the server. */
export const inquiryStepSchemas = {
  contact: z.object({
    name: z.string().trim().min(2, 'Please enter your full name').max(120),
    email: emailSchema,
    phone: phoneSchema,
    preferredContact: z.enum(['PHONE', 'EMAIL', 'WHATSAPP']).default('PHONE'),
  }),
  event: z.object({
    eventType: z.string().trim().min(1, 'Choose an event type').max(80),
    categoryId: z.string().max(40).nullable().default(null),
    eventDate: isoDate.or(z.literal('')).default(''),
    alternativeDate: isoDate.or(z.literal('')).default(''),
    dateFlexible: z.boolean().default(false),
    location: z.string().trim().min(2, 'Tell us the city or location').max(160),
    guestCount: z.coerce.number().int().min(1, 'Estimated guests is required').max(100_000),
    budgetRange: z.string().trim().min(1, 'Choose a budget range').max(60),
  }),
  requirements: z.object({
    venueRequirements: z.string().trim().max(1500).default(''),
    services: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    themePreferences: z.string().trim().max(1500).default(''),
    cateringRequirements: z.string().trim().max(1500).default(''),
    notes: z.string().trim().max(3000).default(''),
    referenceImages: z.array(z.string().max(40)).max(6).default([]),
  }),
};

export const inquirySubmitSchema = inquiryStepSchemas.contact
  .merge(inquiryStepSchemas.event)
  .merge(inquiryStepSchemas.requirements)
  .extend({
    consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice to continue' }) }),
    packageId: z.string().max(40).nullable().default(null),
    source: z.string().trim().max(60).default('website'),
    utm: z.record(z.string().max(120)).default({}),
    /** Honeypot — must stay empty. */
    website: z.string().max(0, 'Invalid submission').default(''),
    /** Epoch ms when the form was opened; used to reject instant bot submissions. */
    startedAt: z.number().int().optional(),
    captchaToken: z.string().max(2048).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.eventDate && v.alternativeDate && v.alternativeDate === v.eventDate) {
      ctx.addIssue({ code: 'custom', path: ['alternativeDate'], message: 'Alternative date should differ from the preferred date' });
    }
  });
export type InquirySubmit = z.infer<typeof inquirySubmitSchema>;

/** Short contact form (Contact page / homepage block). Creates an inquiry with source "contact-form". */
export const contactSubmitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: phoneSchema.or(z.literal('')).default(''),
  eventType: z.string().trim().max(80).default('General enquiry'),
  message: z.string().trim().min(10, 'Tell us a little more (10+ characters)').max(3000),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice to continue' }) }),
  website: z.string().max(0).default(''),
  startedAt: z.number().int().optional(),
  captchaToken: z.string().max(2048).optional(),
});

export const trackInquirySchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^INQ-[A-Z0-9]{4,12}$/, 'Reference looks like INQ-XXXXXX'),
  email: emailSchema,
});
