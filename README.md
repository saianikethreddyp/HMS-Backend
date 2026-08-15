# hms-backend

Standalone backend service for the Hospital Membership ERP. Node.js +
Express + TypeScript, PostgreSQL (via Prisma), cookie-session auth. This is
a separate service from `../hospital-membership-erp` (the Next.js frontend);
they talk over HTTP with credentialed CORS.

Implements delivery-plan Milestones 1-2: the domain core (cards, members,
membership periods, atomic shared-quota usage, void, renewal) plus auth,
authorization, and audit logging. Reporting/CSV export is not built yet.

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and a real SEED_ADMIN_PASSWORD
npx prisma migrate dev
npm run seed
npm run dev
```

`GET /healthz` should report `{ "status": "ok", "database": "ok" }`.

## Environment variables

See `.env.example`. `DATABASE_URL` must point at a PostgreSQL database.
`SEED_ADMIN_LOGIN` / `SEED_ADMIN_PASSWORD` are only used by `npm run seed`
to create the first admin account in a fresh database — never commit real
credentials.

## Domain model

One membership card has at most one ACTIVE membership period at a time
(enforced by a partial unique index). A period snapshots its offer's price,
member limit, and quota total so editing the offer later never changes an
already-issued period. Every `OP`, `PHARMACY`, or `DIAGNOSTIC` service usage
consumes one unit from the period's shared `quota_used` counter, enforced by
an atomic conditional `UPDATE ... WHERE quota_used < quota_total`. Usage
records carry a required, client-supplied `idempotencyKey`; a retried
request with the same key and payload returns the original result instead
of deducting twice. Voiding a usage is the inverse operation and requires a
reason; usage rows are never deleted.

## API

- `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `POST /cards` (ADMIN), `GET /cards?query=`, `GET /cards/:id`
- `POST /cards/:id/members` (ADMIN), `PATCH /cards/:id/members/:memberId` (ADMIN)
- `POST /cards/:id/renew` (ADMIN)
- `POST /usages`, `POST /usages/:id/void` (ADMIN)
- `GET /healthz`

All mutating requests require both the session cookie (set by `/auth/login`)
and a matching `X-CSRF-Token` header (double-submit cookie pattern; the
token is also set as a readable `hms_csrf` cookie at login).

Errors are JSON: `{ "error": { "code": "QUOTA_EXHAUSTED", "message": "..." } }`.
See `src/lib/errors.ts` for the full list of stable error codes.

## Tests

```bash
npm test        # domain unit tests + integration tests against DATABASE_URL
npm run lint
npm run typecheck
```

Integration tests truncate the app's tables before each test (`tests/integration/helpers.ts`).
Point `DATABASE_URL` at a database you're fine wiping — do not run tests
against a database with real hospital data.

## Not built yet (explicitly out of scope for this pass)

- Reporting/CSV export (delivery-plan Milestone 5).
- Production hardening: backups, restore drills, deployment/runbook,
  monitoring (Milestone 6).
- Settings/offer-management endpoints beyond the seeded default offer.
