# Production deployment

The app ships as **one Node service** (API + built website, with per-route SEO tags injected server-side) plus **PostgreSQL**
and **object storage** (Cloudinary). Any container host works (Render, Railway, Fly.io, ECS, a VM with Docker).

## Build & run with Docker
```bash
docker build -t maison-events .
docker run -p 4000:4000 --env-file server/.env maison-events
```
The container runs `prisma migrate deploy` on start, then `node dist/index.js`. `docker compose up --build` starts a local
production-like stack with PostgreSQL.

## Required environment (production)
| Variable | Notes |
| --- | --- |
| `NODE_ENV=production` | Enables secure cookies, static website serving, production guards |
| `DATABASE_URL` | Managed PostgreSQL (enable automated backups + PITR) |
| `APP_SECRET` | 32+ random characters. Rotating it invalidates MFA secrets and sandbox signatures |
| `APP_URL`, `API_URL`, `CORS_ORIGINS` | Your public https origin (same origin when the API serves the site) |
| `STORAGE_DRIVER=cloudinary` + `CLOUDINARY_*` | **Required** — container disks are ephemeral |
| `PAYMENT_PROVIDER=razorpay` + `RAZORPAY_*` | The sandbox gateway is refused in production |
| `EMAIL_PROVIDER=smtp|resend` + credentials | Without it, emails are logged as SKIPPED (never reported as sent) |
| `TRUST_PROXY=1` | When behind one reverse proxy / load balancer (needed for correct client IPs and rate limits) |
| `JOBS_ENABLED=true` | Reminders, quotation expiry, outbox retries, cleanup. Safe on several instances (database lease locks) |

## Steps
1. Provision PostgreSQL and Cloudinary; create the Razorpay account (test mode first) and an email provider.
2. Deploy the container with the environment above.
3. Run once: `npx prisma migrate deploy` (automatic in the image), `npm run seed` (from a one-off container: `node dist/scripts/seed.js`), then
   `node dist/scripts/createAdmin.js --email you@company.com --name "You"` with `ADMIN_PASSWORD` set for that one command.
4. Razorpay webhook: Dashboard → Webhooks → URL `https://<your-domain>/api/v1/webhooks/razorpay`, events `payment.captured`, `payment.failed`,
   `order.paid`, `refund.processed`; copy the secret into `RAZORPAY_WEBHOOK_SECRET`.
5. Point DNS, enable HTTPS (the platform's TLS or a reverse proxy). Cookies are `Secure` + `HttpOnly` + `SameSite=Lax` in production.
6. In the admin: replace sample photography and placeholder contact details, review package prices, legal pages, business settings
   (tax, quotation terms, refund rules), email templates and automations, then publish.

## Backups & maintenance
- **Database:** daily automated backups with ≥7 days retention and point-in-time recovery. Manual: `pg_dump -Fc "$DATABASE_URL" > backup.dump`;
  restore into a fresh database with `pg_restore -d "$NEW_DATABASE_URL" --no-owner backup.dump`, then point `DATABASE_URL` at it.
  Test a restore quarterly.
- **Media:** Cloudinary keeps originals; enable backups in Cloudinary settings for extra safety.
- **Upgrades:** `npm outdated`, update, run the full check suite, deploy. Schema changes always go through Prisma migrations.
- **Monitoring:** `/api/health` for uptime checks; logs are structured JSON (pino) with sensitive fields redacted.
  Watch Admin → Emails & automations → Outbox for FAILED messages and Admin → Audit log for sensitive actions.
- **Data retention:** closed inquiries without quotations/bookings are deleted automatically after the retention period in
  Business settings; expired sessions, used tokens and orphaned inquiry uploads are cleaned nightly.
