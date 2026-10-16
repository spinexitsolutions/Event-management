# Local development

## Requirements
- Node.js 20.11+ (22 recommended — see `.nvmrc`)
- PostgreSQL 14+ (16 recommended). Docker users: `docker compose up -d db`

## 1. Install
```bash
npm install
cp server/.env.example server/.env
```
Edit `server/.env`:
- `DATABASE_URL` — e.g. `postgresql://postgres:postgres@localhost:5432/events_dev`
- `APP_SECRET` — `openssl rand -hex 32`
- Leave `PAYMENT_PROVIDER=sandbox`, `EMAIL_PROVIDER=none`, `STORAGE_DRIVER=local` for local work.

## 2. Database
```bash
createdb events_dev            # or let Prisma create it
npm run db:migrate             # applies migrations (prisma migrate dev)
npm run seed                   # roles, theme, global settings, pages, starter catalogue
npm run seed -- --demo         # optional: SAMPLE venues, portfolio, vendors, clients, bookings, payments
```
Sample records are labelled “Sample” and are meant for demonstrations only — skip `--demo` for a real launch.

## 3. First admin account
There are no default credentials.
```bash
npm run create-admin -- --email you@company.com --name "Your Name"
# password is prompted (or set ADMIN_PASSWORD in the environment for automation)
```

## 4. Run
```bash
npm run dev     # API http://localhost:4000 · website http://localhost:5173 (Vite proxies /api and /uploads)
```
- Website: http://localhost:5173 · Admin: http://localhost:5173/admin · Client portal: http://localhost:5173/portal
- Health: http://localhost:4000/api/health · API reference: [api-reference.md](api-reference.md)

## Checks
```bash
npm run typecheck && npm run lint && npm test && npm run build
```
Server tests run against a real PostgreSQL **test** database: create `events_test` (or set `TEST_DATABASE_URL`).
The test setup recreates that database's schema on every run and refuses to touch a database whose name does not end in `_test`.

## Useful scripts
| Command | What it does |
| --- | --- |
| `npm run db:migrate -w server -- --name <change>` | Create a migration after editing `server/prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations (production / CI) |
| `node scripts/gen-api-docs.mjs` | Regenerate `docs/api-reference.md` from the route files |
