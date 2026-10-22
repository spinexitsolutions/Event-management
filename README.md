# Maison Events — premium event management platform

A full-stack platform for a luxury event agency: a cinematic, fully CMS-driven public website and an operations suite covering
inquiries, CRM, quotations, bookings, client portal, payments, vendors, inventory, tasks, calendar, guests/RSVP, notifications and reports.

> **Stack:** React 18 + Vite + TypeScript + Tailwind · Framer Motion, Lenis, Swiper, React Three Fiber · Node + Express + TypeScript ·
> MongoDB + Prisma · zod everywhere (shared schemas) · Razorpay · SMTP/Resend · Cloudinary · Vitest + Supertest.

## What's inside
| Area | Highlights |
| --- | --- |
| Public website | Cinematic hero slideshow, 24 CMS section types with layout variants, event categories, services, portfolio with filters + lightbox + before/after, packages with transparent pricing, venues, journal, FAQs, 3D stage concept viewer, multi-step inquiry form with uploads, inquiry tracking, RSVP pages and event microsites, WhatsApp button, SEO (server-injected meta, Open Graph, JSON-LD, sitemap, robots) |
| Website builder | Drag-and-drop page builder with live device preview, theme customizer (5 presets, colours, fonts, typography, buttons, cards, spacing, backgrounds, header/footer, motion), global content (branding, navigation, footer, contact, announcement, SEO), content library, media library — all **draft → preview → publish → restore**, database-backed |
| Sales | Inquiry pipeline with assignment, communication log, consultations, reminders, CSV export; CRM; quotation generator with versions, optional items, taxes, fees, milestones, branded PDFs, client acceptance; optional AI drafts (human-approved) |
| Delivery | Bookings with enforced workflow (contract → advance → confirmed → execution → final payment → completed), tasks & templates, vendors & POs, venue/resource conflict prevention, guests/RSVP/QR check-in, documents, client messaging, change/reschedule/cancellation requests, calendar |
| Finance | Instalments, Razorpay online payments (verified + idempotent webhooks), manual payments with audit, invoices (PDF), dual-approval refunds, expenses, margins, CSV exports |
| Client portal | Proposals (accept / request changes), payments, invoices, documents, planning milestones, messages, requests, feedback, calendar file |
| Admin | Role-based access (8 staff roles, editable permission matrix), MFA, sessions, audit log, email templates & automations with outbox, business settings, integration status, reports |

## Quick start
```bash
npm install
cp server/.env.example server/.env        # set DATABASE_URL and APP_SECRET
npm run db:push && npm run seed -- --demo
npm run create-admin -- --email you@company.com --name "Your Name"
npm run dev                               # http://localhost:5173  (admin: /admin)
```
Full instructions: [docs/setup.md](docs/setup.md).

## Checks
```bash
npm run typecheck && npm run lint && npm test && npm run build
```

## Documentation
[Architecture](docs/architecture.md) · [Setup](docs/setup.md) · [Admin guide](docs/admin-guide.md) · [API reference](docs/api-reference.md) ·
[Database](docs/database.md) · [Integrations](docs/integrations.md) (Razorpay, email, WhatsApp, Cloudinary, AI) · [Security](docs/security.md) ·
[Deployment & backups](docs/deployment.md) · [Screenshots](docs/screenshots)

## Works out of the box vs. needs your credentials
| Works locally without setup | Needs configuration for production |
| --- | --- |
| Website, CMS, theme, all admin modules, client portal, PDFs, reports, local media storage, sandbox payments (clearly labelled) | **Razorpay** keys + webhook secret · **Email** (SMTP or Resend) — until then emails are logged as *skipped*, never shown as sent · **Cloudinary** for media · optional WhatsApp Cloud API, Cloudflare Turnstile, Anthropic API |

Sample content: `seed --demo` adds clearly labelled **Sample** venues, portfolio projects, vendors, clients and bookings using Unsplash
photography. Replace them — and the placeholder contact details, package prices and legal templates — before launch.
