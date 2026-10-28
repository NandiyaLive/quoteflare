# Quoteflare guide

A single-user invoicing platform on Cloudflare's free tier. It has a public pricing calculator, a private dashboard for services, clients and invoices, email through Resend, and scheduled jobs. It has no payment gateways.

## Requirements

- Node.js 22.12 or newer (Vitest, Wrangler and TanStack Start require it)
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

Routes are directory based. Each route folder under `src/routes` owns its components in a `-components` folder, for example `src/routes/_site/_calculator/-components/summary.tsx`. TanStack Router ignores files and folders whose names start with `-`, so they never become routes. Components shared across routes go in `src/components/common`.

Other folders: `src/db` (Drizzle schema), `src/lib` (shared helpers), `src/server` (server-only code), `src/jobs` (scheduled jobs).

## Database

D1 (binding `DB`, database `quoteflare`) is accessed through Drizzle. The schema lives in `src/db/schema.ts`. Money is stored in cents, tax rates and percentage price modifiers in basis points (1500 = 15%), and dates as ISO 8601 text.

```bash
bun run db:generate        # write a new migration to drizzle/ after editing the schema
bun run db:migrate:local   # apply migrations to the local database
bun run db:migrate:remote  # apply migrations to the remote database
bun run db:seed            # insert sample data locally (safe to run twice)
```

`db:seed` loads settings, two clients and one invoice from `src/db/seed.sql`, then imports the service catalogue in `src/db/seed-services.json` (categories, services, options, dependencies, package categories and packages) with the same importer as `bun run services:import`. Prices are in LKR. A second run creates nothing.

## UI components

The UI uses shadcn/ui on Base UI (`components.json`, style `base-nova`). Add components with `bunx --bun shadcn@latest add <name>`; they land in `src/components/ui`. Custom components are written only when shadcn has no equivalent.

## Admin access

Everything under `/admin` sits behind Cloudflare Access (one-time PIN, one allowed email). The Worker also verifies the Access JWT on its own, so a request that skips Access still gets a 401. It reads the JWT from the `Cf-Access-Jwt-Assertion` header, or from the `CF_Authorization` cookie when the header is missing. Server function calls go to `/_serverFn/*`, which Access does not cover, so they carry the JWT only in the cookie. A request-level middleware (`src/start.ts`) guards every `/admin` path, and `requireAdmin` in `src/server/admin-middleware.ts` guards admin server functions. Declare admin server functions with `createServerFn().middleware([requireAdmin])` directly in the file that uses them, because the compiler only extracts handlers from literal `createServerFn` calls.

Configuration:

- `ACCESS_TEAM_DOMAIN` is a plain var in `wrangler.toml`.
- `ACCESS_AUD` is the Access application's audience tag. Set it with `bunx wrangler secret put ACCESS_AUD`.
- `ACCESS_DEV_EMAIL` is for local development only. Copy `.dev.vars.example` to `.dev.vars` and `/admin` accepts that identity, but only when the request host is `localhost`, `127.0.0.1` or `[::1]`. Never set it in production.

The Access application covers `<your domain>/admin/*` with a single Allow policy for your email and the One-time PIN login method. The Worker is attached to that hostname through `routes` in `wrangler.toml`.

## Production setup

One-time setup, in order:

1. Create the D1 database and R2 bucket, then put the database ID in `wrangler.toml`.
2. Apply migrations: `bun run db:migrate:remote`.
3. Set the secrets. Each command prompts for the value:

   ```bash
   bunx wrangler secret put ACCESS_AUD
   bunx wrangler secret put TURNSTILE_SECRET
   bunx wrangler secret put RESEND_API_KEY
   bunx wrangler secret put RESEND_WEBHOOK_SECRET
   bunx wrangler secret list
   ```

   `secret list` must show all four names exactly. A misspelled name is silently ignored by the Worker.

4. Set the vars in `wrangler.toml`: `ACCESS_TEAM_DOMAIN`, `TURNSTILE_SITE_KEY`, `EMAIL_FROM`, `APP_ORIGIN` and `ALLOWED_ORIGINS`.
5. Create the Access application for `/admin/*` with one Allow policy for your email, register the Resend webhook, and verify the sending domain in Resend (see the sections above).
6. Deploy with `bun run deploy`, or push to the branch connected to Workers Builds.
7. Watch the Worker with `bunx wrangler tail`.

Production starts with no sample data. Never run `db:seed` against the remote database. To start from a clean state, delete the rows in `invoice_items`, `invoices`, `quotes`, `email_log`, `recurring_schedules` and `clients`, then set `settings.next_invoice_number` to 1. Take a backup first (see Backups).

## Files and business settings

Business details are edited at `/admin/settings`. The logo is stored in the R2 bucket `quoteflare-files` (binding `FILES`) under `logo/<random>.<ext>`, limited to PNG, JPG or SVG and 1 MB. `/files/logo` streams the current logo and is public so invoices can show it. Create the bucket once with:

```bash
bunx wrangler r2 bucket create quoteflare-files
```

## Services

Services are managed at `/admin/services`. Prices are entered as decimals (`49.99`) and stored in cents. Percentage option values are stored in basis points. Services and options are never deleted. Archiving a service sets `active` to false, and removing an option in the editor archives it, so older quotes and invoices keep their references. Removing an option group deletes the group, and its options stay on the service as independent add-ons. The list shows active services by default, and the filter also offers archived and all. The order set with the arrow buttons is stored in `sort_order`.

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

The file format is shown in `scripts/services.example.json`. Categories, option groups and required services are referenced by name. An optional `packages` list names the services, quantities and options each package preselects, and the `packageCategories` entry it belongs to. A service or package whose name already exists is skipped, so the command is safe to run twice. The script uses the same validation and save code as the admin page. By default it writes to the local database. To import into the deployed database, run `bun run services:import:remote <file>`, which passes `--remote` and uses `scripts/wrangler.remote.toml`. Run it with `--dry-run` first, and take a backup before a real import. You can also create services in production through `/admin/services`.

## Email

Invoices are emailed through Resend's REST API (`src/server/email.ts`). Setup:

- Verify the sending domain in Resend and add the DKIM and SPF records it shows in Cloudflare DNS.
- Set `EMAIL_FROM` in `wrangler.toml` to an address on that domain.
- Store the key with `bunx wrangler secret put RESEND_API_KEY`. For local development put it in `.dev.vars`.

The Send to client button on an invoice emails the client a link to `/i/<token>`. A draft becomes `sent` only after Resend accepts the message, so a failed send leaves it a draft. Resending a `sent` or `overdue` invoice reuses the same link. Paid and void invoices cannot be emailed.

Each send writes an `email_log` row with status `pending` before the request, then `sent` with the Resend message ID or `failed` with the error text. The log row ID is also the idempotency key, so a retried request cannot deliver twice.

### Automatic reminders

The daily job (03:30 UTC) first marks every `sent` invoice whose due date is before today as `overdue`. This always runs. It then emails clients about unpaid invoices when "Send automatic reminders" is on in settings, which is off by default. The rules:

- `due_soon`: a `sent` invoice due today or within the next 3 days.
- `overdue_3`: an `overdue` invoice 3 to 9 days past due.
- `overdue_10`: an `overdue` invoice 10 or more days past due.

Each invoice gets each type once. A log row of that type that is not `failed` blocks a repeat, so a failed send is retried the next day but a `pending` row left by an interrupted run is not. A run sends at most 40 emails, oldest due date first, and the next run picks up the rest. Sending a reminder sets `invoices.last_reminder_at`.

Links in these emails use `APP_ORIGIN` (a var in `wrangler.toml`, and in `.dev.vars` locally), because a cron run has no request to read the origin from.

### Recurring invoices

`/admin/recurring` holds schedules: a client, line items, an interval (weekly, monthly, quarterly or yearly), the next run date and an "auto send" switch. After the reminders, the daily job creates one invoice for each active schedule whose next run date is today or earlier. The issue date is today and the due date is today plus the "Payment term (days)" setting. The tax rate and currency come from settings at run time.

The invoice, its lines, the invoice number and the new run date are written in one D1 batch that applies only while the schedule still has the run date the job read, so a repeated run cannot create a second invoice for a period. If several periods were missed, the job creates one invoice and moves the run date to the first date after today. Month steps clamp to the last day of a shorter month and do not return to the original day afterwards.

With auto send on, the invoice is emailed through the same function as the "Send to client" action, which marks it `sent` and writes an `email_log` row. If that send fails, the invoice stays a draft and the schedule still advances. Paused schedules and schedules whose client is archived are skipped. A run handles at most 5 schedules to stay within the free plan's subrequest limit, and the rest are picked up the next day.

## HTTP API

`src/server.ts` sends every path under `/api/` to a Hono app (`src/api/app.ts`). All other paths go to the TanStack Start app. Unknown `/api/` paths return a JSON 404 and unexpected errors return a generic JSON 500.

- `POST /api/webhooks/resend` updates `email_log.status` to `delivered`, `bounced` or `complained` for the row whose `provider_id` matches the event's `email_id`. The request must carry valid `svix-id`, `svix-timestamp` and `svix-signature` headers, signed with `RESEND_WEBHOOK_SECRET` and at most 5 minutes old, or it gets a 401 and nothing changes. A signed body that is not valid JSON gets a 400. A `delivered` event only replaces `sent`, so it cannot hide a bounce or complaint. Other event types and unknown email IDs get a 200 and change nothing.
- `GET /api/public/services` returns the same active catalog the calculator uses.
- `POST /api/public/quote` takes the calculator's request (`name`, `email`, optional `message`, `turnstileToken`, `selections`), verifies Turnstile, recomputes the total from current prices and stores the quote. It returns 201 with `{ ok: true, id }`, or 400 with `{ ok: false, error }`.

Browsers may call `/api/public/*` from the origins in `ALLOWED_ORIGINS`, a comma separated var in `wrangler.toml`. Other origins get no CORS headers. The webhook has no CORS headers.

Setup for the webhook:

- Add a webhook in the Resend dashboard that points at `https://<your domain>/api/webhooks/resend` and subscribes to `email.delivered`, `email.bounced` and `email.complained`.
- Copy its signing secret (starts with `whsec_`) and store it with `bunx wrangler secret put RESEND_WEBHOOK_SECRET`. Locally put it in `.dev.vars`.
- `/api/*` is not behind Cloudflare Access, so keep it off any Access policy that covers the whole domain.

## Limits and error handling

- Public inputs reject unknown fields. The quote request schema is strict, so a `total` or any other extra key returns a 400.
- `/api/public/*` and `/api/webhooks/*` reject bodies over 64 KB with a 413 before parsing them. The calculator's quote server function applies the same limit.
- Unknown pages show a 404 page and unexpected errors show a generic 500 page. Neither shows error details. Errors are logged to the Worker console, which feeds observability.
- `/robots.txt` disallows `/admin`, `/i/` and `/api/`.
- If the daily job throws, it logs `daily: job failed` with the error and rethrows, so the cron invocation shows as failed in observability.

## Backups

```bash
bun run db:export         # remote database to backups/quoteflare-<UTC timestamp>.sql
bun run db:export:local   # local database, same format
```

`backups/` is gitignored. Export files hold client and invoice data, so keep them off shared storage. Restore into an empty database with `wrangler d1 execute DB --remote --file=<export>.sql`. The export blocks the database while it runs, which takes a moment at this size. D1 Time Travel also restores the database to any point in the last 7 days:

```bash
bunx wrangler d1 time-travel info DB
bunx wrangler d1 time-travel restore DB --timestamp=<unix timestamp>
```

## Usage

Free plan limits are 100,000 Worker requests, 5 million D1 rows read and 100,000 D1 rows written per day. `bunx wrangler d1 info DB` prints the last 24 hours of D1 activity. Worker request counts are in the dashboard under Workers & Pages, quoteflare, Metrics.

## IDs

Every database ID is a CUID (CUID2, 24 characters) created with `createId` from `src/lib/id.ts`. ESLint rejects `crypto.randomUUID`. The only fixed ID is `main`, the key of the single settings row.
