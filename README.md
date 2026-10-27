# QuoteKit

A single-user invoicing platform on Cloudflare's free tier. It has a public pricing calculator, a private dashboard for services, clients and invoices, email through Resend, and scheduled jobs. It has no payment gateways.

## Business decisions

| Setting               | Value                                        |
| --------------------- | -------------------------------------------- |
| Business name         | QuoteKit                                     |
| Default currency      | LKR                                          |
| Invoice number format | `INV-YYYY-NNNN`, for example `INV-2026-0001` |

## Requirements

- Node.js 20 or newer
- [Bun](https://bun.sh)
- A Cloudflare account with the domain added to Cloudflare DNS
- A Resend account
- Wrangler, signed in with `bunx wrangler login`

Check the setup with:

```bash
node -v
bunx wrangler whoami
```

## Development

```bash
bun install
bun run dev
```

The dev server runs on http://localhost:3000. Run it with `bun run dev`, not `bun --bun run dev`, which breaks the Cloudflare plugin. Trigger the scheduled handler locally with:

```bash
curl "http://localhost:3000/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"
```

Other scripts: `bun run build`, `bun run deploy`, and `bun run cf-typegen` to regenerate `worker-configuration.d.ts` after editing `wrangler.toml`.

Checks: `bun run test` (Vitest), `bun run lint` (ESLint), `bun run typecheck` (tsc) and `bun run format` (Prettier).

## Project layout

Routes are directory based. Each route folder under `src/routes` owns its components, for example `src/routes/calculator/components/footer.tsx`. Any folder named `components` is skipped by the route generator (`routeFileIgnorePattern` in `vite.config.ts`). Components shared across routes go in `src/components/common`.

Other folders: `src/db` (Drizzle schema), `src/lib` (shared helpers), `src/server` (server-only code), `src/jobs` (scheduled jobs).

## Database

D1 (binding `DB`, database `quotekit`) is accessed through Drizzle. The schema lives in `src/db/schema.ts`. Money is stored in cents, tax rates and percentage price modifiers in basis points (1500 = 15%), and dates as ISO 8601 text.

```bash
bun run db:generate        # write a new migration to drizzle/ after editing the schema
bun run db:migrate:local   # apply migrations to the local database
bun run db:migrate:remote  # apply migrations to the remote database
bun run db:seed            # insert sample data locally (safe to run twice)
```

`db:seed` loads settings, two clients and one invoice from `src/db/seed.sql`, then imports the service catalogue in `src/db/seed-services.json` (categories, services, options and dependencies) with the same importer as `bun run services:import`. Prices are in LKR. A second run creates nothing.

## UI components

The UI uses shadcn/ui on Base UI (`components.json`, preset `nova`). Add components with `bunx --bun shadcn@latest add <name>`; they land in `src/components/ui`. Custom components are written only when shadcn has no equivalent.

## Admin access

Everything under `/admin` sits behind Cloudflare Access (one-time PIN, one allowed email). The Worker also verifies the `Cf-Access-Jwt-Assertion` header on its own, so a request that skips Access still gets a 401. A request-level middleware (`src/start.ts`) guards every `/admin` path, and `requireAdmin` in `src/server/admin-middleware.ts` guards admin server functions. Declare admin server functions with `createServerFn().middleware([requireAdmin])` directly in the file that uses them, because the compiler only extracts handlers from literal `createServerFn` calls.

Configuration:

- `ACCESS_TEAM_DOMAIN` is a plain var in `wrangler.toml`.
- `ACCESS_AUD` is the Access application's audience tag. Set it with `bunx wrangler secret put ACCESS_AUD`.
- `ACCESS_DEV_EMAIL` is for local development only. Copy `.dev.vars.example` to `.dev.vars` and `/admin` accepts that identity, but only when the request host is `localhost`, `127.0.0.1` or `[::1]`. Never set it in production.

The Access application covers `invoices.neranjana.me/admin/*` with a single Allow policy for the owner's email and the One-time PIN login method. The Worker is attached to that hostname through `routes` in `wrangler.toml`.

## Files and business settings

Business details are edited at `/admin/settings`. The logo is stored in the R2 bucket `quotekit-files` (binding `FILES`) under `logo/<random>.<ext>`, limited to PNG, JPG or SVG and 1 MB. `/files/logo` streams the current logo and is public so invoices can show it. Create the bucket once with:

```bash
bunx wrangler r2 bucket create quotekit-files
```

## Services

Services are managed at `/admin/services`. Prices are entered as decimals (`49.99`) and stored in cents. Percentage option values are stored in basis points. Services and options are never deleted. Archiving a service sets `active` to false, and removing an option in the editor archives it, so older quotes and invoices keep their references. The list shows active services by default, and the filter also offers archived and all. The order set with the arrow buttons is stored in `sort_order`.

A service has these settings:

- A category. Categories are managed from the Categories button and can only be removed when empty.
- A pricing mode. `fixed` services use the unit price. `custom` services treat it as a default and take the real price per quote.
- Billing: one time, weekly, monthly, quarterly or yearly.
- Quantity rules (minimum, maximum, step), a taxable flag, estimated days and a short note.
- Option groups. An option can sit in a group where the client chooses one or any, and a group can be required. Options outside a group are independent add-ons.
- Required services. A service can depend on others. Self references and loops are rejected.

### Importing services

Load services from a JSON file into the local database with:

```bash
bun run services:import scripts/services.example.json --dry-run   # validate only
bun run services:import scripts/services.example.json
```

The file format is shown in `scripts/services.example.json`. Categories, option groups and required services are referenced by name. A service whose name already exists is skipped, so the command is safe to run twice. The script uses the same validation and save code as the admin page. It only writes to the local database. Create services in production through `/admin/services`.

## Email

Invoices are emailed through Resend's REST API (`src/server/email.ts`). Setup:

- Verify the sending domain in Resend and add the DKIM and SPF records it shows in Cloudflare DNS.
- Set `EMAIL_FROM` in `wrangler.toml` to an address on that domain.
- Store the key with `bunx wrangler secret put RESEND_API_KEY`. For local development put it in `.dev.vars`.

The Send to client button on an invoice emails the client a link to `/i/<token>`. A draft becomes `sent` only after Resend accepts the message, so a failed send leaves it a draft. Resending a `sent` or `overdue` invoice reuses the same link. Paid and void invoices cannot be emailed.

Each send writes an `email_log` row with status `pending` before the request, then `sent` with the Resend message ID or `failed` with the error text. The log row ID is also the idempotency key, so a retried request cannot deliver twice.

## IDs

Every database ID is a CUID (CUID2, 24 characters) created with `createId` from `src/lib/id.ts`. ESLint rejects `crypto.randomUUID`. The only fixed ID is `main`, the key of the single settings row.
