# Architecture & implementation plan

## Stack (and why)

| Layer | Choice | Reason |
| --- | --- | --- |
| Monorepo | npm workspaces: `shared`, `server`, `client` | One source of truth for validation rules, money maths and the CMS section registry |
| Shared | TypeScript + zod | The server validates with the same schemas the admin forms and the public renderer use |
| Backend | Node 20+, Express, TypeScript | Mature, simple to deploy anywhere |
| Database | PostgreSQL + Prisma (6.x) | Relational integrity for bookings/payments, transactions, migrations |
| Auth | Server-side sessions (random token in an httpOnly cookie, SHA-256 hash in `Session`), double-submit CSRF, optional TOTP MFA | Revocable sessions, no tokens in JS, simple "log out everywhere" |
| Frontend | React 18 + Vite + TypeScript + Tailwind, TanStack Query, React Hook Form + zod | Fast, code-split, typed forms |
| Motion / 3D | Framer Motion, GSAP (selected scroll scenes), Lenis smooth scroll, React Three Fiber for the optional 3D stage | Cinematic but `prefers-reduced-motion` aware, with static fallbacks |
| Charts | Recharts | Dashboard & reports |
| Media | Cloudinary when configured, local disk in development | Production must not rely on ephemeral disk |
| Payments | Razorpay (server-created orders, signature + webhook verification), sandbox provider for local testing | Spec requirement; sandbox is refused in production |
| Email | SMTP (nodemailer) or Resend HTTP API; outbound queue with retries and logs | No message is ever shown as "sent" without a provider |
| PDF | pdfkit (server-side) | Branded quotations and invoices |
| Tests | Vitest + Supertest against a real PostgreSQL test database | Critical workflows tested end-to-end through the API |

## Key decisions

- **Money** is integer minor units everywhere (`BigInt` columns). Quotation totals, milestones, invoices and
  payment amounts are always recomputed on the server (`shared/src/quotation.ts`); client totals are ignored.
- **Draft → publish** for pages, theme and site settings. Drafts can be incomplete; publishing validates
  everything and writes an immutable version snapshot, so restoring an older version is one click.
- **Theme as CSS variables.** The published theme becomes CSS custom properties; Tailwind reads them, so colours,
  fonts, sizes, radii, buttons and cards change site-wide without a rebuild.
- **RBAC enforced on the server.** Role → permission mappings live in the `Role` table (editable). Every route
  declares the permission it needs; client data is additionally ownership-checked (a client can only reach
  bookings whose `clientId` matches their account — IDs are never trusted alone).
- **Pipeline as explicit state machines** (`shared/src/workflow.ts`). An inquiry is never a booking; a booking
  only becomes `CONFIRMED` after contract + verified advance payment (or an audited manual override).
- **Idempotent payments.** Unique provider ids, `WebhookEvent(provider, eventId)` uniqueness and transactional
  status transitions make duplicate webhooks and double callbacks harmless.
- **Honest integrations.** Missing credentials produce clear "not configured" states, never fake success.

## Phases

1. Architecture, structure, database design ✅
2. Design system, homepage, public pages
3. Backend APIs, auth, roles & permissions
4. Admin dashboard, theme customizer, CMS, media library
5. Services, categories, portfolio, packages, inquiry system
6. Clients, quotations, booking workflow, client portal
7. Vendors, tasks, calendar, invoices, payments
8. Notifications, reports, SEO, advanced features
9. Tests, security review, performance, deployment
