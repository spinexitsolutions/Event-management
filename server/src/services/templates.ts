/**
 * Default email templates. Admins can edit subject/body per key (EmailTemplate table); these are the seeds
 * and the fallback when a key has no row. Bodies are plain text with {{variables}}, blank-line paragraphs
 * and [label](url) links. Values are HTML-escaped when rendered.
 */
export const DEFAULT_EMAIL_TEMPLATES: Record<string, { name: string; subject: string; body: string }> = {
  inquiry_confirmation: {
    name: 'Inquiry confirmation (client)',
    subject: 'We have received your inquiry — {{reference}}',
    body: 'Dear {{name}},\n\nThank you for considering {{brand}} for your {{eventType}}. Your inquiry reference is **{{reference}}**.\n\nA planner will contact you shortly to arrange a consultation. You can follow the progress of your inquiry at any time: [Track your inquiry]({{trackUrl}})\n\nWarm regards,\n{{brand}}',
  },
  admin_inquiry_alert: {
    name: 'New inquiry alert (staff)',
    subject: 'New inquiry {{reference}} — {{eventType}}, {{guestCount}} guests',
    body: 'A new inquiry has arrived.\n\n{{name}} · {{email}} · {{phone}}\n{{eventType}} on {{eventDate}} in {{location}}\nGuests: {{guestCount}} · Budget: {{budgetRange}}\n\n[Open in admin]({{adminUrl}})',
  },
  consultation_reminder: {
    name: 'Consultation reminder',
    subject: 'Reminder: your consultation on {{when}}',
    body: 'Dear {{name}},\n\nThis is a reminder of your consultation with {{brand}} on **{{when}}** ({{mode}}).\n\n{{location}}\n\nWe look forward to speaking with you.',
  },
  quotation_sent: {
    name: 'Quotation sent',
    subject: 'Your proposal from {{brand}} — {{number}}',
    body: 'Dear {{name}},\n\nYour proposal **{{title}}** ({{number}}) is ready. Total: **{{total}}**, valid until {{validUntil}}.\n\nYou can review it, choose optional services, accept or request changes in your client portal:\n\n[View your proposal]({{portalUrl}})',
  },
  booking_confirmation: {
    name: 'Booking confirmed',
    subject: 'Your event is confirmed — {{reference}}',
    body: 'Dear {{name}},\n\nWonderful news — **{{title}}** on {{eventDate}} is confirmed. Your event manager is {{manager}}.\n\n[Open your event portal]({{portalUrl}})',
  },
  payment_confirmation: {
    name: 'Payment received',
    subject: 'Payment received — {{amount}}',
    body: 'Dear {{name}},\n\nWe have received your payment of **{{amount}}** for {{title}} ({{reference}}). Thank you.\n\nOutstanding balance: {{balance}}.\n\n[View payments]({{portalUrl}})',
  },
  payment_due_reminder: {
    name: 'Payment due reminder',
    subject: 'Payment reminder — {{label}} due {{dueDate}}',
    body: 'Dear {{name}},\n\nA gentle reminder that **{{label}}** of **{{amount}}** for {{title}} is due on {{dueDate}}.\n\n[Pay securely online]({{portalUrl}})',
  },
  event_reminder: {
    name: 'Event reminder',
    subject: '{{title}} is {{days}} days away',
    body: 'Dear {{name}},\n\n{{title}} on {{eventDate}} is {{days}} days away. Your planning timeline is in your portal.\n\n[Open your event portal]({{portalUrl}})',
  },
  vendor_task_reminder: {
    name: 'Vendor delivery reminder (staff)',
    subject: 'Vendor delivery due: {{vendor}} — {{service}}',
    body: '{{vendor}} is scheduled to deliver **{{service}}** for {{title}} on {{when}}.\n\n[Open booking]({{adminUrl}})',
  },
  event_completion: {
    name: 'Event completed',
    subject: 'Thank you for celebrating with {{brand}}',
    body: 'Dear {{name}},\n\nThank you for trusting us with {{title}}. It was a privilege to bring it to life.\n\nYour final invoice and documents remain available in your portal.\n\n[Open your portal]({{portalUrl}})',
  },
  feedback_request: {
    name: 'Feedback request',
    subject: 'How did we do?',
    body: 'Dear {{name}},\n\nWe would love to hear about your experience of {{title}}. It takes one minute:\n\n[Share your feedback]({{portalUrl}})',
  },
  password_reset: {
    name: 'Password reset',
    subject: 'Reset your password',
    body: 'Hello {{name}},\n\nUse the link below to choose a new password. It expires in 60 minutes. If you did not request this, you can ignore this email.\n\n[Reset password]({{url}})',
  },
  staff_invite: {
    name: 'Staff invitation',
    subject: 'You have been invited to {{brand}} admin',
    body: 'Hello {{name}},\n\nYou have been invited to join the {{brand}} team as **{{role}}**. Set your password to activate your account (link valid for 72 hours):\n\n[Accept invitation]({{url}})',
  },
  portal_invite: {
    name: 'Client portal invitation',
    subject: 'Your private event portal with {{brand}}',
    body: 'Dear {{name}},\n\nYour private client portal is ready. Set a password to view proposals, invoices, documents and your planning timeline (link valid for 72 hours):\n\n[Activate your portal]({{url}})',
  },
  email_verification: {
    name: 'Verify email',
    subject: 'Confirm your email address',
    body: 'Hello {{name}},\n\nPlease confirm your email address to activate your client account:\n\n[Confirm email]({{url}})',
  },
  general_followup: {
    name: 'Follow-up (free text)',
    subject: '{{subject}}',
    body: '{{message}}',
  },
  rsvp_invitation: {
    name: 'Guest invitation (RSVP)',
    subject: 'You are invited — {{title}}',
    body: 'Dear {{name}},\n\nYou are warmly invited to **{{title}}** on {{eventDate}}.\n\n[View invitation & RSVP]({{url}})',
  },
};
export type TemplateKey = keyof typeof DEFAULT_EMAIL_TEMPLATES;
